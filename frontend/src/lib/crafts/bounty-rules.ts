/**
 * bounty-rules.ts — the `/account/bounty-rules` page's own view of `brico-app`'s `my_bounty_rule`.
 */
import {tables} from "@brico/bindings/brico-app";
import type {BountyRule, BountyRuleValue} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface BountyRuleDraft {
    id: string;
    filterJson: string;
    value: BountyRuleValue;
    priority: number;
    private: boolean;
}

export interface BountyRulesHandle {
    /** The caller's own bounty rules, non-tombstoned, sorted by priority (ascending — 0 first). */
    rules: Accessor<BountyRule[]>;
    upsert: (rule: BountyRuleDraft) => Promise<void>;
    remove: (id: string) => Promise<void>;
    /** Rewrites priority to match `orderedIds` — the up/down move buttons call this with the whole reordered id list. */
    reorder: (orderedIds: string[]) => Promise<void>;
}

export function createBountyRules(): BountyRulesHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rules, setRules] = createSignal<BountyRule[]>([]);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setRules([]);
            return;
        }
        const rows = ([...active.db.myBountyRule.iter()] as BountyRule[])
            .filter(rule => rule.deletedAt === undefined)
            .sort((a, b) => a.priority - b.priority);
        setRules(rows);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing — see `~/lib/notifications/state.tsx`'s `subscribe()` doc
        // comment for the exact re-subscribe race this avoids.
        const request = untrack(() =>
            conn.requestResource({key: "bounty-rules:self", tables: [bricoAppTable(tables.myBountyRule)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRules([]);
    }

    // `acc.isLoggedIn()` is a `createMemo` at the source, so this only re-runs on the actual
    // boolean flip — see `account/state.tsx`'s doc comment on `account`.
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    async function upsert(rule: BountyRuleDraft): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.upsertBountyRule({...rule, updatedAt: Timestamp.now()});
    }

    async function remove(id: string): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.deleteBountyRule({id, deletedAt: Timestamp.now()});
    }

    async function reorder(orderedIds: string[]): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.reorderBountyRules({orderedIds});
    }

    return {rules, upsert, remove, reorder};
}
