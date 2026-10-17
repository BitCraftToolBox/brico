/**
 * bounty.ts — the craft browser/detail page's read-only view of `brico-app`'s
 * `all_craft_bounty_assignment` and `my_private_craft_bounty_assignment` views, merged into one map.
 *
 * Unlike every other `brico-app` table this frontend reads, this one needs no login: the public
 * view is unconditionally public (`ctx.from.craft_bounty_assignment.where(_ => true)`, no
 * service-principal gate), so an anonymous connection sees it too — bounty viewing only ever needs
 * a subscription, never `ensureAccount` or a reducer call. `my_private_craft_bounty_assignment` is
 * account-filtered rather than gated, so an anonymous or logged-out connection simply gets 0 rows
 * back from it rather than an error — no login check needed here either.
 * `craft_bounty_assignment`/`craft_private_bounty_assignment` themselves live on `brico-app`, a
 * separate module from prism, so this is its own small connection/subscription, independent of
 * `~/lib/crafts/relay.ts`'s prism snapshot.
 */
import {tables} from "@brico/bindings/brico-app";
import type {CraftBountyAssignment, CraftPrivateBountyAssignment} from "@brico/bindings/brico-app/types";
import type {CraftBountyFacts} from "@brico/crafts/subject";
import {type Accessor, createSignal, onCleanup, onMount} from "solid-js";
import {BRICO_APP_SERVER, type BricoAppQuery, bricoAppTable} from "~/lib/spacetime/brico-app";
import type {ResourceSpec} from "~/lib/spacetime/connection";
import {useConnection} from "~/lib/spacetime/manager";

const CRAFT_BOUNTY_RESOURCE: ResourceSpec<BricoAppQuery> = {
    key: "crafts:bounty-assignments",
    tables: [bricoAppTable(tables.allCraftBountyAssignment), bricoAppTable(tables.myPrivateCraftBountyAssignment)],
};

function toBountyFacts(row: CraftBountyAssignment | CraftPrivateBountyAssignment, isPrivate: boolean): CraftBountyFacts {
    return {ratioNumerator: row.ratioNumerator, ratioDenominator: row.ratioDenominator, currency: row.currency, private: isPrivate};
}

/**
 * Opens (or reuses) the `brico-app` connection for the lifetime of the calling component and
 * exposes every craft's resolved bounty, keyed by craft entity id (decimal string, matching
 * `CraftEntry.id`/`CraftRow.id`) — the caller's own private bounties merged in alongside the
 * public ones, since the two tables are mutually exclusive per craft.
 */
export function createBountyAssignments(): Accessor<Map<string, CraftBountyFacts>> {
    const [assignments, setAssignments] = createSignal<Map<string, CraftBountyFacts>>(new Map());
    const conn = useConnection(BRICO_APP_SERVER);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setAssignments(new Map());
            return;
        }
        const rows = new Map<string, CraftBountyFacts>();
        for (const row of active.db.allCraftBountyAssignment.iter() as Iterable<CraftBountyAssignment>) {
            rows.set(row.craftId.toString(), toBountyFacts(row, false));
        }
        for (const row of active.db.myPrivateCraftBountyAssignment.iter() as Iterable<CraftPrivateBountyAssignment>) {
            rows.set(row.craftId.toString(), toBountyFacts(row, true));
        }
        setAssignments(rows);
    }

    // Requested on mount, matching `~/lib/crafts/relay.ts`'s `createCraftRelay` — this subscription
    // lives for the component's whole lifetime rather than toggling with a reactive login state, so
    // there's no `createEffect`/`untrack` race to guard against here.
    let release: (() => void) | null = null;
    onMount(() => {
        const request = conn.requestResource(CRAFT_BOUNTY_RESOURCE, readRows);
        release = request.release;
    });
    onCleanup(() => release?.());

    return assignments;
}
