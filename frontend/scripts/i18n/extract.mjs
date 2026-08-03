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
 * without re-running extraction. It compares parsed PO content rather than raw files (see
 * `po-items.mjs`) and deliberately excludes `msgstr`: extraction never touches an existing
 * translation, so a translator's or Crowdin's edit to one — including pseudolocale
 * re-generation — is real work worth keeping, not a sign the catalog is stale. Comparing content
 * also means header rewrites, line-wrapping differences, and a missing/extra EOF newline (all
 * things Crowdin's exporter introduces without any real change) don't trip this check either.
 */
import {getConfig} from "@lingui/conf";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {itemsOf} from "./po-items.mjs";

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
    // Porcelain paths are always repo-root-relative (unlike e.g. `git diff --name-only`, which
    // defaults to repo-root-relative too but supports `--relative` to change that — `git status`
    // has no such flag), so resolve `readFileSync` against the repo root rather than cwd to make
    // this work whether the script runs from `frontend/` locally or the repo root in CI.
    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {encoding: "utf8"}).trim();

    // `git status --porcelain` (not `git diff --name-only`) so a brand-new, untracked catalog
    // counts as a failure too.
    const changedFiles = execFileSync("git", ["status", "--porcelain", "--", "src/locales"], {encoding: "utf8"})
        .trim()
        .split("\n")
        .filter((line) => line.endsWith(".po"))
        .map((line) => line.slice(3));

    const staleFiles = changedFiles.filter((file) => {
        let before;
        try {
            before = execFileSync("git", ["show", `HEAD:${file}`], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]});
        } catch {
            before = null; // untracked: file didn't exist at HEAD
        }
        let after;
        try {
            after = readFileSync(join(repoRoot, file), "utf8");
        } catch {
            after = null; // deleted from the working tree
        }
        const beforeItems = before === null ? [] : itemsOf(before, {includeMsgstr: false});
        const afterItems = after === null ? [] : itemsOf(after, {includeMsgstr: false});
        return JSON.stringify(beforeItems) !== JSON.stringify(afterItems);
    });

    if (staleFiles.length > 0) {
        console.error("\nMessage catalog is out of date with the source:\n");
        console.error(staleFiles.join("\n"));
        console.error("\nRun `npm run i18n:extract` and commit the result in src/locales/.");
        process.exit(1);
    }
    console.log("\nMessage catalog is up to date.");
}

