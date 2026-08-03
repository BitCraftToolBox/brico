/**
 * Prints "true" if any locale's `messages.po` file under `src/locales` has a real
 * translation-content difference (msgid, msgctxt, msgstr, or extracted comments) between `HEAD`
 * and the working tree, "false" otherwise.
 *
 * Crowdin's file export rewrites PO header metadata (`PO-Revision-Date`, `X-Generator`, …) on
 * every download regardless of whether any translation actually changed, and a plain
 * `git diff --quiet` would treat that as a change. The translate-branch sync workflow uses this
 * script to decide whether a `crowdin download translations` run is worth opening a PR for.
 *
 * Usage: node scripts/i18n/diff-check.mjs
 */
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {itemsOf} from "./po-items.mjs";

// `--relative` so paths come back relative to cwd (matching the `./`-relative `git show` calls
// below) rather than `git diff`'s default of repo-root-relative.
const changedFiles = execFileSync("git", ["diff", "--name-only", "--relative", "--", "src/locales"], {encoding: "utf8"})
    .split("\n")
    .filter((file) => file.endsWith(".po"));

let realChange = false;
for (const file of changedFiles) {
    // `./` makes the `HEAD:<path>` pathspec relative to cwd rather than the repo root, so this
    // works whether the script runs from `frontend/` locally or from the repo root in CI.
    const before = itemsOf(execFileSync("git", ["show", `HEAD:./${file}`], {encoding: "utf8"}), {includeMsgstr: true});
    const after = itemsOf(readFileSync(file, "utf8"), {includeMsgstr: true});
    if (JSON.stringify(before) !== JSON.stringify(after)) {
        realChange = true;
        break;
    }
}

console.log(realChange ? "true" : "false");
