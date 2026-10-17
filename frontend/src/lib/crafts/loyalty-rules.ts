/**
 * loyalty-rules.ts — `/account/loyalty`'s own view of `brico-app`'s `my_loyalty_rule` (the
 * payer-wide automated rules) and `my_loyalty_bonus_total` (the resolved, read-only totals
 * `brico-bot` writes back). Sibling to `loyalty-rewards.ts`, which covers the manual assignment.
 */
import {tables} from "@brico/bindings/brico-app";
import type {LoyaltyBonusTotal, LoyaltyRule, LoyaltyRuleSpec} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface LoyaltyRulesHandle {
    /** The caller's own automated loyalty rules, as a payer. */
    rules: Accessor<LoyaltyRule[]>;
    /** `id: null` inserts a new rule; a real id edits that existing row. */
    upsert: (id: bigint | null, currency: string, spec: LoyaltyRuleSpec, bonusRatioNumerator: bigint, bonusRatioDenominator: bigint) => Promise<void>;
    remove: (id: bigint) => Promise<void>;
}

export function createLoyaltyRules(): LoyaltyRulesHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rules, setRules] = createSignal<LoyaltyRule[]>([]);

    function readRows() {
        const active = conn.active();
        setRules(active ? [...active.db.myLoyaltyRule.iter()] as LoyaltyRule[] : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing — see `~/lib/notifications/state.tsx`'s `subscribe()` doc
        // comment for the exact re-subscribe race this avoids.
        const request = untrack(() =>
            conn.requestResource({key: "loyalty-rules:self", tables: [bricoAppTable(tables.myLoyaltyRule)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRules([]);
    }

    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    async function upsert(id: bigint | null, currency: string, spec: LoyaltyRuleSpec, bonusRatioNumerator: bigint, bonusRatioDenominator: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.upsertLoyaltyRule({id: id ?? undefined, currency, spec, bonusRatioNumerator, bonusRatioDenominator, updatedAt: Timestamp.now()});
    }

    async function remove(id: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.deleteLoyaltyRule({id});
    }

    return {rules, upsert, remove};
}

export interface LoyaltyBonusTotalsHandle {
    /** The caller's own resolved automated-bonus totals, as a payer — read-only. */
    totals: Accessor<LoyaltyBonusTotal[]>;
}

export function createLoyaltyBonusTotals(): LoyaltyBonusTotalsHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [totals, setTotals] = createSignal<LoyaltyBonusTotal[]>([]);

    function readRows() {
        const active = conn.active();
        setTotals(active ? [...active.db.myLoyaltyBonusTotal.iter()] as LoyaltyBonusTotal[] : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        const request = untrack(() =>
            conn.requestResource({key: "loyalty-bonus-totals:self", tables: [bricoAppTable(tables.myLoyaltyBonusTotal)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setTotals([]);
    }

    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    return {totals};
}
