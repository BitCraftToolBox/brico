/**
 * funding.ts — the funding gate: before an escrowed bounty is assigned, the money behind it must be
 * held. Each call either confirms the craft's hold covers the bounty, or drives the transfer that
 * will (a hold, or a top-up for a raise) and tells the caller to wait.
 */
import type {CraftBountyEscrow, SteloTransfer} from "@brico/bindings/brico-app/types";
import {ceilRatio, escrowRequired, reduceRatio} from "@brico/crafts/entitlement";
import {FUNDING_REASONS, type FundingReason, type FundingState} from "@brico/crafts/stelo";
import type {Identity} from "spacetimedb";
import type {EscrowCache} from "../app/escrow-cache.ts";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {isPending, reservableRefundDue, timestampMs, toSteloAmount} from "./books.ts";
import {createInFlight} from "./inflight.ts";
import {canFundFrom} from "./link-verify.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {SteloWrites} from "./writes.ts";

/** What the engine resolved for a craft and wants assigned. */
export interface FundingRequest {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    payer: Identity;
    /** The rule's or override's paying wallet (`linked_integration.id`). */
    fundingLinkId: bigint | undefined;
}

/**
 * - `ready`: the craft's hold secures the requested ratio; assign it.
 * - `keep`: the craft is held for a different payer or currency; leave its assignment as it is.
 * - `wait`: not funded (yet); do not assign.
 */
export type FundingDecision = "ready" | "keep" | "wait";

/** Why a craft's escrowed bounty is or isn't funded, as shown to its payer. */
export interface FundingStatus {
    state: FundingState;
    reason?: FundingReason;
    /** The in-flight or last failed hold/top-up. */
    transferId?: bigint;
}

export interface FundingGate {
    /** The craft's funding status for `request`, as of the latest `prepare` call. */
    status(craftId: bigint, request: FundingRequest): FundingStatus;
    /**
     * `effortCovered` is the effort a fresh hold must cover (the craft's total effort minus what the
     * assignment will protect as pre-bounty). Safe to call every tick: at most one hold or top-up
     * is in flight per craft, and failures back off.
     */
    prepare(craftId: bigint, request: FundingRequest, effortCovered: bigint): FundingDecision;
}

export interface FundingDeps {
    config: SteloConfig;
    escrow: EscrowCache;
    stelo: SteloReadModel & {readonly isLive: boolean};
    /** BitCraft player id -> brico account, from active `bitcraft-ea2` links. */
    playerAccounts(): ReadonlyMap<bigint, Identity>;
    writes: SteloWrites;
    log: Logger;
    now(): number;
}

export function createFundingGate(deps: FundingDeps): FundingGate {
    const {config, escrow, stelo, writes, log} = deps;
    const inFlight = createInFlight(log);

    /** Whether the bot may pull from `accountId` for `payer`: it holds Write and a linked player of theirs still administers the wallet. */
    function pullCheck(payer: Identity, accountId: bigint): "ok" | "cannot-pull" | "not-authorized" {
        const players = new Set<bigint>();
        for (const [playerId, owner] of deps.playerAccounts()) if (owner.isEqual(payer)) players.add(playerId);
        return canFundFrom(stelo, accountId, players);
    }
    // `craft:reason` pairs already logged, so a stuck craft doesn't log every tick.
    const reported = new Set<string>();
    // Why each craft's latest `prepare` could not proceed.
    const waiting = new Map<bigint, FundingReason>();

    function report(craftId: bigint, reason: FundingReason, extra: Record<string, string> = {}): void {
        waiting.set(craftId, reason);
        const key = `${craftId}:${reason}`;
        if (reported.has(key)) return;
        reported.add(key);
        log.info(`funding waiting: ${reason}`, {craftId: craftId.toString(), ...extra});
    }

    const track = (key: string, call: Promise<void>, what: string, craftId: bigint) =>
        inFlight.track(key, call, what, {craftId: craftId.toString()});

    /** Failed holds/top-ups of this craft: how many, and the latest one. */
    function failuresOf(craftId: bigint, tag: "Hold" | "TopUp"): {failures: number; latestAt: number; latest: SteloTransfer | undefined} {
        let failures = 0;
        let latestAt = 0;
        let latest: SteloTransfer | undefined;
        for (const transfer of escrow.state.transfers.values()) {
            if (transfer.state.tag !== "Failed" || transfer.purpose.tag !== tag || transfer.purpose.value.craftId !== craftId) continue;
            failures += 1;
            const at = transfer.settledAt ? timestampMs(transfer.settledAt) : 0;
            if (latest === undefined || at >= latestAt) {
                latestAt = at;
                latest = transfer;
            }
        }
        return {failures, latestAt, latest};
    }

    /** Exponential backoff over the failed holds/top-ups, which survives a restart. */
    function backoffUntil(craftId: bigint, tag: "Hold" | "TopUp"): number {
        const {failures, latestAt} = failuresOf(craftId, tag);
        if (failures === 0) return 0;
        return latestAt + Math.min(config.retryBaseMs * 2 ** (failures - 1), config.retryMaxMs);
    }

    function pendingTransfer(craftId: bigint, tag: "Hold" | "TopUp"): SteloTransfer | undefined {
        for (const transfer of escrow.state.transfers.values()) {
            if (isPending(transfer) && transfer.purpose.tag === tag && transfer.purpose.value.craftId === craftId) return transfer;
        }
        return undefined;
    }

    function hasPending(craftId: bigint, tag: "Hold" | "TopUp"): boolean {
        for (const transfer of escrow.state.transfers.values()) {
            if (isPending(transfer) && transfer.purpose.tag === tag && transfer.purpose.value.craftId === craftId) return true;
        }
        return false;
    }

    function raise(craftId: bigint, held: CraftBountyEscrow, request: FundingRequest): void {
        const key = `topup:${craftId}`;
        if (inFlight.has(key) || hasPending(craftId, "TopUp")) return;
        if (deps.now() < backoffUntil(craftId, "TopUp")) return;

        const ratio = {numerator: request.ratioNumerator, denominator: request.ratioDenominator};
        const need = escrowRequired(
            {numerator: held.accruedNumerator, denominator: held.accruedDenominator},
            ratio, held.effortCovered, held.effortPriced,
        ) - (held.heldAmount - held.releasedAmount);

        const reservable = reservableRefundDue(escrow.state, held.payerAccountIdentity, held.currency, held.fundingAccountId);
        if (need <= 0n || reservable >= need) {
            track(key, writes.raiseFromRefundDue(craftId, ratio.numerator, ratio.denominator), "raise from refund due", craftId);
            return;
        }
        if (!stelo.isLive) return report(craftId, "stelo-unavailable");
        const allowed = pullCheck(held.payerAccountIdentity, held.fundingAccountId);
        if (allowed !== "ok") return report(craftId, allowed, {account: held.fundingAccountId.toString()});

        const escrowAccountId = config.currencies[held.currency]?.escrowAccountId;
        const scale = stelo.account(held.fundingAccountId)?.ledgerScale;
        if (escrowAccountId === undefined || scale === undefined) return;
        const reserved = reservable;
        const amount = need - reserved;
        track(key, writes.recordIntent({
            currency: held.currency,
            payer: held.payerAccountIdentity,
            fromAccountId: held.fundingAccountId,
            toAccountId: escrowAccountId,
            amount,
            steloAmount: toSteloAmount(amount, scale),
            purpose: {tag: "TopUp", value: {craftId, ratioNumerator: ratio.numerator, ratioDenominator: ratio.denominator, reserved}},
        }), "top-up intent", craftId);
    }

    function hold(craftId: bigint, request: FundingRequest, effortCovered: bigint): void {
        const key = `hold:${craftId}`;
        if (inFlight.has(key) || hasPending(craftId, "Hold")) return;
        if (deps.now() < backoffUntil(craftId, "Hold")) return;

        if (!stelo.isLive) return report(craftId, "stelo-unavailable");
        if (request.fundingLinkId === undefined) return report(craftId, "no-wallet");
        const wallet = escrow.state.steloWallets.get(request.fundingLinkId);
        const link = escrow.state.steloLinks.get(request.fundingLinkId);
        if (!wallet || !link || wallet.currency !== request.currency || !link.accountIdentity.isEqual(request.payer)) {
            return report(craftId, "wallet-inactive", {link: request.fundingLinkId.toString()});
        }
        const fundingAccountId = BigInt(link.externalId);
        const allowed = pullCheck(request.payer, fundingAccountId);
        if (allowed !== "ok") return report(craftId, allowed, {account: fundingAccountId.toString()});
        if (effortCovered <= 0n) return;

        const escrowAccountId = config.currencies[request.currency]?.escrowAccountId;
        const scale = stelo.account(fundingAccountId)?.ledgerScale;
        if (escrowAccountId === undefined || scale === undefined) return;
        const amount = ceilRatio(reduceRatio(request.ratioNumerator * effortCovered, request.ratioDenominator));
        if (amount <= 0n) return;
        track(key, writes.recordIntent({
            currency: request.currency,
            payer: request.payer,
            fromAccountId: fundingAccountId,
            toAccountId: escrowAccountId,
            amount,
            steloAmount: toSteloAmount(amount, scale),
            purpose: {
                tag: "Hold",
                value: {
                    craftId,
                    fundingLinkId: request.fundingLinkId,
                    ratioNumerator: request.ratioNumerator,
                    ratioDenominator: request.ratioDenominator,
                    effortCovered,
                },
            },
        }), "hold intent", craftId);
    }

    const securedBy = (held: CraftBountyEscrow, request: FundingRequest) =>
        request.ratioNumerator * held.ratioDenominator <= held.ratioNumerator * request.ratioDenominator;

    return {
        status(craftId, request) {
            const held = escrow.state.openEscrows.get(craftId);
            const tag = held ? "TopUp" : "Hold";
            if (held && (held.currency !== request.currency || !held.payerAccountIdentity.isEqual(request.payer))) return {state: "waiting"};
            if (held && securedBy(held, request)) return {state: "funded"};

            const inFlightTransfer = pendingTransfer(craftId, tag);
            if (inFlightTransfer) return {state: "funding", transferId: inFlightTransfer.id};
            const {latest} = failuresOf(craftId, tag);
            if (latest && deps.now() < backoffUntil(craftId, tag)) {
                const reason = FUNDING_REASONS.find(code => code === latest.failureReason);
                return {state: "failed", reason, transferId: latest.id};
            }
            return {state: "waiting", reason: waiting.get(craftId)};
        },

        prepare(craftId, request, effortCovered) {
            waiting.delete(craftId);
            const held = escrow.state.openEscrows.get(craftId);
            if (held) {
                if (held.currency !== request.currency || !held.payerAccountIdentity.isEqual(request.payer)) return "keep";
                const requested = request.ratioNumerator * held.ratioDenominator;
                const secured = held.ratioNumerator * request.ratioDenominator;
                if (requested <= secured) return "ready";
                raise(craftId, held, request);
                return "wait";
            }
            hold(craftId, request, effortCovered);
            return "wait";
        },
    };
}
