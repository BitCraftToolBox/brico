/**
 * relay.ts — the craft-specific half of the live connection to prism's relay module.
 *
 * The snapshot is deliberately raw relay rows. Turning them into something a filter can be
 * evaluated against — which needs the static game data — is `entries.ts`'s job.
 */
import {tables} from "@brico/bindings/prism";
import type {ClaimInfo, ClaimMember, CraftContribution, CraftMeta, CraftProgress, PlayerState, Region} from "@brico/bindings/prism/types";
import {leadingAndTrailing, throttle} from "@solid-primitives/scheduled";
import {type Accessor, createEffect, createSignal, onCleanup, onMount} from "solid-js";
import type {ConnectionStatus, ResourceSpec} from "~/lib/spacetime/connection";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER, type PrismConnection, type PrismQuery, prismRows, prismTable} from "~/lib/spacetime/prism";

/** How long row changes are coalesced before the snapshot is rebuilt. */
const REBUILD_INTERVAL_MS = 500;

/** Named the same as before the connection layer was generalized; now just the generic status. */
export type RelayStatus = ConnectionStatus;

/**
 * The tables a craft is resolved *against* — claims, claim membership, players, regions.
 *
 * Split out from the crafts themselves so that navigating from the browser to one craft's detail
 * page (and back) never re-subscribes them: both views hold the same resource key, so the manager
 * sees an unbroken claim across the transition and the reference rows never leave the cache.
 */
export const CRAFT_REFERENCE_RESOURCE: ResourceSpec<PrismQuery> = {
    key: "crafts:reference",
    tables: [
        prismTable(tables.claimInfo),
        prismTable(tables.claimMember),
        prismTable(tables.playerState),
        prismTable(tables.region),
    ],
};

/**
 * A boolean expression matching `column` against any of `ids` — `col.eq(id1).or(col.eq(id2))...` —
 * or, when `ids` is empty, `column.eq(0n)`. `0n` is never a real BitCraft entity id (see
 * `@brico/crafts/subject`'s `optionalId`), so an account with no linked players subscribes to
 * nothing rather than every row. Loosely typed on purpose: the generated query builder's `.eq()`/
 * `.or()` types are internal to `spacetimedb`, which this file deliberately never imports directly
 * (see `~/lib/spacetime/prism.ts`'s doc comment) — every caller here passes a concrete column and
 * gets a concrete filtered query straight back out.
 */
function eqAny(column: {eq(id: bigint): any}, ids: readonly bigint[]): any {
    if (ids.length === 0) return column.eq(0n);
    let expr = column.eq(ids[0]);
    for (let i = 1; i < ids.length; i++) expr = expr.or(column.eq(ids[i]));
    return expr;
}

/**
 * The reference tables for a filter builder that should only ever preview *one account's own*
 * characters — the bounty rule builder (`/account/bounties`), which has no live craft list to draw
 * options from the way the browser does.
 *
 * `region`/`claimInfo` stay whole-table subscriptions, same as `CRAFT_REFERENCE_RESOURCE` — every
 * claim is a legitimate thing to filter a rule on, not just ones the account owns (see
 * `CraftReferenceSelf.claims`'s doc comment), so there's no per-account narrowing to do here at all.
 * `player_state` is the one table actually worth narrowing: it mirrors every player in the game, so
 * it's filtered to the given player ids rather than pulled in full just to preview a handful of
 * characters.
 */
export function craftReferenceSelfResource(playerIds: readonly bigint[]): ResourceSpec<PrismQuery> {
    const sortedIds = [...playerIds].sort();
    return {
        key: `crafts:reference:self:${sortedIds.join(",")}`,
        tables: [
            prismTable(tables.region),
            prismTable(tables.claimInfo),
            prismRows(tables.playerState, tables.playerState.where(row => eqAny(row.entityId, sortedIds))),
            prismRows(tables.claimMember, tables.claimMember.where(row => eqAny(row.playerEntityId, sortedIds))),
        ],
    };
}

/**
 * Every craft in the game, with its progress — what the browser lists.
 *
 * Unfiltered: `craft_progress` carries no region column, so a per-region subscription could not
 * keep progress in step with the crafts it belongs to. `craft_contribution` is left out entirely —
 * it is the highest-volume table here and nothing the browser filters on or displays needs it;
 * the detail page subscribes to one craft's slice of it instead.
 */
export const CRAFT_LIST_RESOURCE: ResourceSpec<PrismQuery> = {
    key: "crafts:list",
    tables: [
        prismTable(tables.craftMeta),
        prismTable(tables.craftProgress),
    ],
};

/**
 * One craft: its own row, its progress, and its contributions.
 *
 * Narrowed server-side by entity id, which is the point of the exercise — `craft_contribution` is
 * far too large to subscribe to whole, but one craft's slice of it is a handful of rows. The craft
 * and progress rows are re-requested here rather than assumed present because this page is
 * linkable directly, and because a craft that has been claimed or removed within the last 24 hours
 * is still a valid id even though the browser's list no longer shows it.
 */
export function craftDetailResource(craftId: bigint): ResourceSpec<PrismQuery> {
    return {
        key: `crafts:detail:${craftId}`,
        tables: [
            prismRows(tables.craftMeta, tables.craftMeta.where(row => row.entityId.eq(craftId))),
            prismRows(tables.craftProgress, tables.craftProgress.where(row => row.entityId.eq(craftId))),
            prismRows(tables.craftContribution, tables.craftContribution.where(row => row.craftId.eq(craftId))),
        ],
    };
}

export interface CraftSnapshot {
    /** Crafts in scope. The browser's snapshot holds only `Active` ones — see `readSnapshot`. */
    crafts: CraftMeta[];
    /** Craft progress, keyed by the craft's `entityId` — `craft_progress` has no region column. */
    progress: Map<bigint, CraftProgress>;
    claims: Map<bigint, ClaimInfo>;
    /** `claim_member` rows keyed by `` `${claimEntityId}:${playerEntityId}` ``, for looking up a specific player's access in a specific claim. */
    claimMembers: Map<string, ClaimMember>;
    players: Map<bigint, PlayerState>;
    /** Region rows, keyed by id — the authoritative source of region display names. */
    regions: Map<number, Region>;
}

export const EMPTY_SNAPSHOT: CraftSnapshot = {
    crafts: [],
    progress: new Map(),
    claims: new Map(),
    claimMembers: new Map(),
    players: new Map(),
    regions: new Map(),
};

export interface CraftRelay {
    snapshot: Accessor<CraftSnapshot>;
    status: Accessor<RelayStatus>;
    error: Accessor<string | null>;
    /**
     * True once *this* relay's own resources — `CRAFT_REFERENCE_RESOURCE` and `CRAFT_LIST_RESOURCE`
     * — have delivered their rows.
     */
    ready: Accessor<boolean>;
    /** Drop the current connection and dial again immediately. */
    reconnect: () => void;
}

export interface CraftDetailRelay extends CraftRelay {
    /**
     * True once this craft's own subscription has delivered its rows — the difference between
     * "no such craft" and "not asked yet". Connection `status` cannot say: on arrival from the
     * browser the connection is already `live` while this craft's rows are still in flight.
     */
    ready: Accessor<boolean>;
    /** `craft_contribution` rows for this craft, in relay order. */
    contributions: Accessor<CraftContribution[]>;
}

/**
 * Crafts the browser should show.
 *
 * `craft_meta` keeps a craft for 24 hours after it leaves the game, flipping `status` to `Claimed`
 * or `Removed` rather than deleting the row, so that history is still queryable. Without this
 * filter the browser presents a day's worth of crafts nobody can contribute to as open work. The
 * retained rows are still reachable by id on the detail page; here they are simply not open work.
 *
 * Filtered client-side rather than in the subscription: `status` is a sum type, and the relay's
 * query builder only compares columns against scalar literals.
 */
function isActive(craft: CraftMeta): boolean {
    return craft.status.tag === "Active";
}

/**
 * The reference half of a snapshot — everything a craft is resolved *against*, with no crafts in
 * it. Shared by the browser (which adds every open craft) and the detail page (which adds one).
 */
function readReference(conn: PrismConnection): Omit<CraftSnapshot, "crafts"> {
    const progress = new Map<bigint, CraftProgress>();
    for (const row of conn.db.craftProgress.iter()) progress.set(row.entityId, row);

    const claims = new Map<bigint, ClaimInfo>();
    for (const row of conn.db.claimInfo.iter()) claims.set(row.entityId, row);

    const claimMembers = new Map<string, ClaimMember>();
    for (const row of conn.db.claimMember.iter() as Iterable<ClaimMember>) {
        claimMembers.set(`${row.claimEntityId}:${row.playerEntityId}`, row);
    }

    const players = new Map<bigint, PlayerState>();
    for (const row of conn.db.playerState.iter()) players.set(row.entityId, row);

    const regions = new Map<number, Region>();
    for (const row of conn.db.region.iter()) regions.set(row.id, row);

    return {progress, claims, claimMembers, players, regions};
}

/** Every open craft in the cache, resolved against the reference tables. */
export function readSnapshot(conn: PrismConnection): CraftSnapshot {
    return {...readReference(conn), crafts: [...conn.db.craftMeta.iter()].filter(isActive)};
}

/**
 * One craft, whatever its status, resolved against the reference tables.
 *
 * Deliberately *not* `isActive`-filtered: a craft claimed or removed in the last 24 hours is still
 * in `craft_meta`, and a link to it should still render rather than 404 while the relay is
 * plainly still holding the row.
 */
export function readCraftSnapshot(conn: PrismConnection, craftId: bigint): CraftSnapshot {
    const crafts: CraftMeta[] = [];
    for (const row of conn.db.craftMeta.iter()) {
        if (row.entityId === craftId) {
            crafts.push(row);
            break;
        }
    }
    return {...readReference(conn), crafts};
}

function readContributions(conn: PrismConnection, craftId: bigint): CraftContribution[] {
    const rows: CraftContribution[] = [];
    for (const row of conn.db.craftContribution.iter() as Iterable<CraftContribution>) {
        if (row.craftId === craftId) rows.push(row);
    }
    return rows;
}

/**
 * Opens the relay for the lifetime of the calling component and exposes the coalesced snapshot of
 * every open craft.
 *
 * Must be called during render (it uses `onMount`/`onCleanup`), and only takes effect on the
 * client — on the server it stays at `EMPTY_SNAPSHOT` and never dials.
 */
export function createCraftRelay(): CraftRelay {
    const [snapshot, setSnapshot] = createSignal<CraftSnapshot>(EMPTY_SNAPSHOT);
    const [ready, setReady] = createSignal(false);
    const connection = useConnection(PRISM_SERVER);

    const rebuild = () => {
        const conn = connection.active();
        if (conn) setSnapshot(readSnapshot(conn));
    };
    const scheduleRebuild = throttle(rebuild, REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRebuild.clear());

    // Requested on mount, not during render: dialing a WebSocket mid-render would be a side effect
    // during hydration, and `onMount` never runs on the server.
    onMount(() => {
        const reference = connection.requestResource(CRAFT_REFERENCE_RESOURCE, scheduleRebuild);
        const list = connection.requestResource(CRAFT_LIST_RESOURCE, scheduleRebuild);
        // Each `requestResource` call's `ready()` is this *request's* own readiness, freshly false
        // until its resource (re)applies — unlike `connection.status()`, it correctly goes back to
        // false when the browser remounts and re-requests `crafts:list` after it timed out and was
        // released while a craft's detail page held the connection open on its own narrower query.
        createEffect(() => setReady(reference.ready() && list.ready()));
    });

    // `ready` flips the instant both resources have applied, but `scheduleRebuild` is a
    // trailing-only throttle — its first real rebuild always lags that by up to
    // `REBUILD_INTERVAL_MS`. Without this, the table would report ready over an empty (or stale)
    // snapshot (and the browser's `empty` prop reads that as "no crafts match this filter") until
    // the throttle caught up. The rows are already in the cache the moment we're ready, so read
    // them immediately.
    createEffect(() => {
        if (ready()) rebuild();
    });

    return {
        snapshot,
        status: connection.status,
        error: connection.error,
        ready,
        // The last snapshot is deliberately left on screen while redialing — stale rows beside a
        // visible "connecting" badge beat a table that empties itself for a second.
        reconnect: connection.reconnect,
    };
}

/** One account's own preview reference data — see `craftReferenceSelfResource`. */
export interface CraftReferenceSelf {
    regions: Map<number, Region>;
    players: Map<bigint, PlayerState>;
    claims: Map<bigint, ClaimInfo>;
    claimMembers: ClaimMember[];
}

const EMPTY_REFERENCE_SELF: CraftReferenceSelf = {regions: new Map(), players: new Map(), claims: new Map(), claimMembers: []};

function readReferenceSelf(conn: PrismConnection, playerIds: readonly bigint[]): CraftReferenceSelf {
    const idSet = new Set(playerIds);

    const regions = new Map<number, Region>();
    for (const row of conn.db.region.iter()) regions.set(row.id, row);

    // Filtered again client-side, on top of the subscription's own narrowing: this connection may
    // be shared (see `~/lib/spacetime/manager.tsx`) with a broader subscription elsewhere — e.g. the
    // browser's `CRAFT_REFERENCE_RESOURCE` — whose full `player_state` would otherwise leak into
    // this page's "own characters only" preview.
    const players = new Map<bigint, PlayerState>();
    for (const row of conn.db.playerState.iter() as Iterable<PlayerState>) {
        if (idSet.has(row.entityId)) players.set(row.entityId, row);
    }

    const claims = new Map<bigint, ClaimInfo>();
    for (const row of conn.db.claimInfo.iter()) claims.set(row.entityId, row);

    const claimMembers = conn.db.claimMember.iter()
        .filter(cm => idSet.has(cm.playerEntityId)).toArray();

    return {regions, players, claims, claimMembers};
}

/**
 * Opens the relay for the lifetime of the calling component and exposes one account's own preview
 * reference data — for the bounty rule builder's `FilterBuilder`, see `craftReferenceSelfResource`.
 *
 * `playerIds` is an accessor because it follows the account's linked BitCraft players, which can
 * change (a link added/removed) while this page stays mounted — the resource is re-requested (and
 * the previous one released, via the same owner-scoped `onCleanup` every other resource here relies
 * on) whenever it does.
 */
export interface CraftReferenceSelfRelay {
    snapshot: Accessor<CraftReferenceSelf>;
    status: Accessor<RelayStatus>;
    error: Accessor<string | null>;
    ready: Accessor<boolean>;
    reconnect: () => void;
}

export function createCraftReferenceSelf(playerIds: Accessor<readonly bigint[]>): CraftReferenceSelfRelay {
    const [snapshot, setSnapshot] = createSignal<CraftReferenceSelf>(EMPTY_REFERENCE_SELF);
    const [ready, setReady] = createSignal(false);
    const connection = useConnection(PRISM_SERVER);

    createEffect(() => {
        const ids = playerIds();
        setSnapshot(EMPTY_REFERENCE_SELF);
        setReady(false);

        const rebuild = () => {
            const conn = connection.active();
            if (conn) setSnapshot(readReferenceSelf(conn, ids));
        };
        const scheduleRebuild = throttle(rebuild, REBUILD_INTERVAL_MS);
        onCleanup(() => scheduleRebuild.clear());

        const request = connection.requestResource(craftReferenceSelfResource(ids), scheduleRebuild);
        createEffect(() => {
            const isReady = request.ready();
            // Same reasoning as `createCraftDetailRelay`'s identical effect: rebuild synchronously
            // on readiness rather than waiting for the throttle's trailing edge, so `ready` never
            // reports true over an empty snapshot.
            if (isReady) rebuild();
            setReady(isReady);
        });
    });

    return {
        snapshot,
        ready,
        status: connection.status,
        error: connection.error,
        reconnect: connection.reconnect,
    };
}

/**
 * Opens the relay for one craft: the reference tables plus that craft's row, progress and
 * contributions.
 *
 * `craftId` is an accessor because the route param is one — navigating between two craft pages
 * reuses the component, and the per-craft resource has to follow. The reference resource is
 * claimed for the whole component lifetime, so it survives that swap (and the swap back to the
 * browser) without re-subscribing.
 */
export function createCraftDetailRelay(craftId: Accessor<bigint | null>): CraftDetailRelay {
    const [snapshot, setSnapshot] = createSignal<CraftSnapshot>(EMPTY_SNAPSHOT);
    const [contributions, setContributions] = createSignal<CraftContribution[]>([]);
    const [ready, setReady] = createSignal(false);
    const connection = useConnection(PRISM_SERVER);

    const rebuild = () => {
        const conn = connection.active();
        const id = craftId();
        if (!conn || id === null) return;
        setSnapshot(readCraftSnapshot(conn, id));
        setContributions(readContributions(conn, id));
    };
    // Leading *and* trailing here, unlike the browser above. The browser's feed is a firehose —
    // a coalesced tick it drops is corrected by the next one milliseconds later. One craft can go
    // quiet immediately after its last contribution lands, and a leading-only throttle would then
    // leave the final numbers unpainted until something else happened to change.
    const scheduleRebuild = leadingAndTrailing(throttle, rebuild, REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRebuild.clear());

    onMount(() => connection.requestResource(CRAFT_REFERENCE_RESOURCE, scheduleRebuild));

    // One resource per craft id, re-requested when the id changes. `createEffect` never runs on
    // the server, which is what keeps this off the SSR path.
    createEffect(() => {
        const id = craftId();
        setSnapshot(EMPTY_SNAPSHOT);
        setContributions([]);
        setReady(false);
        if (id === null) return;
        const request = connection.requestResource(craftDetailResource(id), scheduleRebuild);
        createEffect(() => {
            const isReady = request.ready();
            // `scheduleRebuild`'s throttle may already be mid-cooldown — the reference resource's
            // own arrival can spend the leading edge on a rebuild from before this craft's rows
            // existed. Without this, that leaves the trailing edge (up to `REBUILD_INTERVAL_MS`
            // later) as the only thing that fills in `snapshot`, so `ready` would report true while
            // the page still has nothing to show for this craft. Rebuilding here, synchronously
            // before `ready` itself updates, keeps the two in step.
            if (isReady) rebuild();
            setReady(isReady);
        });
    });

    return {
        snapshot,
        contributions,
        ready,
        status: connection.status,
        error: connection.error,
        reconnect: connection.reconnect,
    };
}

/**
 * The reference table for resolving player ids to their live names.
 */
export const PLAYER_NAMES_RESOURCE: ResourceSpec<PrismQuery> = {
    key: "crafts:reference:player-names",
    tables: [prismTable(tables.playerState)],
};

/**
 * Opens the relay for the lifetime of the calling component and exposes live names for every
 * known player.
 */
export function createPlayerNames(): {names: Accessor<Map<string, string>>; ready: Accessor<boolean>} {
    const [names, setNames] = createSignal<Map<string, string>>(new Map());
    const [ready, setReady] = createSignal(false);
    const connection = useConnection(PRISM_SERVER);

    const rebuild = () => {
        const conn = connection.active();
        if (!conn) return;
        const map = new Map<string, string>();
        for (const row of conn.db.playerState.iter() as Iterable<PlayerState>) {
            map.set(row.entityId.toString(), row.name);
        }
        setNames(map);
    };
    const scheduleRebuild = throttle(rebuild, REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRebuild.clear());

    const request = connection.requestResource(PLAYER_NAMES_RESOURCE, scheduleRebuild);
    createEffect(() => {
        const isReady = request.ready();
        // Same reasoning as `createCraftReferenceSelf`'s identical effect: rebuild synchronously
        // on readiness so `ready` never reports true over an empty name map.
        if (isReady) rebuild();
        setReady(isReady);
    });

    return {names, ready};
}
