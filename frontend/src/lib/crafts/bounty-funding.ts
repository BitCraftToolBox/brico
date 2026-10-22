/**
 * bounty-funding.ts — the caller's own per-craft bounties, overrides and escrow funding status, as
 * read by the craft detail page, the override editor, the My bounties page and the Stelo wallet
 * unlink dialog.
 */
import {tables} from "@brico/bindings/brico-app";
import type {
    BountyEscrowWallet,
    CraftBountyAssignment,
    CraftBountyEscrow,
    CraftBountyFunding,
    CraftBountyOverride,
    CraftPrivateBountyAssignment,
    SteloTransfer,
} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {useAccount} from "~/lib/account/state";
import {CRAFT_BOUNTY_RESOURCE} from "~/lib/crafts/bounty";
import type {AssignmentFacts} from "~/lib/crafts/my-bounties";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface CraftBountyOverridesHandle {
    /** The caller's own overrides by craft id. */
    overrides: Accessor<ReadonlyMap<bigint, CraftBountyOverride>>;
    /** True once the first read has applied. */
    ready: Accessor<boolean>;
}

/** Subscribes to `my_craft_bounty_override` while logged in. */
export function createCraftBountyOverrides(): CraftBountyOverridesHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [overrides, setOverrides] = createSignal<ReadonlyMap<bigint, CraftBountyOverride>>(new Map());
    const [ready, setReady] = createSignal(false);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setOverrides(new Map());
            setReady(false);
            return;
        }
        setOverrides(new Map(active.db.myCraftBountyOverride.iter().map(row => [row.craftId, row as CraftBountyOverride])));
        setReady(true);
    }

    let release: (() => void) | null = null;
    createEffect(() => {
        if (acc.isLoggedIn()) {
            if (release) return;
            release = untrack(() =>
                conn.requestResource({key: "craft-overrides:self", tables: [bricoAppTable(tables.myCraftBountyOverride)]}, readRows)
            ).release;
        } else {
            release?.();
            release = null;
            setOverrides(new Map());
            setReady(false);
        }
    });

    return {overrides, ready};
}

/**
 * The assignments the caller is the payer of, public and private. Shares the browser's
 * `crafts:bounty-assignments` resource and keeps the rows assigned by the caller's identity.
 */
export function createMyBountyAssignments(): Accessor<readonly AssignmentFacts[]> {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [assignments, setAssignments] = createSignal<readonly AssignmentFacts[]>([]);

    function readRows() {
        const active = conn.active();
        const me = active?.identity;
        if (!active || !me) return setAssignments([]);
        const mine: AssignmentFacts[] = [];
        for (const row of active.db.allCraftBountyAssignment.iter() as Iterable<CraftBountyAssignment>) {
            if (row.assignedByAccountIdentity.isEqual(me)) mine.push({...factsOf(row), private: false});
        }
        for (const row of active.db.myPrivateCraftBountyAssignment.iter() as Iterable<CraftPrivateBountyAssignment>) {
            mine.push({...factsOf(row), private: true});
        }
        setAssignments(mine);
    }

    let release: (() => void) | null = null;
    createEffect(() => {
        if (acc.isLoggedIn()) {
            if (release) return;
            release = untrack(() => conn.requestResource(CRAFT_BOUNTY_RESOURCE, readRows)).release;
        } else {
            release?.();
            release = null;
            setAssignments([]);
        }
    });

    return assignments;
}

const factsOf = (row: CraftBountyAssignment | CraftPrivateBountyAssignment) =>
    ({craftId: row.craftId, numerator: row.ratioNumerator, denominator: row.ratioDenominator, currency: row.currency});

/** Everything the payer-side funding UI reads about escrowed bounties. */
export interface CraftBountyFundingHandle {
    /** The caller's funding-status rows by craft id. */
    funding: Accessor<ReadonlyMap<bigint, CraftBountyFunding>>;
    /** The caller's open (not closed) escrow holds by craft id. */
    openEscrows: Accessor<ReadonlyMap<bigint, CraftBountyEscrow>>;
    /** Refund-due rows, one per paying wallet (`fundingAccountId`). */
    escrowWallets: Accessor<readonly BountyEscrowWallet[]>;
    /** The caller's failed Stelo transfers as a payer. */
    failedTransfers: Accessor<readonly SteloTransfer[]>;
    ready: Accessor<boolean>;
}

/** Subscribes to the funding-status, escrow and transfer views while logged in. */
export function createCraftBountyFunding(): CraftBountyFundingHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [funding, setFunding] = createSignal<ReadonlyMap<bigint, CraftBountyFunding>>(new Map());
    const [openEscrows, setOpenEscrows] = createSignal<ReadonlyMap<bigint, CraftBountyEscrow>>(new Map());
    const [escrowWallets, setEscrowWallets] = createSignal<readonly BountyEscrowWallet[]>([]);
    const [failedTransfers, setFailedTransfers] = createSignal<readonly SteloTransfer[]>([]);
    const [ready, setReady] = createSignal(false);

    function clear() {
        setFunding(new Map());
        setOpenEscrows(new Map());
        setEscrowWallets([]);
        setFailedTransfers([]);
        setReady(false);
    }

    function readRows() {
        const active = conn.active();
        if (!active) return clear();
        setFunding(new Map(active.db.myCraftBountyFunding.iter().map(row => [row.craftId, row as CraftBountyFunding])));
        setOpenEscrows(new Map(
            active.db.myCraftBountyEscrow.iter()
                .filter(row => row.closedAt === undefined)
                .map(row => [row.craftId, row as CraftBountyEscrow]),
        ));
        setEscrowWallets([...active.db.myBountyEscrowWallet.iter()] as BountyEscrowWallet[]);
        setFailedTransfers(active.db.mySteloTransfer.iter().filter(row => row.state.tag === "Failed").toArray() as SteloTransfer[]);
        setReady(true);
    }

    let release: (() => void) | null = null;
    createEffect(() => {
        if (acc.isLoggedIn()) {
            if (release) return;
            release = untrack(() =>
                conn.requestResource({
                    key: "craft-funding:self",
                    tables: [
                        bricoAppTable(tables.myCraftBountyFunding),
                        bricoAppTable(tables.myCraftBountyEscrow),
                        bricoAppTable(tables.myBountyEscrowWallet),
                        bricoAppTable(tables.mySteloTransfer),
                    ],
                }, readRows)
            ).release;
        } else {
            release?.();
            release = null;
            clear();
        }
    });

    return {funding, openEscrows, escrowWallets, failedTransfers, ready};
}
