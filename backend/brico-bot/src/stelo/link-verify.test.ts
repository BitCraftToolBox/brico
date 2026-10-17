import assert from "node:assert/strict";
import {describe, it} from "node:test";

import type {SteloCurrencyConfig} from "../config.ts";
import {canFundFrom, canPull, type DirectoryAccount, matchDirectoryHits, verifySteloAddress, verifySteloLink} from "./link-verify.ts";
import {createSteloCache} from "./stelo-cache.ts";

const currencies: Record<string, SteloCurrencyConfig> = {
    "stelo-hex-coin": {ledger: "Hex Coin", escrowAccountId: 900n, unclaimed: {action: "refund", afterDays: 7}},
};
const hex = (value: string) => ({toHexString: () => value});

function world(overrides: {kind?: string; ledgerName?: string; botRole?: string; memberRole?: string; memberKind?: string; playerId?: bigint} = {}) {
    const cache = createSteloCache();
    cache.accounts.insert({
        accountId: 101n, address: "ABCD", kind: {tag: overrides.kind ?? "Debit"}, balance: 0n, ledgerId: 1n,
        ledgerName: overrides.ledgerName ?? "Hex Coin", ledgerScale: 3, role: {tag: overrides.botRole ?? "Read"},
    });
    cache.members.insert({
        id: 1n, accountId: 101n, memberId: hex("user-a"), kind: {tag: overrides.memberKind ?? "User"}, role: {tag: overrides.memberRole ?? "Owner"},
    });
    cache.users.insert({id: hex("user-a"), bitcraftPlayerId: overrides.playerId ?? 5001n});
    return cache;
}

describe("verifySteloLink", () => {
    const players = new Set([5001n]);

    it("accepts a Debit wallet on a configured ledger owned by a linked player, with only Read", () => {
        assert.deepEqual(verifySteloLink(101n, players, world(), currencies), {ok: true, accountId: 101n, address: "ABCD", currency: "stelo-hex-coin"});
    });

    it("resolves a submitted address case-insensitively, and rejects an unknown or cross-ledger ambiguous one", () => {
        const cache = world();
        assert.deepEqual(verifySteloAddress("abcd", players, cache, currencies), {ok: true, accountId: 101n, address: "ABCD", currency: "stelo-hex-coin"});
        assert.deepEqual(verifySteloAddress("ZZ", players, cache, currencies), {ok: false, reason: "bot-not-member"});

        const two: Record<string, SteloCurrencyConfig> = {...currencies, "other-coin": {ledger: "Other", escrowAccountId: 901n, unclaimed: {action: "refund", afterDays: 7}}};
        cache.accounts.insert({accountId: 202n, address: "ABCD", kind: {tag: "Debit"}, balance: 0n, ledgerId: 2n, ledgerName: "Other", ledgerScale: 0, role: {tag: "Read"}});
        assert.deepEqual(verifySteloAddress("ABCD", players, cache, two), {ok: false, reason: "ambiguous-address"});
        assert.equal(verifySteloAddress("ABCD", players, cache, currencies).ok, true);
    });

    it("rejects an account the bot cannot see", () => {
        assert.deepEqual(verifySteloLink(7n, players, world(), currencies), {ok: false, reason: "bot-not-member"});
    });

    it("rejects Credit accounts, other ledgers and the escrow wallet itself", () => {
        assert.deepEqual(verifySteloLink(101n, players, world({kind: "Credit"}), currencies), {ok: false, reason: "not-debit"});
        assert.deepEqual(verifySteloLink(101n, players, world({ledgerName: "Other"}), currencies), {ok: false, reason: "wrong-ledger"});
        assert.deepEqual(
            verifySteloLink(101n, players, world(), {"stelo-hex-coin": {...currencies["stelo-hex-coin"], escrowAccountId: 101n}}),
            {ok: false, reason: "escrow-account"},
        );
    });

    it("needs a linked BitCraft player and an Owner/Admin User member matching one", () => {
        assert.deepEqual(verifySteloLink(101n, new Set(), world(), currencies), {ok: false, reason: "no-linked-bitcraft-player"});
        assert.deepEqual(verifySteloLink(101n, players, world({memberRole: "Write"}), currencies), {ok: false, reason: "no-owner-admin-match"});
        assert.deepEqual(verifySteloLink(101n, players, world({memberKind: "App"}), currencies), {ok: false, reason: "no-owner-admin-match"});
        assert.deepEqual(verifySteloLink(101n, players, world({playerId: 6n}), currencies), {ok: false, reason: "no-owner-admin-match"});
        assert.equal(verifySteloLink(101n, players, world({memberRole: "Admin"}), currencies).ok, true);
    });
});

describe("canPull", () => {
    it("needs Write or better on the account", () => {
        assert.equal(canPull(world({botRole: "Read"}), 101n), false);
        assert.equal(canPull(world({botRole: "Write"}), 101n), true);
        assert.equal(canPull(world({botRole: "Admin"}), 101n), true);
        assert.equal(canPull(world(), 999n), false);
    });
});

describe("canFundFrom", () => {
    const players = new Set([5001n]);

    it("needs Write and a still-administering linked player", () => {
        assert.equal(canFundFrom(world({botRole: "Write"}), 101n, players), "ok");
        assert.equal(canFundFrom(world({botRole: "Read"}), 101n, players), "cannot-pull");
        assert.equal(canFundFrom(world({botRole: "Write", memberRole: "Write"}), 101n, players), "not-authorized");
        assert.equal(canFundFrom(world({botRole: "Write"}), 101n, new Set([6n])), "not-authorized");
    });
});

describe("matchDirectoryHits", () => {
    const ledgerName = (id: bigint) => (id === 1n ? "Hex Coin" : "Other");
    const hit = (overrides: Partial<DirectoryAccount> = {}): DirectoryAccount => ({
        accountId: 101n, address: "ABCD", ledgerId: 1n, kind: {tag: "Debit"}, primaryUsername: "Jo", ...overrides,
    });

    it("picks the one exact address match on a configured ledger, with its username", () => {
        assert.deepEqual(matchDirectoryHits("abcd", [hit(), hit({accountId: 5n, address: "ABCDE"})], currencies, ledgerName), {
            ok: true, accountId: 101n, address: "ABCD", currency: "stelo-hex-coin", username: "Jo",
        });
    });

    it("rejects unknown, other-ledger, credit and escrow accounts", () => {
        assert.deepEqual(matchDirectoryHits("ZZ", [hit()], currencies, ledgerName), {ok: false, reason: "unknown-address"});
        assert.deepEqual(matchDirectoryHits("ABCD", [hit({ledgerId: 2n})], currencies, ledgerName), {ok: false, reason: "wrong-ledger"});
        assert.deepEqual(matchDirectoryHits("ABCD", [hit({kind: {tag: "Credit"}})], currencies, ledgerName), {ok: false, reason: "not-debit"});
        assert.deepEqual(matchDirectoryHits("ABCD", [hit({accountId: 900n})], currencies, ledgerName), {ok: false, reason: "escrow-account"});
    });
});
