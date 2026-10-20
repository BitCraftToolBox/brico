import assert from "node:assert/strict";
import {test} from "node:test";
import {absorbWalletCurrencies, sanitizeVisibleCurrencies, shownCurrencies} from "./currency-visibility.ts";

test("sanitizeVisibleCurrencies drops unknown ids and never returns empty", () => {
    assert.deepEqual(sanitizeVisibleCurrencies(["nope", "stelo-hex-coin"]), ["stelo-hex-coin"]);
    assert.deepEqual(sanitizeVisibleCurrencies([]), ["hex-coin", "stelo-hex-coin"]);
    assert.deepEqual(sanitizeVisibleCurrencies("garbage"), ["hex-coin", "stelo-hex-coin"]);
    assert.deepEqual(sanitizeVisibleCurrencies(["stelo-hex-coin", "hex-coin", "hex-coin"]), ["hex-coin", "stelo-hex-coin"]);
});

test("shownCurrencies unions extra values and keeps vocabulary order", () => {
    assert.deepEqual(shownCurrencies(["hex-coin"]), ["hex-coin"]);
    assert.deepEqual(shownCurrencies(["hex-coin"], ["stelo-hex-coin"]), ["hex-coin", "stelo-hex-coin"]);
    assert.deepEqual(shownCurrencies(["stelo-hex-coin"], ["hex-coin"]), ["hex-coin", "stelo-hex-coin"]);
    assert.deepEqual(shownCurrencies([], []), ["hex-coin", "stelo-hex-coin"]);
});

test("absorbWalletCurrencies adds a new wallet currency once", () => {
    assert.deepEqual(absorbWalletCurrencies(["stelo-hex-coin"], [], ["hex-coin"]), {visible: ["hex-coin", "stelo-hex-coin"], seen: ["stelo-hex-coin"]});
    assert.equal(absorbWalletCurrencies(["stelo-hex-coin"], ["stelo-hex-coin"], ["hex-coin"]), null);
    assert.equal(absorbWalletCurrencies([], [], ["hex-coin"]), null);
});
