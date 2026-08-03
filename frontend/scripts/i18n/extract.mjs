/**
 * Wrapper around `lingui extract`.
 *
 * Why not just run the `lingui` binary? Every Lingui v6 subcommand guards its entrypoint with
 * `if (import.meta.main) { ... }`, which only became available in **Node 24.2.0**. On any older
 * runtime — including Node 22, which this project's `engines` field still allows — the guard is
 * simply `undefined`, so `lingui extract` does nothing at all and *exits 0*. Silently succeeding
 * while producing no catalog is the worst possible failure mode for a CI freshness check, so we
 * import the command function directly instead of relying on that guard.
 *
 * Usage: node scripts/i18n/extract.mjs [--keep-obsolete] [--verbose] [--check]
 *
 * Obsolete messages (no longer referenced in `src`) are pruned outright rather than kept as `#~`
 * comments: nothing here re-activates a stale translation the way plain gettext tooling might, and
 * leaving them in round-trips through Crowdin, which fills their empty `msgstr` with the English
 * source on every export — reintroducing the exact strings this step is meant to remove. Pass
 * `--keep-obsolete` to fall back to Lingui's default (commented-out, not deleted).
 *
 * `--check` additionally fails if extraction changed anything, i.e. a string was added or edited
 * without re-running extraction. It uses `git status --porcelain` rather than `git diff` so that a
 * brand-new (untracked) catalog counts as a failure too, and lives here rather than in a shell
 * one-liner in package.json so it behaves the same on Windows and CI.
 */
import {getConfig} from "@lingui/conf";
import {execFileSync} from "node:child_process";

// `@lingui/cli`'s `exports` map only publishes `.` and `./api*`, so the extract command and the
// worker-pool helper have to be reached as file URLs relative to the one subpath that is exported.
const apiUrl = import.meta.resolve("@lingui/cli/api");
const {default: extractCommand} = await import(new URL("../lingui-extract.js", apiUrl).href);
const {resolveWorkersOptions} = await import(new URL("./resolveWorkersOptions.js", apiUrl).href);

const argv = process.argv.slice(2);

const success = await extractCommand(getConfig({}), {
    verbose: argv.includes("--verbose"),
    clean: !argv.includes("--keep-obsolete"),
    overwrite: argv.includes("--overwrite"),
    watch: false,
    workersOptions: resolveWorkersOptions({}),
});

if (!success) process.exit(1);

if (argv.includes("--check")) {
    const status = execFileSync("git", ["status", "--porcelain", "--", "src/locales"], {encoding: "utf8"}).trim();
    if (status) {
        console.error("\nMessage catalog is out of date with the source:\n");
        console.error(status);
        console.error("\nRun `npm run i18n:extract` and commit the result in src/locales/.");
        process.exit(1);
    }
    console.log("\nMessage catalog is up to date.");
}

