import type {
    BountyEscrowPool,
    BountyEscrowWallet,
    CraftBountyEscrow,
    IntegrationLinkRequest,
    LinkedIntegration,
    SteloReceivingWallet,
    SteloTransfer,
    SteloTransferPurpose,
    SteloWallet,
} from "@brico/bindings/brico-app/types";
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Identity, Timestamp} from "spacetimedb";

import {createEscrowCache} from "../app/escrow-cache.ts";
import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {classifyTransferError, createTransferExecutor} from "./executor.ts";
import {createFundingStatusSync} from "./funding-status.ts";
import {createFundingGate, type FundingRequest} from "./funding.ts";
import {createLinkProcessor} from "./links.ts";
import {createFundingNotifier} from "./notify.ts";
import {createPayoutPlanner} from "./payouts.ts";
import {findEscrowDrift, findUnknownEscrowTransfers} from "./reconcile.ts";
import {createSteloCache} from "./stelo-cache.ts";
import type {FundingRow, SteloWrites, TransferIntentArgs} from "./writes.ts";

const quiet: Logger = {debug() {}, info() {}, warn() {}, error() {}, child: () => quiet};
const PAYER = new Identity("01".padStart(64, "0"));
const PAYEE_ACCOUNT = new Identity("02".padStart(64, "0"));
const ESCROW = 900n;
const WALLET = 101n;
const RECEIVING = 202n;
const PAYER_PLAYER = 7001n;
const NOW = 1_700_000_000_000;

const config: SteloConfig = {
    target: {label: "stelo", uri: "http://x", database: "stelofinance"},
    currencies: {"stelo-hex-coin": {ledger: "Hex Coin", escrowAccountId: ESCROW, unclaimed: {action: "rollover", to: "hex-coin", afterDays: 7}}},
    refPrefix: "bx",
    payoutIntervalMs: 86_400_000,
    minPayout: 1,
    retryBaseMs: 1000,
    retryMaxMs: 60_000,
    auth: {mode: "permanent"},
    authAlertWebhook: null,
};

const ts = (ms: number) => new Timestamp(BigInt(ms) * 1000n);

/** Records every write instead of performing it. */
function fakeWrites() {
    const calls: string[] = [];
    const intents: TransferIntentArgs[] = [];
    const fundingRows: FundingRow[] = [];
    const ok = (what: string) => async () => void calls.push(what);
    const writes: SteloWrites = {
        recordIntent: async args => void (intents.push(args), calls.push(`intent ${args.purpose.tag}`)),
        settleTransfer: async (id, steloId) => void calls.push(`settle ${id} ${steloId}`),
        failTransfer: async (id, reason) => void calls.push(`fail ${id} ${reason}`),
        raiseFromRefundDue: async craftId => void calls.push(`raise ${craftId}`),
        closeCraftEscrow: async craftId => void calls.push(`close ${craftId}`),
        releaseOverlap: ok("overlap"),
        syncUnclaimed: async (_p, payee) => void calls.push(`sync-unclaimed ${payee}`),
        settleUnclaimed: async (_p, payee, _c, _f, rollTo) => void calls.push(`settle-unclaimed ${payee} ${rollTo}`),
        setPayoutSchedule: ok("schedule"),
        setCurrencyPolicy: async (currency, action, rollTo, afterDays) => void calls.push(`policy ${currency} ${action} ${rollTo ?? "-"} ${afterDays}`),
        noteLinkExternal: async (code, accountId) => void calls.push(`note-external ${code} ${accountId}`),
        noteLinkStatus: async (code, reason, username) => void calls.push(`note-status ${code} ${reason} ${username ?? "-"}`),
        registerWallet: ok("register"),
        setWalletStatus: async (linkId, canPull, verified) => void calls.push(`wallet-status ${linkId} ${canPull} ${verified}`),
        setFunding: async row => void (fundingRows.push(row), calls.push(`funding ${row.craftId} ${row.state} ${row.reason ?? "-"}`)),
        clearFunding: async craftId => void calls.push(`clear-funding ${craftId}`),
        postFundingNotification: async (_account, payload) => void calls.push(`alert ${payload.kind} ${payload.role}`),
    };
    return {writes, calls, intents, fundingRows};
}

/** Stelo as the bot sees it: the escrow wallet and one payer wallet, both on a scale-3 ledger. */
function steloWorld(options: {walletRole?: string; walletBalance?: bigint} = {}) {
    const cache = createSteloCache();
    for (const [id, role, balance] of [[ESCROW, "Write", 0n], [WALLET, options.walletRole ?? "Write", options.walletBalance ?? 1_000_000n], [RECEIVING, "Read", 0n]] as const) {
        cache.accounts.insert({accountId: id, address: `A${id}`, kind: {tag: "Debit"}, balance, ledgerId: 1n, ledgerName: "Hex Coin", ledgerScale: 3, role: {tag: role}});
    }
    // The payer's wallet is administered by a user whose BitCraft player (`PAYER_PLAYER`) belongs to `PAYER`.
    cache.members.insert({id: 1n, accountId: WALLET, memberId: {toHexString: () => "payer-user"}, kind: {tag: "User"}, role: {tag: "Owner"}});
    cache.users.insert({id: {toHexString: () => "payer-user"}, bitcraftPlayerId: PAYER_PLAYER});
    return {cache, stelo: Object.assign(Object.create(cache), {isLive: true, createTransfer: async () => {}})};
}

const payerPlayers = () => new Map([[PAYER_PLAYER, PAYER]]);

const link = (id: bigint, externalId: string): LinkedIntegration => ({
    id, accountIdentity: PAYER, provider: "stelo", externalId, externalHandle: undefined, linkedAt: ts(NOW), revokedAt: undefined,
});

function escrowWorld() {
    const escrow = createEscrowCache();
    escrow.linkedIntegration.insert(link(1n, WALLET.toString()));
    escrow.steloWallet.insert({linkId: 1n, accountIdentity: PAYER, currency: "stelo-hex-coin"} as SteloWallet);
    return escrow;
}

const request = (overrides: Partial<FundingRequest> = {}): FundingRequest => ({
    ratioNumerator: 1n, ratioDenominator: 20n, currency: "stelo-hex-coin", payer: PAYER, fundingLinkId: 1n, ...overrides,
});

function openEscrow(overrides: Partial<CraftBountyEscrow> = {}): CraftBountyEscrow {
    return {
        id: 1n, craftId: 7n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", fundingLinkId: 1n, fundingAccountId: WALLET,
        heldAmount: 20n, releasedAmount: 0n, ratioNumerator: 1n, ratioDenominator: 20n, effortCovered: 400n, effortPriced: 0n,
        accruedNumerator: 0n, accruedDenominator: 1n, heldAt: ts(NOW), updatedAt: ts(NOW), closedAt: undefined, ...overrides,
    };
}

function transfer(id: bigint, purpose: SteloTransferPurpose, fields: Partial<SteloTransfer> = {}): SteloTransfer {
    return {
        id, ref: `bx${id}`, currency: "stelo-hex-coin", payerAccountIdentity: PAYER, fromAccountId: WALLET, toAccountId: ESCROW,
        amount: 20n, steloAmount: 20_000n, purpose, state: {tag: "Pending"}, steloTransferId: undefined, failureReason: undefined,
        createdAt: ts(NOW), settledAt: undefined, ...fields,
    };
}

const hold = (craftId: bigint): SteloTransferPurpose => ({
    tag: "Hold", value: {craftId, fundingLinkId: 1n, ratioNumerator: 1n, ratioDenominator: 20n, effortCovered: 400n},
});

describe("classifyTransferError", () => {
    it("maps Stelo's rejections to terminal failures and everything else to a retry", () => {
        assert.equal(classifyTransferError(new Error("invalid balance")), "insufficient-funds");
        assert.equal(classifyTransferError(new Error("insufficient account permission")), "no-permission");
        assert.equal(classifyTransferError(new Error("sending account not found")), "invalid-account");
        assert.equal(classifyTransferError(new Error("incompatible account ledgers")), "invalid-account");
        assert.equal(classifyTransferError(new Error("connection reset")), null);
        assert.equal(classifyTransferError(new Error("unavailable: stelo connection is not live")), null);
    });
});

describe("transfer executor", () => {
    function setup(sendError?: Error) {
        const {cache} = steloWorld();
        const sent: string[] = [];
        const {writes, calls} = fakeWrites();
        let now = NOW;
        const stelo = Object.assign(Object.create(cache), {
            isLive: true,
            createTransfer: async (args: {ref: string}) => {
                sent.push(args.ref);
                if (sendError) throw sendError;
            },
        });
        const executor = createTransferExecutor({log: quiet, stelo, writes, now: () => now, resendAfterMs: 1000});
        return {cache, sent, calls, executor, advance: (ms: number) => void (now += ms)};
    }
    const settle = () => new Promise(resolve => setImmediate(resolve));

    it("sends a pending intent once, then again only after the resend delay", () => {
        const {sent, executor, advance} = setup();
        const pending = [transfer(1n, hold(7n))];
        executor.run(pending);
        executor.run(pending);
        assert.deepEqual(sent, ["bx1"]);
        advance(1500);
        executor.run(pending);
        assert.deepEqual(sent, ["bx1", "bx1"]);
    });

    it("settles instead of sending when the posted transfer is already visible (crash resume)", async () => {
        const {cache, sent, calls, executor} = setup();
        cache.transferRows.insert({id: 55n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 20_000n, state: {tag: "Posted"}, memo: "bx1"});
        executor.run([transfer(1n, hold(7n))]);
        await settle();
        assert.deepEqual(sent, []);
        assert.deepEqual(calls, ["settle 1 55"]);
    });

    it("ignores a posted transfer whose memo matches but accounts or amount do not", async () => {
        const {cache, sent, calls, executor} = setup();
        cache.transferRows.insert({id: 55n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 1n, state: {tag: "Posted"}, memo: "bx1"});
        cache.transferRows.insert({id: 56n, debitAccountId: WALLET, creditAccountId: ESCROW, postedAmount: 20_000n, state: {tag: "Posted"}, memo: "bx1"});
        executor.run([transfer(1n, hold(7n))]);
        await settle();
        assert.deepEqual(sent, ["bx1"]);
        assert.deepEqual(calls, []);
    });

    it("fails the intent when Stelo rejects it for good, and keeps it pending on a transient error", async () => {
        const rejected = setup(new Error("invalid balance"));
        rejected.executor.run([transfer(1n, hold(7n))]);
        await settle();
        assert.deepEqual(rejected.calls, ["fail 1 insufficient-funds"]);

        const transient = setup(new Error("timed out"));
        transient.executor.run([transfer(1n, hold(7n))]);
        await settle();
        assert.deepEqual(transient.calls, []);
    });

    it("sends nothing while paused but still settles what already posted", async () => {
        const {cache, sent, calls, executor} = setup();
        executor.paused = true;
        cache.transferRows.insert({id: 55n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 20_000n, state: {tag: "Posted"}, memo: "bx1"});
        executor.run([transfer(1n, hold(7n)), transfer(2n, hold(8n))]);
        await settle();
        assert.deepEqual(sent, []);
        assert.deepEqual(calls, ["settle 1 55"]);
    });
});

describe("funding gate", () => {
    function setup(world = steloWorld(), escrow = escrowWorld(), now = NOW) {
        const {writes, calls, intents} = fakeWrites();
        const gate = createFundingGate({config, escrow, stelo: world.stelo, playerAccounts: payerPlayers, writes, log: quiet, now: () => now});
        return {gate, escrow, calls, intents};
    }

    it("holds ceil(ratio × effort) from the named wallet, in raw Stelo units, and waits", () => {
        const {gate, calls, intents} = setup();
        assert.equal(gate.prepare(7n, request(), 401n), "wait");
        assert.deepEqual(calls, ["intent Hold"]);
        assert.equal(intents[0].amount, 21n);
        assert.equal(intents[0].steloAmount, 21_000n);
        assert.equal(intents[0].fromAccountId, WALLET);
        assert.equal(intents[0].toAccountId, ESCROW);
        // A second tick before the intent echoes back must not repeat it.
        assert.equal(gate.prepare(7n, request(), 401n), "wait");
        assert.deepEqual(calls, ["intent Hold"]);
    });

    it("does not hold while an intent is pending, or when the wallet can't be pulled from or isn't the payer's", () => {
        const escrow = escrowWorld();
        escrow.steloTransfer.insert(transfer(1n, hold(7n)));
        const pending = setup(steloWorld(), escrow);
        assert.equal(pending.gate.prepare(7n, request(), 400n), "wait");
        assert.deepEqual(pending.calls, []);

        const readOnly = setup(steloWorld({walletRole: "Read"}));
        assert.equal(readOnly.gate.prepare(7n, request(), 400n), "wait");
        assert.deepEqual(readOnly.calls, []);

        const wrongPayer = setup();
        assert.equal(wrongPayer.gate.prepare(7n, request({payer: PAYEE_ACCOUNT}), 400n), "wait");
        const noWallet = setup();
        assert.equal(noWallet.gate.prepare(7n, request({fundingLinkId: undefined}), 400n), "wait");
        assert.deepEqual([wrongPayer.calls, noWallet.calls], [[], []]);
    });

    it("backs off after a failed hold, doubling per failure, from the stored history", () => {
        const escrow = escrowWorld();
        escrow.steloTransfer.insert(transfer(1n, hold(7n), {state: {tag: "Failed"}, settledAt: ts(NOW)}));
        const early = setup(steloWorld(), escrow, NOW + 500);
        assert.equal(early.gate.prepare(7n, request(), 400n), "wait");
        assert.deepEqual(early.calls, []);
        const later = setup(steloWorld(), escrow, NOW + 1500);
        later.gate.prepare(7n, request(), 400n);
        assert.deepEqual(later.calls, ["intent Hold"]);

        escrow.steloTransfer.insert(transfer(2n, hold(7n), {state: {tag: "Failed"}, settledAt: ts(NOW)}));
        const doubled = setup(steloWorld(), escrow, NOW + 1500);
        doubled.gate.prepare(7n, request(), 400n);
        assert.deepEqual(doubled.calls, [], "two failures wait 2s, not 1s");
    });

    it("is ready when the hold secures the ratio, and keeps a hold held for another payer", () => {
        const escrow = escrowWorld();
        escrow.craftBountyEscrow.insert(openEscrow());
        const {gate, calls} = setup(steloWorld(), escrow);
        assert.equal(gate.prepare(7n, request(), 400n), "ready");
        assert.equal(gate.prepare(7n, request({ratioNumerator: 1n, ratioDenominator: 30n}), 400n), "ready");
        assert.equal(gate.prepare(7n, request({payer: PAYEE_ACCOUNT}), 400n), "keep");
        assert.deepEqual(calls, []);
    });

    it("tops up a raise from the craft's own wallet, re-reserving refund due first", () => {
        const escrow = escrowWorld();
        escrow.craftBountyEscrow.insert(openEscrow({accruedNumerator: 5n, effortPriced: 100n}));
        // 1/20 -> 1/15 with 300 effort left needs 5 + 20 = 25 against 20 held: 5 more.
        escrow.escrowWallet.insert({id: 1n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", fundingAccountId: WALLET, refundDue: 2n, updatedAt: ts(NOW)} as BountyEscrowWallet);
        const {gate, calls, intents} = setup(steloWorld(), escrow);
        assert.equal(gate.prepare(7n, request({ratioDenominator: 15n}), 400n), "wait");
        assert.deepEqual(calls, ["intent TopUp"]);
        assert.equal(intents[0].amount, 3n);
        assert.equal(intents[0].purpose.tag === "TopUp" && intents[0].purpose.value.reserved, 2n);
        assert.equal(intents[0].fromAccountId, WALLET);
    });

    it("raises without a transfer when refund due already covers it", () => {
        const escrow = escrowWorld();
        escrow.craftBountyEscrow.insert(openEscrow({accruedNumerator: 5n, effortPriced: 100n}));
        escrow.escrowWallet.insert({id: 1n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", fundingAccountId: WALLET, refundDue: 9n, updatedAt: ts(NOW)} as BountyEscrowWallet);
        const {gate, calls} = setup(steloWorld(), escrow);
        assert.equal(gate.prepare(7n, request({ratioDenominator: 15n}), 400n), "wait");
        assert.deepEqual(calls, ["raise 7"]);
    });
});

describe("funding status", () => {
    function setup(world = steloWorld(), escrow = escrowWorld(), now = NOW) {
        const {writes, calls} = fakeWrites();
        const gate = createFundingGate({config, escrow, stelo: world.stelo, playerAccounts: payerPlayers, writes, log: quiet, now: () => now});
        return {gate, escrow, calls, writes};
    }

    it("is waiting with the reason prepare hit, then funding while the hold is pending", () => {
        const readOnly = setup(steloWorld({walletRole: "Read"}));
        readOnly.gate.prepare(7n, request(), 400n);
        assert.deepEqual(readOnly.gate.status(7n, request()), {state: "waiting", reason: "cannot-pull"});

        const noWallet = setup();
        noWallet.gate.prepare(7n, request({fundingLinkId: undefined}), 400n);
        assert.deepEqual(noWallet.gate.status(7n, request({fundingLinkId: undefined})), {state: "waiting", reason: "no-wallet"});

        const escrow = escrowWorld();
        escrow.steloTransfer.insert(transfer(1n, hold(7n)));
        const pending = setup(steloWorld(), escrow);
        pending.gate.prepare(7n, request(), 400n);
        assert.deepEqual(pending.gate.status(7n, request()), {state: "funding", transferId: 1n});
    });

    it("is failed with the transfer's reason during backoff, and funded once the hold secures the rate", () => {
        const escrow = escrowWorld();
        escrow.steloTransfer.insert(transfer(1n, hold(7n), {state: {tag: "Failed"}, failureReason: "insufficient-funds", settledAt: ts(NOW)}));
        const failed = setup(steloWorld(), escrow, NOW + 500);
        failed.gate.prepare(7n, request(), 400n);
        assert.deepEqual(failed.gate.status(7n, request()), {state: "failed", reason: "insufficient-funds", transferId: 1n});

        const held = escrowWorld();
        held.craftBountyEscrow.insert(openEscrow());
        const funded = setup(steloWorld(), held);
        funded.gate.prepare(7n, request(), 400n);
        assert.deepEqual(funded.gate.status(7n, request()), {state: "funded"});
        funded.gate.prepare(7n, request({ratioDenominator: 15n}), 400n);
        assert.equal(funded.gate.status(7n, request({ratioDenominator: 15n})).state, "waiting", "a raise is not secured yet");
    });

    const subject = {source: "rule", ruleId: "r1", currency: "stelo-hex-coin", payer: PAYER, fundingLinkId: 1n, ratioNumerator: 1n, ratioDenominator: 20n} as const;
    const settle = () => new Promise(resolve => setTimeout(resolve, 10));

    it("writes a row only when it would change, and clears a row that has no intent", async () => {
        const escrow = escrowWorld();
        const {writes, calls} = setup();
        const sync = createFundingStatusSync({escrow, writes, notifier: undefined, log: quiet, holdMs: 0});

        sync.report(7n, subject, {state: "waiting", reason: "cannot-pull"});
        await settle();
        assert.deepEqual(calls, ["funding 7 waiting cannot-pull"]);

        escrow.craftBountyFunding.insert({
            craftId: 7n, payerAccountIdentity: PAYER, source: "rule", ruleId: "r1", currency: "stelo-hex-coin", fundingLinkId: 1n,
            ratioNumerator: 1n, ratioDenominator: 20n, state: "waiting", reason: "cannot-pull", transferId: undefined, updatedAt: ts(NOW),
        });
        sync.report(7n, subject, {state: "waiting", reason: "cannot-pull"});
        sync.clear(8n);
        await settle();
        assert.equal(calls.length, 1, "an unchanged row and an unknown craft write nothing");

        sync.clear(7n);
        await settle();
        assert.deepEqual(calls.slice(1), ["clear-funding 7"]);
    });

    it("alerts once on the edge into failed or an actionable waiting reason, never on a repeat or a benign wait", async () => {
        const escrow = escrowWorld();
        const {writes, calls} = setup();
        const notifier = createFundingNotifier({app: {connection: null} as never, escrow, stelo: steloWorld().cache, writes, log: quiet});
        const sync = createFundingStatusSync({escrow, writes, notifier, log: quiet, holdMs: 0});

        sync.report(7n, subject, {state: "waiting", reason: "stelo-unavailable"});
        await settle();
        assert.deepEqual(calls, ["funding 7 waiting stelo-unavailable"], "stelo-unavailable is not actionable");

        sync.report(7n, subject, {state: "failed", reason: "insufficient-funds", transferId: 1n});
        await settle();
        assert.deepEqual(calls.slice(1), ["funding 7 failed insufficient-funds", "alert funding-failed payer"]);
    });

    it("posts one alert per wallet and reason across crafts and retries, and again after the reason changes or the wallet recovers", async () => {
        const escrow = escrowWorld();
        const {writes, calls} = setup();
        const notifier = createFundingNotifier({app: {connection: null} as never, escrow, stelo: steloWorld().cache, writes, log: quiet});
        const sync = createFundingStatusSync({escrow, writes, notifier, log: quiet, holdMs: 0});
        const alerts = () => calls.filter(call => call.startsWith("alert")).length;
        const failed = (reason: "insufficient-funds" | "cannot-pull") => ({state: "failed", reason, transferId: 1n}) as const;

        sync.report(7n, subject, failed("insufficient-funds"));
        sync.report(8n, subject, failed("insufficient-funds"));
        await settle();
        assert.equal(alerts(), 1, "two crafts on one wallet share an alert");

        // A retry cycle: funding, then failing again with the same reason.
        sync.report(7n, subject, {state: "funding", transferId: 2n});
        await settle();
        sync.report(7n, subject, failed("insufficient-funds"));
        await settle();
        assert.equal(alerts(), 1, "a retry with the same reason stays silent");

        sync.report(7n, subject, failed("cannot-pull"));
        await settle();
        assert.equal(alerts(), 2, "a new reason posts");
        sync.report(7n, subject, failed("insufficient-funds"));
        await settle();
        assert.equal(alerts(), 3, "going back to the earlier reason posts again");

        sync.report(7n, subject, {state: "funded"});
        await settle();
        sync.report(8n, subject, failed("insufficient-funds"));
        await settle();
        assert.equal(alerts(), 4, "a recovered wallet alerts on its next failure");
    });
});

describe("payout planner", () => {
    function pool(overrides: Partial<BountyEscrowPool> = {}): BountyEscrowPool {
        return {
            id: 1n, payerAccountIdentity: PAYER, payeePlayerId: 5001n, currency: "stelo-hex-coin", fundingAccountId: WALLET,
            total: 7n, remainderNumerator: 3n, remainderDenominator: 20n, guaranteedTotal: 6n,
            guaranteedRemainderNumerator: 1n, guaranteedRemainderDenominator: 2n, paidEscrow: 0n, paidDirect: 0n, pulledExtras: 0n,
            unclaimedSince: undefined, updatedAt: ts(NOW), ...overrides,
        };
    }

    function setup(options: {routable?: boolean; now?: number; schedule?: number; world?: ReturnType<typeof steloWorld>} = {}) {
        const escrow = escrowWorld();
        const world = options.world ?? steloWorld();
        if (options.routable !== false) {
            escrow.linkedIntegration.insert(link(3n, RECEIVING.toString()));
            escrow.steloReceivingWallet.insert({id: 1n, accountIdentity: PAYEE_ACCOUNT, currency: "stelo-hex-coin", linkId: 3n} as SteloReceivingWallet);
        }
        if (options.schedule !== undefined) escrow.payoutSchedule.insert({id: 0, intervalMicros: 86_400_000_000n, lastSweepAt: ts(options.schedule)});
        const {writes, calls, intents} = fakeWrites();
        const planner = createPayoutPlanner({
            config, escrow, playerAccounts: () => new Map([[5001n, PAYEE_ACCOUNT], [PAYER_PLAYER, PAYER]]), stelo: world.stelo, writes, log: quiet, now: () => options.now ?? NOW,
        });
        return {planner, escrow, calls, intents};
    }

    const extrasPull = (id: bigint, state: SteloTransfer["state"]) =>
        transfer(id, {tag: "Extras", value: {payeePlayerId: 5001n, fundingAccountId: WALLET}}, {fromAccountId: WALLET, toAccountId: ESCROW, amount: 1n, steloAmount: 1000n, state});

    it("pulls the loyalty extras into escrow first, then pays the guaranteed part plus the extras in one transfer", () => {
        const {planner, escrow, calls, intents} = setup();
        escrow.escrowPool.insert(pool());
        planner.sweep();
        assert.deepEqual(calls.sort(), ["intent Extras", "schedule"]);
        assert.deepEqual([intents[0].fromAccountId, intents[0].toAccountId, intents[0].amount, intents[0].steloAmount], [WALLET, ESCROW, 1n, 1000n]);

        // Once the pull has settled the books show the extras in escrow, and the single payout carries them.
        escrow.steloTransfer.insert(extrasPull(10n, {tag: "Settled"}));
        escrow.escrowPool.update(pool(), pool({pulledExtras: 1n}));
        planner.resume(true);
        const payout = intents[1];
        assert.deepEqual([payout.fromAccountId, payout.toAccountId, payout.amount], [ESCROW, RECEIVING, 7n]);
        assert.deepEqual(payout.purpose, {tag: "Payout", value: {payeePlayerId: 5001n, fundingAccountId: WALLET, extras: 1n}});
    });

    it("still pays the guaranteed part when the extras can't be pulled, leaving them owed", () => {
        const {planner, escrow, intents} = setup({world: steloWorld({walletBalance: 0n})});
        escrow.escrowPool.insert(pool());
        planner.sweep();
        assert.deepEqual(intents.map(i => [i.purpose.tag, i.amount]), [["Payout", 6n]]);
    });

    it("pays the guaranteed part once a failed extras pull is seen, and waits while it is pending", () => {
        const {planner, escrow, intents} = setup();
        escrow.escrowPool.insert(pool());
        planner.sweep();
        escrow.steloTransfer.insert(extrasPull(10n, {tag: "Pending"}));
        planner.resume(true);
        assert.equal(intents.length, 1, "nothing is paid while the pull is pending");

        escrow.steloTransfer.update(extrasPull(10n, {tag: "Pending"}), extrasPull(10n, {tag: "Failed"}));
        planner.resume(true);
        assert.deepEqual(intents.slice(1).map(i => [i.purpose.tag, i.amount]), [["Payout", 6n]]);
    });

    it("pays out extras already in escrow that no payout is carrying (restart)", () => {
        const {planner, escrow, intents} = setup();
        escrow.escrowPool.insert(pool({pulledExtras: 1n}));
        planner.resume(true);
        assert.deepEqual(intents.map(i => [i.purpose.tag, i.amount]), [["Payout", 7n]]);
    });

    it("does nothing before the interval has passed", () => {
        const {planner, escrow, calls} = setup({schedule: NOW - 1000});
        escrow.escrowPool.insert(pool());
        planner.sweep();
        assert.deepEqual(calls, []);
    });

    it("flags an unroutable payee, then closes it out by rolling over once the policy's days have passed", () => {
        const first = setup({routable: false});
        first.escrow.escrowPool.insert(pool());
        first.planner.sweep();
        assert.deepEqual(first.calls, ["sync-unclaimed 5001", "schedule"]);

        const later = setup({routable: false, now: NOW + 8 * 86_400_000});
        later.escrow.escrowPool.insert(pool({unclaimedSince: ts(NOW)}));
        later.planner.sweep();
        assert.deepEqual(later.calls, ["settle-unclaimed 5001 hex-coin", "schedule"]);

        const tooSoon = setup({routable: false, now: NOW + 3 * 86_400_000});
        tooSoon.escrow.escrowPool.insert(pool({unclaimedSince: ts(NOW)}));
        tooSoon.planner.sweep();
        assert.deepEqual(tooSoon.calls, ["schedule"]);
    });

    it("refunds released headroom to the wallet that funded it, minus what is already being refunded", () => {
        const {planner, escrow, intents} = setup();
        escrow.escrowWallet.insert({id: 1n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", fundingAccountId: WALLET, refundDue: 5n, updatedAt: ts(NOW)} as BountyEscrowWallet);
        escrow.steloTransfer.insert(transfer(9n, {tag: "Refund", value: {fundingAccountId: WALLET}}, {amount: 2n, fromAccountId: ESCROW, toAccountId: WALLET}));
        planner.refunds();
        assert.deepEqual(intents.map(i => [i.amount, i.fromAccountId, i.toAccountId]), [[3n, ESCROW, WALLET]]);
    });

    it("asks the module to reclassify a direct payment that became guaranteed", () => {
        const {planner, escrow, calls} = setup();
        escrow.escrowPool.insert(pool({guaranteedTotal: 7n, paidEscrow: 6n, paidDirect: 1n}));
        planner.overlaps();
        assert.deepEqual(calls, ["overlap"]);
    });
});

describe("reconcile", () => {
    it("matches the wallet against the journal plus transfers posted but not yet settled", () => {
        const {cache} = steloWorld();
        const escrow = createEscrowCache();
        escrow.escrowJournal.insert({id: 1n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", kind: "hold", amount: 20n, fundingAccountId: WALLET, craftId: 7n, payeePlayerId: undefined, transferId: 1n, createdAt: ts(NOW)});
        assert.deepEqual(findEscrowDrift(config, escrow.state, cache).map(d => [d.expected, d.actual]), [[20_000n, 0n]]);

        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 20_000n});
        assert.deepEqual(findEscrowDrift(config, escrow.state, cache), []);

        // A payout posted on Stelo but not yet settled in the books has already left the wallet.
        escrow.steloTransfer.insert(transfer(2n, {tag: "Payout", value: {payeePlayerId: 5001n, fundingAccountId: WALLET, extras: 0n}}, {fromAccountId: ESCROW, toAccountId: RECEIVING, amount: 6n, steloAmount: 6000n}));
        cache.transferRows.insert({id: 70n, debitAccountId: RECEIVING, creditAccountId: ESCROW, postedAmount: 6000n, state: {tag: "Posted"}, memo: "bx2"});
        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 14_000n});
        assert.deepEqual(findEscrowDrift(config, escrow.state, cache), []);
    });

    it("flags transfers on an escrow wallet that no intent explains", () => {
        const {cache} = steloWorld();
        const escrow = createEscrowCache();
        escrow.steloTransfer.insert(transfer(1n, hold(7n)));
        cache.transferRows.insert({id: 1n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 20_000n, state: {tag: "Posted"}, memo: "bx1"});
        cache.transferRows.insert({id: 2n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 5n, state: {tag: "Posted"}, memo: "hello"});
        cache.transferRows.insert({id: 3n, debitAccountId: 1n, creditAccountId: 2n, postedAmount: 5n, state: {tag: "Posted"}, memo: undefined});
        assert.deepEqual(findUnknownEscrowTransfers(config, escrow.state, cache).map(t => t.id), [2n]);
    });

    it("does not count a stray deposit as drift, and nets its return", () => {
        const {cache} = steloWorld();
        const escrow = createEscrowCache();
        escrow.escrowJournal.insert({id: 1n, payerAccountIdentity: PAYER, currency: "stelo-hex-coin", kind: "hold", amount: 20n, fundingAccountId: WALLET, craftId: 7n, payeePlayerId: undefined, transferId: 1n, createdAt: ts(NOW)});
        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 20_000n});

        cache.transferRows.insert({id: 80n, debitAccountId: ESCROW, creditAccountId: WALLET, postedAmount: 500n, state: {tag: "Posted"}, memo: undefined});
        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 20_500n});
        assert.deepEqual(findEscrowDrift(config, escrow.state, cache), []);

        cache.transferRows.insert({id: 81n, debitAccountId: WALLET, creditAccountId: ESCROW, postedAmount: 500n, state: {tag: "Posted"}, memo: "returned"});
        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 20_000n});
        assert.deepEqual(findEscrowDrift(config, escrow.state, cache), []);

        // Real drift on top of the stray transfers is still caught.
        cache.accounts.update(cache.account(ESCROW)!, {...cache.account(ESCROW)!, balance: 19_000n});
        assert.equal(findEscrowDrift(config, escrow.state, cache).length, 1);
    });

    it("does not let a copied memo hide a transfer from a different account", () => {
        const {cache} = steloWorld();
        const escrow = createEscrowCache();
        escrow.steloTransfer.insert(transfer(1n, hold(7n)));
        cache.transferRows.insert({id: 90n, debitAccountId: ESCROW, creditAccountId: 999n, postedAmount: 20_000n, state: {tag: "Posted"}, memo: "bx1"});
        assert.deepEqual(findUnknownEscrowTransfers(config, escrow.state, cache).map(t => t.id), [90n]);
    });
});

describe("funding authorization", () => {
    it("waits with not-authorized when the linker no longer administers the wallet", () => {
        const world = steloWorld();
        world.cache.members.delete({id: 1n, accountId: WALLET, memberId: {toHexString: () => "payer-user"}, kind: {tag: "User"}, role: {tag: "Owner"}});
        const {writes, calls} = fakeWrites();
        const gate = createFundingGate({config, escrow: escrowWorld(), stelo: world.stelo, playerAccounts: payerPlayers, writes, log: quiet, now: () => NOW});
        assert.equal(gate.prepare(7n, request(), 400n), "wait");
        assert.deepEqual(calls, []);
        assert.deepEqual(gate.status(7n, request()), {state: "waiting", reason: "not-authorized"});
    });
});

describe("link processor", () => {
    const settle = () => new Promise(resolve => setTimeout(resolve, 10));

    function setup(request: Partial<IntegrationLinkRequest>) {
        const world = steloWorld();
        world.cache.ledgers.insert({id: 1n, name: "Hex Coin", scale: 3});
        const escrow = createEscrowCache();
        const stelo = Object.assign(Object.create(world.cache), {
            isLive: true,
            searchAddress: async () => [{accountId: 303n, address: "FAR", ledgerId: 1n, kind: {tag: "Debit"}, primaryUsername: "Far"}],
            lookupAccount: async () => undefined,
        });
        const {writes, calls} = fakeWrites();
        const processor = createLinkProcessor({config, escrow, playerAccounts: payerPlayers, stelo, writes, log: quiet, holdMs: 0});
        const row = {
            id: 1n, code: "c1", provider: "stelo", accountIdentity: PAYER, externalId: undefined, externalHandle: undefined,
            candidateAddress: "FAR", pendingReason: undefined, unverified: true, matchedUsername: undefined, confirmed: false, ...request,
        } as IntegrationLinkRequest;
        escrow.integrationLinkRequest.insert(row);
        return {processor, escrow, calls, row};
    }

    it("matches an unverified address in the directory, shows the username, and finalizes only after confirmation", async () => {
        const {processor, escrow, calls, row} = setup({});
        processor.run();
        await settle();
        processor.run();
        await settle();
        assert.deepEqual(calls, ["note-status c1 confirm-unverified Far"]);

        escrow.integrationLinkRequest.update(row, {...row, pendingReason: "confirm-unverified", matchedUsername: "Far", confirmed: true});
        processor.run();
        await settle();
        assert.deepEqual(calls.slice(1), ["note-external c1 303"]);
    });

    it("reports a failure reason instead of a match for a verified-only request the bot cannot see", async () => {
        const {processor, calls} = setup({unverified: false});
        processor.run();
        await settle();
        assert.deepEqual(calls, ["note-status c1 bot-not-member -"]);
    });
});
