import {FUNDING_REASON_TEXT, FUNDING_REASONS} from "@brico/crafts/stelo";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

// `funding-vocab.ts` uses the lingui macro, which plain `node --test` cannot load, so its English
// source strings are read from the file and compared with the shared wording.
const source = readFileSync(new URL("./funding-vocab.ts", import.meta.url), "utf8");
const english = new Map([...source.matchAll(/"([a-z-]+)": msg`([^`]*)`/g)].map(match => [match[1], match[2]]));

test("every reason code is worded in the frontend, as the shared wording capitalized with a period", () => {
    for (const code of FUNDING_REASONS) {
        const shared = FUNDING_REASON_TEXT[code];
        assert.equal(english.get(code), `${shared[0].toUpperCase()}${shared.slice(1)}.`, code);
    }
});
