# `brico-bot` — the bridge worker

A **long-running Node process**, not a Cloudflare Worker and not a request handler. It holds two
live SpacetimeDB connections at once and runs brico's shared filter engine across both:

```
prism relay-module ──▶┐
  craft_meta          │
  craft_progress      ├──▶ brico-bot ──▶ bounty engine ──▶ craft_bounty_assignment/_entitlement
  craft_contribution  │      (one process, two DbConnections,
  claim_info/_member  │       + static CraftingRecipeDesc read once from offline BSATN)
  player_state,region │
                      ├──▶ @brico/crafts/filter ──▶ watch matches ──▶ notification rows
brico-app ────────────┘        (logged too, always)
  all_account, all_linked_integration, all_saved_craft_filter, all_craft_filter_watch,
  all_bounty_rule, all_craft_bounty_override/_assignment/_entitlement, all_loyalty_reward
```

Individual SpacetimeDB modules cannot subscribe to each other, so joining prism's world data to
brico's per-user watches (and, separately, resolving bounties against prism's craft/claim ownership)
has to happen in a **client** holding both connections. That client is this service. It also runs a
small persistent HTTP server alongside the two connections — BitAuth's OIDC relying party and
Discord's OAuth-handshake linking route, both of which finalize into `brico-app`'s
`noteIntegrationLinkExternal` reducer (see "BitAuth/Discord account linking" below), plus `/healthz`
and a Prometheus `/metrics` endpoint (see "Metrics" below). The Discord bot itself (slash commands,
guild installation), Stelo's relying-party flow, and a report HTTP API are not implemented yet.

## Running it

From the repo root (npm workspaces — install from the root, never from here):

```sh
npm install
npm start --workspace backend/brico-bot        # or: npm run dev --workspace backend/brico-bot
npm test --workspace backend/brico-bot
npm run typecheck --workspace backend/brico-bot
```

Copy `.env.example` to `.env` (gitignored) to change configuration.

### Runtime: `tsx`, not bare `node`

The `common/` workspace packages export raw `.ts` with no build step, and
`@brico/bitcraft-bindings` emits `export namespace`, which Node's strip-only TS loader rejects with
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. So the runtime is `tsx` — for `npm start`, `npm run dev` and
the tests (`node --import tsx --test`) alike. `tsc` is only ever run with `--noEmit`; there is no
build output and no `dist/`. A real `tsc` build stays a viable swap later (`moduleResolution` would
have to move off `bundler`), but nothing needs it today.

## Configuration

Every variable is optional. Real environment variables beat `.env`. Note the names are **not** the
frontend's `VITE_*` ones: this process is not built by Vite, does not read `frontend/.env.local`,
and reusing those names would imply otherwise.

## BitAuth/Discord account linking

`src/http-server.ts` serves four linking routes, all driven by `brico-app`'s shared
`integration_link_request` mechanism (plus `/healthz` and `/metrics`, see "Metrics" below):

- `/auth/bitauth/login?linkCode=<code>` and `/auth/bitauth/callback` — BitAuth's Authorization Code
  + PKCE (S256) flow. `src/auth/oidc-client.ts` does OIDC discovery against `BITAUTH_ISSUER`
  (`/.well-known/openid-configuration`) rather than hardcoding BitAuth's `/connect/*` paths, and
  validates the returned ID token against the issuer's live JWKS with
  [`jose`](https://github.com/panva/jose). **The `iss` claim BitAuth's discovery document declares
  is `https://auth.trinit.is/` (trailing slash) — the JWT verification issuer is always read from
  that discovery document, never from the configured `BITAUTH_ISSUER` string, so this can't silently
  mismatch.**
- `/auth/discord/login?linkCode=<code>` and `/auth/discord/callback` — Discord's OAuth-handshake
  variant (`src/auth/discord-oauth.ts`), plain OAuth2 against `/users/@me` (no ID token, no PKCE —
  Discord's authorization-code flow doesn't require it for a confidential client). This is
  independent of `linkDiscordViaSpacetimeAuth` (the module-side shortcut for a Discord-login brico
  account) and of the bot-initiated `/link` slash command (not implemented yet — needs a real
  discord.js bot process).

Both callbacks correlate the OAuth `state` param back to the link `code` a browser already created
via `beginIntegrationLink` using `src/auth/link-state-store.ts`, an in-memory, single-process TTL
map — separate from `integration_link_request` because neither BitAuth nor Discord know brico's link
codes, only the OAuth `state` this process minted for them. Either callback finalizes by calling
`noteIntegrationLinkExternal({code, externalId, externalHandle})` on the live `brico-app` connection
this process already holds, then redirects the browser back with `?linked=<provider>` or
`?linkError=<message>` using a provided `returnUrl`.

## Metrics

`GET /metrics` on the same HTTP server (`src/http-server.ts`) serves a Prometheus exposition
(`src/metrics.ts`, [`prom-client`](https://github.com/siimon/prom-client)) alongside the
process's default Node metrics (`collectDefaultMetrics`). It covers the things that actually vary
with load — snapshot build time, watch/bounty evaluation time, reducer call latency by reducer
name, and watch match counts — deliberately **not** row counts (SpacetimeDB's own metrics already
cover table sizes) and deliberately **not** anything labeled by watch id: watch ids come from
user-created saved filters, an unbounded set.

## `brico-app` visibility — the one non-obvious setup step

Every `brico-app` table is private; clients read through **views**. `my_*` views (`my_account`,
`my_linked_integration`, `my_saved_craft_filter`, `my_craft_filter_watch`) are filtered to
`ctx.sender`; the `all_*` views are the unfiltered feed built for this service, and they return
**no rows** unless the connection's identity is registered in `service_principal`. An empty
`all_account` is therefore an *authorization* result, not an error —
the process logs the exact command to fix it, including its own identity:

```sh
spacetime call --server local brico-app register_service_principal '"<identity-hex>"' '"brico-bot"'
```

The identity is stable across restarts because the connection token is persisted under
`BRICO_BOT_STATE_DIR` (one file per uri+database, mode 0600 — these are credentials; delete a file
to get a fresh identity). Running as the database owner also works and needs no registration.

## Layout

| Path | What it is |
| --- | --- |
| `src/main.ts` | Entrypoint: wires both connections, the bridge, sinks and the HTTP server; signal handling. |
| `src/config.ts` | Every env knob, in one place. |
| `src/log.ts` | Tiny leveled/scoped logger. |
| `src/metrics.ts` | Prometheus counters/histograms, served by `http-server.ts`'s `/metrics` route. |
| `src/bridge.ts` | The bridge: relay snapshots × watches → `evaluateFilter` → added/finished/removed events, with bounty assignment run first each tick so watches see live `payout`/`currency`. |
| `src/bridge.test.ts` | Match-transition tests against synthetic snapshots. |
| `src/spacetime/connection.ts` | Module-agnostic supervised connection: token store, backoff, generation-guarded callbacks. |
| `src/spacetime/token-store.ts` | Filesystem token persistence (the Node stand-in for `localStorage`). |
| `src/spacetime/coalesce.ts` | "Rebuild at most once per interval, and only if something changed." |
| `src/relay/prism.ts` | prism connection + coalesced `CraftSnapshot`, including `craft_contribution`. |
| `src/relay/subject.ts` | Relay rows + static recipe data → `CraftSubject` for the filter engine. |
| `src/game-data/load.ts` | Reads one offline BSATN static-data table straight off disk. |
| `src/game-data/recipes.ts` | `CraftingRecipeDesc` → `RecipeIndex` (effort/skill/level/output item), loaded once at startup. |
| `src/app/connection.ts` | `brico-app` connection and its table registry. |
| `src/app/watch-source.ts` | Where watches come from: `brico-app` accounts, a JSON file, or built-in defaults. |
| `src/app/notification-sink.ts` | Turns a fired watch into a `notification` row on `brico-app` via `postCraftNotification`. |
| `src/app/bounty-source.ts` | Loads bounty rules/overrides/assignments/entitlements/loyalty rewards off `brico-app`'s `all_*` views. |
| `src/app/bounty-sink.ts` | Resolves each open craft's bounty and per-contributor entitlement, writing `craft_bounty_assignment`/`craft_bounty_entitlement`. |
| `src/http-server.ts` | The BitAuth/Discord link callback HTTP server. |
| `src/auth/oidc-client.ts` | Generic OIDC Authorization Code + PKCE relying-party client, used for BitAuth. |
| `src/auth/discord-oauth.ts` | Discord's plain-OAuth2 account-linking handshake. |
| `src/auth/pkce.ts` | PKCE (S256) and OAuth `state` generation. |
| `src/auth/link-state-store.ts` | In-memory TTL map correlating an OAuth `state` to a pending `brico-app` link code. |

Shared code is imported **by package name**, never by relative path or a tsconfig alias:
`@brico/crafts/filter`, `@brico/bindings/prism`, `@brico/bindings/brico-app`. The filter engine is
**not** vendored here — byte-for-byte agreement with the frontend's matching behaviour is the entire
reason it is a workspace package. The declared `spacetimedb` range is kept identical to
`common/bindings/package.json`'s so npm hoists one copy: two copies of a SpacetimeDB SDK in one
process would mean two module registries and two sets of `DbConnection`/row-class identities.

## Warning

- **The offline BSATN assets have to actually be checked out.** `src/game-data/recipes.ts` reads
  `crafting_recipe_desc.bsatn` straight off disk (default: `frontend/public/bsatn/static/`, see
  `BRICO_BOT_GAME_DATA_DIR`), so a checkout of this repo without the frontend's static assets — or a
  standalone deploy of just this package — needs that variable pointed at a real copy. Missing or
  unreadable is a startup-time fatal error, deliberately: every craft's effort/skill/tier/item is
  derived from this table, so starting the bridge without it would silently misclassify every craft
  as effort-0 and item-less rather than failing loudly.
