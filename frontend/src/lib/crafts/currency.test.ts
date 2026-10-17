import {BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import assert from "node:assert/strict";
import {test} from "node:test";
import {CURRENCY_IDS} from "./currency-ids.ts";

test("every BOUNTY_CURRENCIES entry has filter-vocab data", () => {
    const vocabIds: readonly string[] = CURRENCY_IDS;
    const missing = BOUNTY_CURRENCIES.filter(id => !vocabIds.includes(id));
    assert.deepEqual(missing, []);
});
