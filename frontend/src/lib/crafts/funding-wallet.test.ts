import assert from "node:assert/strict";
import {test} from "node:test";
import {fundingWalletState, walletForCurrency} from "./funding-wallet.ts";

const wallets = [{linkId: 1n, currency: "stelo-hex-coin"}, {linkId: 2n, currency: "stelo-hex-coin"}];

test("fundingWalletState", () => {
    assert.equal(fundingWalletState("hex-coin", null, wallets), "none");
    assert.equal(fundingWalletState("stelo-hex-coin", null, wallets), "missing");
    assert.equal(fundingWalletState("stelo-hex-coin", 9n, wallets), "invalid");
    assert.equal(fundingWalletState("stelo-hex-coin", 2n, wallets), "ok");
});

test("walletForCurrency clears for trust currencies, keeps valid, preselects only a sole wallet", () => {
    assert.equal(walletForCurrency("hex-coin", 1n, wallets), null);
    assert.equal(walletForCurrency("stelo-hex-coin", 2n, wallets), 2n);
    assert.equal(walletForCurrency("stelo-hex-coin", null, wallets), null);
    assert.equal(walletForCurrency("stelo-hex-coin", 9n, wallets), null);
    assert.equal(walletForCurrency("stelo-hex-coin", null, wallets.slice(0, 1)), 1n);
});
