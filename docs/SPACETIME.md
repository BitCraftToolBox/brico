# SpacetimeDB developer guide

How the frontend talks to SpacetimeDB, and the two backend modules behind it.

## The moving pieces

| Layer | File | Owns |
| --- | --- | --- |
| Per-SDK driver | `frontend/src/lib/spacetime/adapter.ts` | The `SdkAdapter` interface — the only place that may name a concrete SpacetimeDB SDK package |
| One connection | `frontend/src/lib/spacetime/connection.ts` | Dial/reconnect/token/resource-subscribe for one `(uri, module)`, no Solid lifecycle, no SDK |
| Registry | `frontend/src/lib/spacetime/manager.tsx` | App-wide, ref-counted; shares one socket and one subscription across every page that asks for it |
| prism binding | `frontend/src/lib/spacetime/prism.ts` | `PRISM_SERVER` — prism's relay module (BitCraft world data: crafts, claims, players, regions) |
| brico-app binding | `frontend/src/lib/spacetime/brico-app.ts` | `BRICO_APP_SERVER` — brico's own module (accounts, filters/watches, bounties, payouts) |
| Backend module | `backend/brico-module/README.md` | brico-app's tables/reducers/views — see that README |
| Bridge worker | `backend/brico-bot/README.md` | The process joining prism + brico-app data and running the filter/bounty engine — see that README |

There are two independent live connections a page might hold: `PRISM_SERVER` (anonymous, world
data) and `BRICO_APP_SERVER` (OIDC-authenticated once logged in, brico's own per-account data).
Nothing about the connection manager or `connection.ts` distinguishes them — they're just two
`ServerDescriptor`s with different adapters, hosts and token namespaces.

## Quick reference

| When/What                                         | Use |
|---------------------------------------------------| --- |
| Getting the connection for a page                 | `useConnection(PRISM_SERVER)` or `useConnection(BRICO_APP_SERVER)` — during render, holds a claim for the component's lifetime |
| Declaring which tables/rows I need                | A `ResourceSpec` (a `key` plus `TableQuery[]`), passed to `connection.requestResource(spec, onChange)` |
| Reusing rows another page already subscribed to   | Reuse the *same* `spec.key` — the manager shares the subscription and only unsubscribes after the last claim releases |
| Reading rows out of the cache                     | `connection.active()?.db.<table>.iter()`, only once `requestResource(...).ready()` is `true` |
| Showing connection health                         | `connection.status()` (`connecting` / `syncing` / `live` / `error` / `closed`) |
| Knowing when *my* data is actually here           | The `ready` a specific `requestResource(...)` call returned — not `status()` |
| A live signal driving `createEffect` side effects | Wrap the specific boolean/derived value in its own `createMemo` first — see "Signals over live data" |
| A table whose rows arrive as a live feed          | `LiveTable`, not `DataTable` |
| Adding a new prism table to a resource            | `prismTable(tables.x)` (whole table) or `prismRows(tables.x, tables.x.where(...))` (narrowed) |
| Adding a new brico-app view to a resource         | `bricoAppTable(tables.x)` |

## Connection manager

`useConnection(server)` (`lib/spacetime/manager.tsx`) returns a `ManagedConnection`: `status`,
`error`, `active`, `reconnect`, `close`, `primeToken`/`clearToken`, and `requestResource`. Call it
during render — it registers an `onCleanup` that releases the claim on unmount. Holding the
connection alone (before requesting any resource) is itself a claim, which is why a page can render
`status()` immediately without racing a `requestResource` call.

The manager keys connections by `(uri, module)` and reference-counts two things independently:

- **Per resource** — two callers passing the same `spec.key` share one subscription; it drops only
  after the last claim releases.
- **Per connection** — the socket closes only after every resource *and* every bare `connection()`
  claim on it is gone.

Both use a grace period (default 20s) before actually tearing anything down, so a route transition
(browse → detail → back) never pays for a fresh handshake and full re-subscribe. A request that
arrives inside the grace window just cancels the pending teardown.

`AccountProvider` (`lib/account/state.tsx`) is the one caller that holds a bare, app-lifetime
`useConnection(BRICO_APP_SERVER)` claim and calls `conn.close()` itself on logout, rather than
relying on ref-counting — its own claim never unwinds (the provider is mounted once, above the
router), so nothing else would ever bring the ref count to zero.

## Adding a resource

A `ResourceSpec<TQuery>` is `{ key, tables }`. `key` is the resource's *identity* — two callers who
want the same rows must pass the same key, and a per-object resource folds the id into it
(`crafts:detail:1234`). `tables` is a list of `{ table, query }` pairs, built with a helper from the
matching binding file:

```ts
// Whole table:
prismTable(tables.claimInfo)
bricoAppTable(tables.myAccount)

// Narrowed (server-side .where(...)):
prismRows(tables.playerState, tables.playerState.where(row => row.entityId.eq(id)))
```

Then: `const request = connection.requestResource(spec, onChange)`. `onChange` fires once when the
subscription first applies and again on any row change in those tables — it is **per requester**,
and the SDK delivers one callback per row, so coalesce it yourself (see `relay.ts`'s
`throttle`/`leadingAndTrailing` use for the pattern: a snapshot rebuild coalesced to one per
`REBUILD_INTERVAL_MS`, not a reactive graph re-rendering per row).

`request.ready()` and `request.release()` are the two things you get back — see "Status vs
readiness" below for `ready`. `release()` is idempotent and auto-wired to the owning computation's
cleanup when called during render; call it yourself if the request was made outside one (e.g. from
a timer).

**prism vs brico-app**: pick the server that owns the data you need. World/game data (crafts,
claims, players, regions) is prism, always anonymous. Per-account data (accounts, saved filters,
watches, bounty rules, payouts) is brico-app, and requires the connection to have a token primed
(`conn.primeToken(idToken)`) before it will return non-empty `my_*` rows — see
`backend/brico-module/README.md` for the view-level enforcement. A page needing both holds two
separate `useConnection` calls; nothing links them below the resource layer, so it's on your query
logic (e.g. matching a brico-app `linked_integration.externalId` against a prism `player_state`
row) to join across them client-side.

## Status vs readiness

These answer different questions and gating the wrong one is the most common bug in this layer:

- **`connection.status()`** is connection-wide: `connecting → syncing → live`, or `error`/`closed`.
  It flips to `live` once every resource *registered at that moment* has applied, and by design
  **never reverts to `syncing`** afterward (see `refreshStatus` in `connection.ts`). Adding a new
  resource to an already-live connection (routing from the craft browser to one craft's detail page,
  which shares the socket) leaves `status()` reporting `live` immediately — before the new
  resource's own subscription has actually applied. Use `status()` only for connection health (a
  badge, a reconnect button), never as a proxy for "my data is here."
- **A resource's own `ready()`** (from `requestResource`'s return value) is per-request: freshly
  `false` on every new request, `true` once *that* request's subscription has applied. This is what
  a page should gate its "loading" state on. `relay.ts`'s `CraftRelay.ready` and
  `CraftDetailRelay.ready` are the reference examples — both are deliberately distinct from
  `status()`, with doc comments spelling out exactly this gap.

A frequent follow-on bug: a *coalesced* rebuild (a throttled snapshot, like `relay.ts`'s) can lag
`ready()` flipping true by up to one throttle interval, which briefly makes an empty/stale snapshot
look "ready." Where that matters, rebuild synchronously the instant `ready()` flips, in addition to
the throttled path — see `relay.ts`'s repeated `if (isReady) rebuild();` before `setReady(isReady)`.

## Signals/memos over live data

A live row (an account, a craft, anything arriving over a subscription) gets replaced on **every**
write, including ones nothing on screen actually depends on — `account`'s row is rewritten every
time `lastSeenAt` bumps, from this device's own reconnects or another live session on the same
account. Solid's `createEffect` re-runs on every write to a signal it reads, not just ones that
change a value the effect cares about.

**Never gate a `createEffect` with cleanup/resource side effects (subscribing, `requestResource`,
opening a connection, ...) directly on a live row or a naive derivation of one.** Wrap the specific
thing the effect actually depends on in its own `createMemo` first, so the effect only re-runs when
*that* value changes:

```ts
// Bad: re-runs on every row write, including irrelevant ones (e.g. lastSeenAt).
createEffect(() => { if (account() !== null) doSomething(); });

// Good: stable across writes that don't change the derived value.
const isLoggedIn = createMemo(() => account() !== null);
createEffect(() => { if (isLoggedIn()) doSomething(); });
```

`lib/account/state.tsx`'s `isLoggedIn` is the canonical example — its own doc comment and
`account`'s both explain this, and `lib/crafts/filter-sync.tsx`'s `loggedIn` hit the bug this
guards against (a second session on the same account touching the row re-triggered subscribe/
unsubscribe). This applies to any live row, not just accounts — the pattern is general, not an
account-specific quirk.

## `LiveTable`

`components/data-table/live-table.tsx` — table chrome for rows that arrive as a **live feed**
(subscription-driven, ticking several times a second), as opposed to `DataTable`, which is built
around the static game-data tables (search, faceted filters, URL round-tripping, per-table facet
row models installed unconditionally). A feed doesn't want any of that: filtering belongs to
whatever domain-specific filter UI the page already has (e.g. `FilterBuilder`), and re-deriving
per-column facets over a fast-changing dataset is pure waste.

`LiveTable` keeps only sortable headers, pagination, the "View" column-visibility toggle and the
persisted hidden-column set — shared with `DataTable` via the same settings store, so a column
hidden on one behaves identically on the other (`name` must be unique across both). It disables
`autoResetPageIndex`/`autoResetExpanded` (a live feed replacing `data` every tick would otherwise
bounce the reader back to page 1 / collapse every expanded group on the next tick). Pass
`getRowId` — feed row objects are rebuilt every tick, so stable identity has to come from the data,
not object reference.

## Backend: tables, views, reducers

Full details live in `backend/brico-module/README.md` (schema/views/reducers) and
`backend/brico-bot/README.md` (the process that bridges prism + brico-app). Two rules worth
repeating here because they're easy to get wrong from the frontend side:

- **New tables are private by default.** A client never subscribes to a table directly — it
  subscribes to a **view**, gated on `ctx.sender` (a `my_*` view) or on `service_principal`
  membership (an `all_*` view, for `brico-bot`). Prefer a *query* view (`ctx.from.x.where(...)`) —
  the server filters and maintains it incrementally. Only fall back to a *procedural* view
  (`ctx.db` + a materialized array) when the result spans multiple tables, or when the filter column
  is `t.option(...)` (`.eq()` on an optional column silently matches nothing — use an index
  accessor's `.filter()` instead).
- **Reducers validate every argument server-side.** A reducer is a public entry point regardless of
  what UI calls it — a hand-crafted `spacetime call` bypasses every frontend parser. Validate shape
  (e.g. `saved_craft_filter.filterJson` against `validateFilter`), check ownership before mutating
  another account's row, and never trust an identity passed as an argument — use `ctx.sender`.

## Verification

```bash
npm run typecheck                                          # frontend
npm run typecheck --prefix backend/brico-module/spacetimedb # backend module
npm run typecheck --workspace backend/brico-bot             # bridge worker
```
