/**
 * bounty-source.ts — where `bounty-sink.ts` gets the rules, overrides and ownership facts it
 * resolves a craft's bounty from.
 *
 * Same shape as `watch-source.ts`'s `createAccountWatchSource`: a plain in-memory join over
 * `brico-app`'s `all_*` views, read off the second connection and re-run every snapshot. Untrusted
 * `filterJson` goes through `@brico/crafts/filter`'s `parseFilter`/`validateFilter` the same way.
 * Additionally, a rule whose filter references `payout`/`currency` is skipped here (not just
 * excluded from the frontend's field picker), since a bounty rule that could condition on the very
 * bounty it assigns would be circular.
 */
import type {BountyRule, BountyRuleValue, CraftBountyEntitlement, CraftBountyOverride, LoyaltyReward} from "@brico/bindings/brico-app/types";
import {type FilterNode, parseFilter, validateFilter} from "@brico/crafts/filter";
import type {Identity} from "spacetimedb";

import type {Logger} from "../log.ts";
import type {BricoAppConnection} from "./connection.ts";

/** A `bounty_rule` row with its `filterJson` already parsed and validated. */
export interface BountyRuleSpec {
    id: string;
    priority: number;
    filter: FilterNode;
    value: BountyRuleValue;
    private: boolean;
}

/** `bitcraft-ea2` player entity id -> the brico account it's linked to, revoked links excluded. */
export function resolvePlayerAccounts(app: BricoAppConnection): Map<bigint, Identity> {
    const byPlayer = new Map<bigint, Identity>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byPlayer;

    for (const link of conn.db.allLinkedIntegration.iter()) {
        if (link.provider !== "bitcraft-ea2" || link.revokedAt !== undefined) continue;
        byPlayer.set(BigInt(link.externalId), link.accountIdentity);
    }
    return byPlayer;
}

/**
 * Every account's usable bounty rules, keyed by account identity hex and sorted by priority
 * (ascending — `reorderBountyRules` rewrites priorities to `0..N-1`, so 0 is evaluated first).
 * Tombstoned, unparseable, or `payout`/`currency`-referencing rules are skipped with a `log.warn`,
 * never thrown — a malformed or invalid rule must not take the bridge down.
 */
export function loadBountyRules(app: BricoAppConnection, log: Logger): Map<string, BountyRuleSpec[]> {
    const byAccount = new Map<string, BountyRuleSpec[]>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byAccount;

    for (const rule of conn.db.allBountyRule.iter() as Iterable<BountyRule>) {
        if (rule.deletedAt !== undefined) continue;

        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(rule.filterJson);
        } catch {
            log.warn("skipping bounty rule: filterJson is not valid JSON", {ruleId: rule.id});
            continue;
        }

        const problems = validateFilter(parsedJson, "filter", ["payout", "currency"]);
        if (problems.length > 0) {
            log.warn("skipping bounty rule: invalid or disallowed filter", {ruleId: rule.id, problems: problems.join("; ")});
            continue;
        }
        const filter = parseFilter(parsedJson);
        if (!filter) {
            log.warn("skipping bounty rule: filter did not parse", {ruleId: rule.id});
            continue;
        }

        const key = rule.accountIdentity.toHexString();
        const specs = byAccount.get(key);
        const spec: BountyRuleSpec = {id: rule.id, priority: rule.priority, filter, value: rule.value, private: rule.private};
        if (specs) specs.push(spec);
        else byAccount.set(key, [spec]);
    }

    for (const specs of byAccount.values()) specs.sort((a, b) => a.priority - b.priority);
    return byAccount;
}

/** `craftId -> craft_bounty_override` row, for the crafts that currently have one. */
export function loadOverrides(app: BricoAppConnection): Map<bigint, CraftBountyOverride> {
    const byCraft = new Map<bigint, CraftBountyOverride>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byCraft;
    for (const override of conn.db.allCraftBountyOverride.iter()) byCraft.set(override.craftId, override);
    return byCraft;
}

/**
 * A previously-resolved assignment, from either table — `private` is tagged on here rather than
 * read off the row itself, since neither `craft_bounty_assignment` nor
 * `craft_private_bounty_assignment` stores a `private` column; which table a craft's row lives in
 * *is* its privacy.
 */
export interface ExistingBountyAssignment {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    assignedByAccountIdentity: Identity;
    private: boolean;
}

/**
 * `craftId -> assignment` row, so the bot can diff against what's already resolved — merges
 * `craft_bounty_assignment` and `craft_private_bounty_assignment`, since the two are mutually
 * exclusive per craft (see `assignCraftBounty`'s "only one of the two tables" invariant).
 */
export function loadAssignments(app: BricoAppConnection): Map<bigint, ExistingBountyAssignment> {
    const byCraft = new Map<bigint, ExistingBountyAssignment>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byCraft;
    for (const assignment of conn.db.allCraftBountyAssignment.iter()) {
        byCraft.set(assignment.craftId, {...assignment, private: false});
    }
    for (const assignment of conn.db.allPrivateCraftBountyAssignment.iter()) {
        byCraft.set(assignment.craftId, {...assignment, private: true});
    }
    return byCraft;
}

/**
 * `craftId:playerId:currency` -> `craft_bounty_entitlement` row. `id` is a plain autoInc now (the
 * table's natural key is the composite lookup in `by_craft_player_currency`, not `id` itself), so
 * the map is keyed by that composite string, built the same way `bounty-sink.ts`'s
 * `updateEntitlements` builds it for its own lookups.
 */
export function loadEntitlements(app: BricoAppConnection): Map<string, CraftBountyEntitlement> {
    const byId = new Map<string, CraftBountyEntitlement>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byId;
    for (const entitlement of conn.db.allCraftBountyEntitlement.iter()) {
        byId.set(`${entitlement.craftId}:${entitlement.playerId}:${entitlement.currency}`, entitlement);
    }
    return byId;
}

/**
 * `${payerAccountIdentity}:${payeePlayerId}:${currency}` -> the payer's `loyalty_reward` ratio for
 * that payee/currency. Consumed by `bounty-sink.ts`'s `updateEntitlements`, which composes this
 * with a craft's assigned bounty ratio *before* calling `computeEntitlement`, so it behaves like a
 * straight percentage bonus with no fractional carryover.
 */
export function loadLoyaltyRewards(app: BricoAppConnection): Map<string, LoyaltyReward> {
    const byId = new Map<string, LoyaltyReward>();
    const conn = app.connection?.connection;
    if (!conn?.isActive || !app.isLive) return byId;
    for (const reward of conn.db.allLoyaltyReward.iter() as Iterable<LoyaltyReward>) {
        byId.set(`${reward.payerAccountIdentity.toHexString()}:${reward.payeePlayerId}:${reward.currency}`, reward);
    }
    return byId;
}
