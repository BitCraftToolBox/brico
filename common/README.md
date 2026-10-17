# `common/` — shared workspace packages

Code imported by more than one project in this repo. Every entry here is an npm workspace member
(see the root `package.json`), so consumers depend on it **by package name** — never by a relative
path or a tsconfig `paths` alias. That keeps resolution working identically under Vite, `tsc`,
`tsx`, and plain Node with no per-consumer configuration, and guarantees a single hoisted copy of
the SpacetimeDB SDKs rather than one per project (two copies means two module registries and two
sets of row/connection class identities in the same bundle).

| Package | Contents | Depends on |
| --- | --- | --- |
| `@brico/crafts` | Framework-free craft logic. `./filter` is the AND/OR/NOT filter engine that the web preview and `brico-bot`'s notification matching must agree on byte-for-byte. | nothing |
| `@brico/bindings` | Generated SpacetimeDB **2.x** client bindings: `./prism` (prism's `relay-module`), `./brico-app` (Phase 1 Track A, not yet generated). | `spacetimedb@^2.9` |
| `@brico/bitcraft-bindings` | Generated BitCraft upstream schema bindings, SpacetimeDB SDK **2.x**. `src/` is the `BitCraft_Bindings` git submodule (branch `ts-region-2`). Used only for offline BSATN decoding (`~/lib/bitcraft-data.ts`, `backend/brico-bot/src/game-data/load.ts`) — no live connection anywhere reads from it. | `spacetimedb@^2.9` |

## Notes

- **Both bindings packages now share one SpacetimeDB SDK major** (`spacetimedb@^2.9`, same package
  name). Keep each consumer's declared range identical to the one here — if the ranges diverge, npm
  nests a second copy under the consumer instead of hoisting, reintroducing the duplicate-registry
  problem. There is no longer a second SDK package (`@clockworklabs/spacetimedb-sdk@1.x`) anywhere
  in the tree.
- The packages export raw `.ts`. There is no build step, so `moduleResolution: "bundler"` (or a
  bundler/`tsx`) is required in every consumer.
- `backend/brico-module` is deliberately **not** a workspace member: it pins its own TypeScript and
  builds to WASM through the SpacetimeDB CLI, and a module cannot consume client bindings anyway.
