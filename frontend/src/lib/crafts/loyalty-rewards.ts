/**
 * loyalty-rewards.ts — `/account/loyalty`'s own view of `brico-app`'s `my_loyalty_reward`.
 */
import {tables} from "@brico/bindings/brico-app";
import type {LoyaltyReward} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface LoyaltyRewardsHandle {
    /** The caller's own loyalty-reward rows, as a payer. */
    rewards: Accessor<LoyaltyReward[]>;
    upsert: (payeePlayerId: bigint, currency: string, ratioNumerator: bigint, ratioDenominator: bigint) => Promise<void>;
    remove: (payeePlayerId: bigint, currency: string) => Promise<void>;
}

export function createLoyaltyRewards(): LoyaltyRewardsHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rewards, setRewards] = createSignal<LoyaltyReward[]>([]);

    function readRows() {
        const active = conn.active();
        setRewards(active ? [...active.db.myLoyaltyReward.iter()] as LoyaltyReward[] : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing — see `~/lib/notifications/state.tsx`'s `subscribe()` doc
        // comment for the exact re-subscribe race this avoids.
        const request = untrack(() =>
            conn.requestResource({key: "loyalty-rewards:self", tables: [bricoAppTable(tables.myLoyaltyReward)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRewards([]);
    }

    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    async function upsert(payeePlayerId: bigint, currency: string, ratioNumerator: bigint, ratioDenominator: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.upsertLoyaltyReward({payeePlayerId, currency, ratioNumerator, ratioDenominator, updatedAt: Timestamp.now()});
    }

    async function remove(payeePlayerId: bigint, currency: string): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.deleteLoyaltyReward({payeePlayerId, currency});
    }

    return {rewards, upsert, remove};
}
