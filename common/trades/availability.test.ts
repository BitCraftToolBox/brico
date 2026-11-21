import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {fitsTrades, inventoryCounts, type InventoryLike, orderCapacity, type OrderLike, roomFor, UNLIMITED_STOCK, type VolumeOf} from "./availability.ts";
import {classifyOrder} from "./classify.ts";
import type {StackLike} from "./goods.ts";

const item = (itemId: number, quantity: number): StackLike => ({itemId, quantity, itemType: {tag: "Item"}});
const cargo = (itemId: number, quantity: number): StackLike => ({itemId, quantity, itemType: {tag: "Cargo"}});
const coins = (quantity: number) => item(1, quantity);
const order = (offerItems: StackLike[], requiredItems: StackLike[], remainingStock = UNLIMITED_STOCK): OrderLike =>
    ({offerItems, requiredItems, remainingStock});

/** `items` pockets of volume `itemVolume`, then `cargos` pockets of `cargoVolume`. */
function inventory(itemPockets: (StackLike | null)[], cargoPockets: (StackLike | null)[] = [], itemVolume = 100, cargoVolume = 6000): InventoryLike {
    return {
        pockets: [
            ...itemPockets.map(contents => ({volume: itemVolume, contents})),
            ...cargoPockets.map(contents => ({volume: cargoVolume, contents})),
        ],
        cargoIndex: itemPockets.length,
    };
}

/** Every item volume 1, every cargo 6000 (one per cargo pocket). */
const volumes: VolumeOf = kind => (kind === "Cargo" ? 6000 : 1);
const PLAYER = {coinsFromTreasury: false};
const CLAIMED = {coinsFromTreasury: true};

describe("orderCapacity", () => {
    it("treats i32::MAX stock as unlimited", () => {
        const cap = orderCapacity(order([item(5, 1)], [coins(10)]), inventoryCounts(inventory([item(5, 7)])), PLAYER);
        assert.deepEqual(cap, {trades: 7, limitedBy: "inventory", missing: []});
    });

    it("takes the smaller of stock limit and inventory", () => {
        const counts = inventoryCounts(inventory([item(5, 7)]));
        assert.deepEqual(orderCapacity(order([item(5, 1)], [coins(10)], 3), counts, PLAYER), {trades: 3, limitedBy: "stock", missing: []});
        assert.deepEqual(orderCapacity(order([item(5, 2)], [coins(10)], 0), counts, PLAYER), {trades: 0, limitedBy: "stock", missing: []});
    });

    it("exempts coin offers on claimed stalls but not elsewhere", () => {
        const buy = order([coins(300)], [item(5, 10)], 50);
        const empty = inventoryCounts(null);
        assert.deepEqual(orderCapacity(buy, empty, CLAIMED), {trades: 50, limitedBy: "stock", missing: []});
        assert.deepEqual(orderCapacity(buy, empty, PLAYER), {trades: 0, limitedBy: "inventory", missing: ["item:1"]});
        assert.deepEqual(orderCapacity(order([coins(300)], [item(5, 10)]), empty, CLAIMED), {trades: null, limitedBy: null, missing: []});
    });

    it("keeps items and cargo with the same id apart", () => {
        const counts = inventoryCounts(inventory([item(7, 50)], [cargo(7, 2)]));
        assert.equal(orderCapacity(order([cargo(7, 1)], [coins(1)]), counts, PLAYER).trades, 2);
        assert.equal(orderCapacity(order([item(7, 1)], [coins(1)]), counts, PLAYER).trades, 50);
    });

    it("sums repeated offer stacks and pockets", () => {
        const counts = inventoryCounts(inventory([item(5, 4), item(5, 6)]));
        assert.equal(orderCapacity(order([item(5, 2), item(5, 3)], [coins(1)]), counts, PLAYER).trades, 2);
    });
});

describe("fitsTrades / roomFor", () => {
    it("tops up a partial pocket before using empty ones", () => {
        const inv = inventory([item(5, 90)]);
        assert.equal(roomFor(order([coins(1)], [item(5, 1)]), inv, volumes, CLAIMED, 100), 10);
    });

    it("fills empty pockets of the right half only", () => {
        const inv = inventory([null], [null, null]);
        assert.equal(roomFor(order([coins(1)], [cargo(9, 1)]), inv, volumes, CLAIMED, 10), 2);
        assert.equal(roomFor(order([coins(1)], [item(9, 1)]), inv, volumes, CLAIMED, 1000), 100);
    });

    it("counts space freed by the offered goods", () => {
        const inv = inventory([item(5, 100)]);
        const swap = order([item(5, 100)], [item(6, 100)]);
        assert.equal(fitsTrades(swap, inv, volumes, PLAYER, 1), true);
    });

    it("sends coins to the treasury on claimed stalls", () => {
        const full = inventory([item(5, 100)]);
        const sell = order([item(5, 1)], [coins(500)]);
        assert.equal(fitsTrades(sell, full, volumes, CLAIMED, 1), true);
        assert.equal(fitsTrades(order([item(6, 1)], [coins(500)]), full, volumes, PLAYER, 1), false);
    });

    it("treats non-positive volume and unknown items as unlimited", () => {
        const inv: InventoryLike = {pockets: [{volume: 0, contents: item(5, 1)}], cargoIndex: 1};
        assert.equal(fitsTrades(order([coins(1)], [item(5, 1_000_000)]), inv, volumes, CLAIMED, 1), true);
        assert.equal(fitsTrades(order([coins(1)], [item(5, 1)]), inventory([item(4, 100)]), () => undefined, CLAIMED, 1), true);
    });

    it("reports full when nothing fits", () => {
        const inv = inventory([item(4, 100)]);
        assert.equal(roomFor(order([coins(1)], [item(5, 1)]), inv, volumes, CLAIMED), 0);
        assert.equal(roomFor(order([coins(1)], [item(5, 1)]), null, volumes, CLAIMED), 0);
    });
});

describe("classifyOrder", () => {
    it("reads coin purchases and sales", () => {
        assert.deepEqual(classifyOrder(order([coins(300)], [item(5, 10)])), {kind: "buy", good: "item:5", goodQuantity: 10, coins: 300, unitPrice: 30});
        assert.deepEqual(classifyOrder(order([cargo(5, 2)], [coins(50)])), {kind: "sell", good: "cargo:5", goodQuantity: 2, coins: 50, unitPrice: 25});
    });

    it("falls back to barter", () => {
        assert.deepEqual(classifyOrder(order([item(5, 1)], [item(6, 1)])), {kind: "barter"});
        assert.deepEqual(classifyOrder(order([coins(1), item(4, 1)], [item(6, 1)])), {kind: "barter"});
        assert.deepEqual(classifyOrder(order([coins(1)], [item(5, 1), item(6, 1)])), {kind: "barter"});
    });
});
