/**
 * funding-status.ts — keeps each escrowed-currency craft's `craft_bounty_funding` row current and
 * raises a funding alert when a row lands in a state the payer can act on (the notifier collapses
 * repeats) and tells the notifier when a craft becomes funded.
 */
import type {CraftBountyFunding} from "@brico/bindings/brico-app/types";
import {ACTIONABLE_FUNDING_REASONS} from "@brico/crafts/stelo";
import type {Identity} from "spacetimedb";

import type {EscrowCache} from "../app/escrow-cache.ts";
import type {Logger} from "../log.ts";
import type {FundingStatus} from "./funding.ts";
import {createInFlight} from "./inflight.ts";
import type {FundingNotifier} from "./notify.ts";
import type {FundingRow, SteloWrites} from "./writes.ts";

/** What the engine resolved for a craft, for the row's non-status columns. */
export interface FundingSubject {
    source: "override" | "rule";
    ruleId: string | undefined;
    currency: string;
    payer: Identity;
    fundingLinkId: bigint | undefined;
    ratioNumerator: bigint;
    ratioDenominator: bigint;
}

export interface FundingStatusSync {
    /** Records the latest status for a craft; the row is written when it differs from the stored one. */
    report(craftId: bigint, subject: FundingSubject, status: FundingStatus): void;
    /** The craft no longer has an escrowed-currency intent. */
    clear(craftId: bigint): void;
    /** Writes whatever is outstanding; called every tick so a failed or skipped write is retried. */
    flush(): void;
}

export interface FundingStatusDeps {
    escrow: EscrowCache;
    writes: SteloWrites;
    notifier: FundingNotifier | undefined;
    log: Logger;
    /** How long a write blocks another for the same craft after it settles; see `createInFlight`. */
    holdMs?: number;
}

function sameRow(stored: CraftBountyFunding, row: FundingRow): boolean {
    return stored.payerAccountIdentity.isEqual(row.payer) && stored.source === row.source && stored.ruleId === row.ruleId
        && stored.currency === row.currency && stored.fundingLinkId === row.fundingLinkId
        && stored.ratioNumerator === row.ratioNumerator && stored.ratioDenominator === row.ratioDenominator
        && stored.state === row.state && stored.reason === row.reason && stored.transferId === row.transferId;
}

/** `failed`, or `waiting` with a reason the payer can act on. */
function isAlerting(row: FundingRow): boolean {
    return row.state === "failed" || (row.state === "waiting" && row.reason !== undefined && ACTIONABLE_FUNDING_REASONS.includes(row.reason));
}

export function createFundingStatusSync(deps: FundingStatusDeps): FundingStatusSync {
    const {escrow, writes, notifier} = deps;
    const inFlight = createInFlight(deps.log, deps.holdMs);
    // The row each craft should have, or null for no row.
    const desired = new Map<bigint, FundingRow | null>();

    function flushOne(craftId: bigint, row: FundingRow | null): void {
        const stored = escrow.state.fundingRows.get(craftId);
        const key = `funding-status:${craftId}`;
        if (row === null) {
            if (!stored) return void desired.delete(craftId);
            if (!inFlight.has(key)) inFlight.track(key, writes.clearFunding(craftId), "clear craft funding", {craftId: craftId.toString()});
            return;
        }
        if (stored && sameRow(stored, row)) return void desired.delete(craftId);
        if (inFlight.has(key)) return;
        const alerting = isAlerting(row);
        const recovered = row.state === "funded" && stored?.state !== "funded";
        const write = writes.setFunding(row);
        inFlight.track(key, write, "set craft funding", {craftId: craftId.toString()});
        if (notifier && (alerting || recovered)) {
            write.then(() => {
                if (recovered) notifier.resolve("funding-failed", row.payer, row.currency, wallet(row.fundingLinkId));
                // Not tied to a craft: the notifier posts once per wallet and reason, however many crafts share them.
                else notifier.notify({kind: "funding-failed", role: "payer", account: row.payer, currency: row.currency, reason: row.reason, walletAccountId: wallet(row.fundingLinkId)});
            }).catch(() => {});
        }
    }

    function wallet(linkId: bigint | undefined): bigint | undefined {
        const link = linkId === undefined ? undefined : escrow.state.steloLinks.get(linkId);
        return link && /^\d+$/.test(link.externalId) ? BigInt(link.externalId) : undefined;
    }

    return {
        report(craftId, subject, status) {
            const row: FundingRow = {
                craftId,
                payer: subject.payer,
                source: subject.source,
                ruleId: subject.ruleId,
                currency: subject.currency,
                fundingLinkId: subject.fundingLinkId,
                ratioNumerator: subject.ratioNumerator,
                ratioDenominator: subject.ratioDenominator,
                state: status.state,
                reason: status.reason,
                transferId: status.transferId,
            };
            desired.set(craftId, row);
            flushOne(craftId, row);
        },
        clear(craftId) {
            if (!escrow.state.fundingRows.has(craftId) && !desired.has(craftId)) return;
            desired.set(craftId, null);
            flushOne(craftId, null);
        },
        flush() {
            for (const [craftId, row] of [...desired]) flushOne(craftId, row);
        },
    };
}
