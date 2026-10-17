# `backend/brico-module` — the `brico-app` SpacetimeDB module

brico's own SpacetimeDB module (TypeScript, `spacetimedb`). Owns brico-specific per-user app
state; prism's `relay-module` stays the read-mirror of BitCraft.

## Commands

Run from `spacetimedb/`, or from the repo root with `--prefix backend/brico-module/spacetimedb`:

```sh
npm run typecheck        # tsc --noEmit
npm run build            # spacetime build
npm run publish:local    # spacetime publish --server local --yes (see below)
npm run generate         # regenerate common/bindings/brico-app
```

A local server must be running (`spacetime start`) for publish. After a schema change, publish
*and* regenerate bindings (to `common/bindings/brico-app/`).

`publish:local` runs `scripts/publish-local.mjs` rather than `spacetime publish` directly: it
temporarily adds `localhost` as a trusted JWT issuer in `auth.ts` (what a local dev server issues
for tokenless connections), publishes, then restores the file. Published-to-production builds
never trust `localhost`.
