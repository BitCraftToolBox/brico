/**
 * bounty-sink.ts — resolves and writes `craft_bounty_assignment`/`craft_bounty_entitlement`.
 * The bot is the sole writer of both tables: only it can see prism's craft/claim ownership *and*
 * `brico-app`'s rules/overrides at the same time.
 *
 * `resolveCraftBounty` mirrors `notification-sink.ts`'s fire-and-forget reducer-call style for the
 * actual writes, but every write here is a full upsert/delete rather than an insert-only append:
 * the bot recomputes a craft's bounty from scratch on every relevant snapshot, so there is no
 * separate "what changed" tracking to get wrong — an unchanged resolution is simply skipped.
 */
import type {BountyRuleValue, CraftBountyOverride} from "@brico/bindings/brico-app/types";
import {computeEntitlement, reduceRatio} from "@brico/crafts/entitlement";
import type {CraftSubject} from "@brico/crafts/filter";
import {evaluateFilter} from "@brico/crafts/filter";
import type {CraftBountyFacts} from "@brico/crafts/subject";
import {Identity, Timestamp} from "spacetimedb";

import type {Logger} from "../log.ts";
import {timeReducerCall} from "../metrics.ts";
import type {CraftSnapshot} from "../relay/prism.ts";
import type {CraftRow} from "../relay/subject.ts";
import {type BountyRuleSpec, loadAssignments, loadBountyRules, loadEntitlements, loadLoyaltyRewards, loadOverrides, resolvePlayerAccounts} from "./bounty-source.ts";
import type {BricoAppConnection} from "./connection.ts";

interface ResolvedBounty {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    assignedByAccountIdentity: Identity;
    /** Whether the matched rule/override was marked private — decides which of the two assignment tables `assign()` writes to. */
    private: boolean;
}

/**
 * First priority-ordered rule whose filter matches `subject`. A grid rule's missing/empty cell for
 * this craft's `(skill, tier)` means "no bounty from this row," not "any bounty" — falls through
 * to the next rule rather than stopping here.
 */
function matchRules(subject: CraftSubject, specs: readonly BountyRuleSpec[], accountIdentity: Identity): ResolvedBounty | null {
    for (const spec of specs) {
        if (!evaluateFilter(spec.filter, subject)) continue;
        const value: BountyRuleValue = spec.value;

        if (value.tag === "Flat") {
            return {
                ratioNumerator: value.value.ratioNumerator,
                ratioDenominator: value.value.ratioDenominator,
                currency: value.value.currency,
                assignedByAccountIdentity: accountIdentity,
                private: spec.private,
            };
        }

        if (subject.skill === null || subject.tier === null) continue;
        const cell = value.value.cells.find(c => c.skillId === subject.skill && c.tier === subject.tier);
        if (!cell) continue;
        return {
            ratioNumerator: cell.ratioNumerator,
            ratioDenominator: cell.ratioDenominator,
            currency: value.value.currency,
            assignedByAccountIdentity: accountIdentity,
            private: spec.private,
        };
    }
    return null;
}

/**
 * Resolves one craft's bounty: override first (only if its account actually owns the craft or its
 * claim — an override belonging to neither is invalid intent and is skipped, falling through to
 * rule evaluation exactly as if it didn't exist), then the personal owner's rules, then the claim
 * owner's — **the personal owner wins outright** if they have any match at all.
 */
export function resolveCraftBounty(
    craftId: bigint,
    subject: CraftSubject,
    ownerEntityId: bigint,
    claimEntityId: bigint,
    playerAccounts: ReadonlyMap<bigint, Identity>,
    claimOwners: ReadonlyMap<bigint, bigint[]>,
    rulesByAccount: ReadonlyMap<string, BountyRuleSpec[]>,
    overridesByCraft: ReadonlyMap<bigint, CraftBountyOverride>,
): ResolvedBounty | null {
    const ownerAccount = ownerEntityId !== 0n ? playerAccounts.get(ownerEntityId) : undefined;
    const claimOwnerAccounts = (claimEntityId !== 0n ? claimOwners.get(claimEntityId) ?? [] : [])
        .map(playerId => playerAccounts.get(playerId))
        .filter((identity): identity is Identity => identity !== undefined);

    const override = overridesByCraft.get(craftId);
    if (override) {
        const ownsIt = (ownerAccount?.isEqual(override.accountIdentity) ?? false)
            || claimOwnerAccounts.some(identity => identity.isEqual(override.accountIdentity));
        if (ownsIt) {
            return {
                ratioNumerator: override.ratioNumerator,
                ratioDenominator: override.ratioDenominator,
                currency: override.currency,
                assignedByAccountIdentity: override.accountIdentity,
                private: override.private,
            };
        }
    }

    if (ownerAccount) {
        const resolved = matchRules(subject, rulesByAccount.get(ownerAccount.toHexString()) ?? [], ownerAccount);
        if (resolved) return resolved;
    }

    for (const claimOwnerAccount of claimOwnerAccounts) {
        const resolved = matchRules(subject, rulesByAccount.get(claimOwnerAccount.toHexString()) ?? [], claimOwnerAccount);
        if (resolved) return resolved;
    }

    return null;
}

export interface BountyEngine {
    /**
     * Resolves every row's bounty against current `brico-app` state, writes any that changed, and
     * returns the fresh `craftId -> bounty` map — feed this into a second `craftRowsFrom` pass so
     * `CraftSubject.payout` is live before watches are evaluated in the same tick.
     */
    assign(snapshot: CraftSnapshot, rows: readonly CraftRow[]): ReadonlyMap<bigint, CraftBountyFacts>;
    /** Recomputes and writes any changed per-contributor entitlements for the given assignments. */
    updateEntitlements(snapshot: CraftSnapshot, assignments: ReadonlyMap<bigint, CraftBountyFacts>): void;
}

export function createBountyEngine(app: BricoAppConnection, log: Logger): BountyEngine {
    const scoped = log.child("bounty");
    // `craftId -> assignedByAccountIdentity` for whatever `assign()` most recently resolved — kept
    // out of `CraftBountyFacts` itself (a shared, frontend-visible type) since only this engine's
    // own `updateEntitlements` needs the payer identity, to key its loyalty-reward lookup. Rebuilt
    // wholesale on every `assign()` call, which always runs immediately before `updateEntitlements`
    // in the same tick (see `bridge.ts`'s `onSnapshot`), so it's never stale when read.
    let assignedByCraft = new Map<bigint, Identity>();

    return {
        assign(snapshot, rows) {
            const conn = app.connection?.connection;
            const resolved = new Map<bigint, CraftBountyFacts>();
            if (!conn?.isActive) return resolved;

            const playerAccounts = resolvePlayerAccounts(app);
            const rulesByAccount = loadBountyRules(app, scoped);
            const overridesByCraft = loadOverrides(app);
            const existingAssignments = loadAssignments(app);
            const nextAssignedByCraft = new Map<bigint, Identity>();

            for (const row of rows) {
                const craftId = BigInt(row.id);
                const ownerEntityId = row.subject.owner ? BigInt(row.subject.owner) : 0n;
                const claimEntityId = row.subject.claim ? BigInt(row.subject.claim) : 0n;
                const bounty = resolveCraftBounty(
                    craftId, row.subject, ownerEntityId, claimEntityId,
                    playerAccounts, snapshot.claimOwners, rulesByAccount, overridesByCraft,
                );

                if (bounty) {
                    resolved.set(craftId, bounty);
                    nextAssignedByCraft.set(craftId, bounty.assignedByAccountIdentity);
                }

                const previous = existingAssignments.get(craftId);
                const unchanged = previous !== undefined && bounty !== null
                    && previous.ratioNumerator === bounty.ratioNumerator
                    && previous.ratioDenominator === bounty.ratioDenominator
                    && previous.currency === bounty.currency
                    && previous.assignedByAccountIdentity.isEqual(bounty.assignedByAccountIdentity)
                    && previous.private === bounty.private;
                if (unchanged) continue;
                if (bounty === null && previous === undefined) continue;

                if (bounty) {
                    timeReducerCall("assign_craft_bounty", conn.reducers.assignCraftBounty({
                        craftId,
                        ratioNumerator: bounty.ratioNumerator,
                        ratioDenominator: bounty.ratioDenominator,
                        currency: bounty.currency,
                        assignedByAccountIdentity: bounty.assignedByAccountIdentity,
                        private: bounty.private,
                        assignedAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    })).catch(cause => {
                        scoped.error("assign_craft_bounty failed", {craftId: row.id, error: cause instanceof Error ? cause.message : String(cause)});
                    });
                } else {
                    timeReducerCall("clear_craft_bounty", conn.reducers.clearCraftBounty({craftId})).catch(cause => {
                        scoped.error("clear_craft_bounty failed", {craftId: row.id, error: cause instanceof Error ? cause.message : String(cause)});
                    });
                }
            }

            // `rows` only covers Active crafts, so a craft that has aged all the way out of
            // `craft_meta` (past the 24-hour Claimed/Removed tail — see `isOpen` in prism.ts) never
            // shows up above and its assignment would otherwise linger forever. Sweep those here.
            for (const craftId of existingAssignments.keys()) {
                if (snapshot.allCraftIds.has(craftId)) continue;
                timeReducerCall("clear_craft_bounty", conn.reducers.clearCraftBounty({craftId})).catch(cause => {
                    scoped.error("clear_craft_bounty failed", {craftId: craftId.toString(), error: cause instanceof Error ? cause.message : String(cause)});
                });
            }

            assignedByCraft = nextAssignedByCraft;
            return resolved;
        },

        updateEntitlements(snapshot, assignments) {
            const conn = app.connection?.connection;
            if (!conn?.isActive) return;

            const ownerByCraft = new Map<bigint, bigint>();
            for (const craft of snapshot.crafts) {
                if (craft.ownerEntityId !== 0n) ownerByCraft.set(craft.entityId, craft.ownerEntityId);
            }

            const existing = loadEntitlements(app);
            const loyaltyRewards = loadLoyaltyRewards(app);
            for (const [craftId, bounty] of assignments) {
                const byPlayer = snapshot.contributions.get(craftId);
                if (!byPlayer) continue;
                const ownerEntityId = ownerByCraft.get(craftId);

                for (const [playerId, effort] of byPlayer) {
                    // A craft's own owner never earns an entitlement for it — whoever pays the
                    // bounty is by definition someone else, so paying the owner out of their own
                    // bounty is meaningless.
                    if (playerId === ownerEntityId) continue;

                    // Loyalty rewards fold into the bounty ratio *before* the floor, keeping this a single
                    // floor operation, matching `computeEntitlement`'s own no-carryover guarantee. This makes
                    // `craft_bounty_entitlement`/`bounty_entitlement_total` the loyalty-adjusted
                    // ("actual") ledger; the frontend's estimated-payout preview never sees a
                    // multiplier and keeps using the raw assigned ratio.
                    const assignedByAccountIdentity = assignedByCraft.get(craftId);
                    const loyalty = assignedByAccountIdentity
                        ? loyaltyRewards.get(`${assignedByAccountIdentity.toHexString()}:${playerId}:${bounty.currency}`)
                        : undefined;
                    const effectiveRatio = loyalty
                        ? reduceRatio(bounty.ratioNumerator * loyalty.ratioNumerator, bounty.ratioDenominator * loyalty.ratioDenominator)
                        : {numerator: bounty.ratioNumerator, denominator: bounty.ratioDenominator};

                    const entitledTotal = computeEntitlement(effort, effectiveRatio.numerator, effectiveRatio.denominator);
                    const id = `${craftId}:${playerId}:${bounty.currency}`;
                    const previous = existing.get(id);
                    if (previous && previous.lastAssignedEffort === effort && previous.entitledTotal === entitledTotal) continue;

                    timeReducerCall("upsert_craft_bounty_entitlement", conn.reducers.upsertCraftBountyEntitlement({
                        craftId,
                        playerId,
                        currency: bounty.currency,
                        lastAssignedEffort: effort,
                        entitledTotal,
                        updatedAt: Timestamp.now(),
                    })).catch(cause => {
                        scoped.error("upsert_craft_bounty_entitlement failed", {
                            craftId: craftId.toString(),
                            playerId: playerId.toString(),
                            error: cause instanceof Error ? cause.message : String(cause),
                        });
                    });
                }
            }
        },
    };
}
