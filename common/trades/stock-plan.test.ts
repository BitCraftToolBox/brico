import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {type InventoryLike, UNLIMITED_STOCK} from "./availability.ts";
import type {StackLike} from "./goods.ts";
import {emptyStockConfig, exportStockConfig, overrideKey, parseStockConfig, type StockConfig} from "./stock-config.ts";
import {buildStockLines, type StockEvent, type StockOrder, type StockShop, suggestLinks} from "./stock-plan.ts";

const item = (itemId: number, quantity: number): StackLike => ({itemId, quantity, itemType: {tag: "Item"}});
const coins = (quantity: number) => item(1, quantity);
const GOOD = "item:5" as const;
const NOW = 1_800_000_000_000;

function shop(id: string, pockets: (StackLike | null)[], volume = 1000): StockShop {
    const inventory: InventoryLike = {pockets: pockets.map(contents => ({volume, contents})), cargoIndex: pockets.length};
    return {id, inventory, rules: {coinsFromTreasury: true}};
}
let nextId = 1;
const buy = (shopId: string, remainingStock: number, qty = 10, price = 100): StockOrder =>
    ({id: String(nextId++), shopId, active: true, remainingStock, offerItems: [coins(price)], requiredItems: [item(5, qty)]});
const sell = (shopId: string, remainingStock = UNLIMITED_STOCK, qty = 10, price = 150): StockOrder =>
    ({id: String(nextId++), shopId, active: true, remainingStock, offerItems: [item(5, qty)], requiredItems: [coins(price)]});

function plan(shops: StockShop[], orders: StockOrder[], config: StockConfig = emptyStockConfig("9"), events: StockEvent[] = []) {
    return buildStockLines({shops, orders, events, config, volumeOf: () => 1, nowMs: NOW});
}
const kinds = (line: {issues: {kind: string}[]}) => line.issues.map(issue => issue.kind);

describe("buildStockLines: same stall", () => {
    it("pairs buy and sell orders in one stall with no config", () => {
        const [line] = plan([shop("1", [item(5, 40), null])], [buy("1", 3), sell("1")]);
        assert.equal(line.linked, false);
        assert.equal(line.onHand, 40);
        assert.equal(line.spread, 5);
        assert.deepEqual(kinds(line), []);
    });

    it("asks to raise the buy limit once everything bought has been sold", () => {
        const [line] = plan([shop("1", [null, null])], [buy("1", 0), sell("1")]);
        assert.deepEqual(line.issues[0], {kind: "reset-buy", limit: null});
    });

    it("holds while stock is above the reorder point, using overrides over claim defaults", () => {
        const config = {...emptyStockConfig("9"), defaults: {reorderAt: 100, batchSize: 20}};
        const shops = [shop("1", [item(5, 50), null])];
        const orders = [buy("1", 0), sell("1")];
        assert.deepEqual(plan(shops, orders, config)[0].issues, [{kind: "reset-buy", limit: 20}]);
        config.overrides = {[overrideKey("1", GOOD)]: {reorderAt: 10}};
        const [line] = plan(shops, orders, config);
        assert.deepEqual(kinds(line), ["holding"]);
        assert.equal(line.thresholds.sources.reorderAt, "override");
        assert.equal(line.thresholds.sources.batchSize, "claim");
    });

    it("flags a full intake while the buy order is open", () => {
        const [line] = plan([shop("1", [item(4, 1000)])], [buy("1", 5), sell("1")]);
        assert.ok(kinds(line).includes("intake-full"));
    });

    it("never asks to raise an unlimited buy order", () => {
        const [line] = plan([shop("1", [null])], [buy("1", UNLIMITED_STOCK), sell("1")]);
        assert.equal(line.buyRemaining, null);
        assert.deepEqual(kinds(line), ["sold-out"]);
    });
});

describe("buildStockLines: linked stalls", () => {
    const config = (): StockConfig => ({...emptyStockConfig("9"), links: [{intakeShopId: "1", outletShopId: "2"}]});

    it("asks to move goods from intake to an empty outlet", () => {
        const [line] = plan([shop("1", [item(5, 120), null]), shop("2", [null])], [buy("1", 4), sell("2")], config());
        assert.equal(line.linked, true);
        assert.equal(line.key, `1>2|${GOOD}`);
        assert.deepEqual(line.issues, [{kind: "move", quantity: 120}]);
    });

    it("caps the move at the outlet target", () => {
        const c = config();
        c.overrides[overrideKey("2", GOOD)] = {outletLowAt: 20, outletTarget: 50};
        const [line] = plan([shop("1", [item(5, 120), null]), shop("2", [item(5, 15)])], [buy("1", 4), sell("2")], c);
        assert.deepEqual(line.issues, [{kind: "move", quantity: 35}]);
    });

    it("counts both stalls toward the reorder point", () => {
        const shops = [shop("1", [null]), shop("2", [item(5, 30)])];
        assert.deepEqual(kinds(plan(shops, [buy("1", 0), sell("2")], config())[0]), ["holding"]);
        assert.deepEqual(kinds(plan([shop("1", [null]), shop("2", [null])], [buy("1", 0), sell("2")], config())[0]), ["reset-buy"]);
    });

    it("pairs an outlet's sell order with its linked intake when nothing buys it", () => {
        const [line] = plan([shop("1", [item(5, 10)]), shop("2", [null])], [sell("2")], config());
        assert.equal(line.intakeShopId, "1");
        assert.deepEqual(line.issues, [{kind: "move", quantity: 10}]);
    });
});

describe("buildStockLines: orders replaced by an in-game edit", () => {
    it("keeps the line key when the order id changes", () => {
        const shops = [shop("1", [null])];
        const before = plan(shops, [buy("1", 0), sell("1")])[0];
        const after = plan(shops, [buy("1", 20), sell("1")])[0];
        assert.equal(before.key, after.key);
    });

    it("reports a configured good whose orders are gone", () => {
        const config = {...emptyStockConfig("9"), overrides: {[overrideKey("1", GOOD)]: {batchSize: 20}}};
        const [line] = plan([shop("1", [null])], [sell("1")], config);
        assert.deepEqual(kinds(line), ["missing-order"]);
        const [orphan] = plan([shop("1", [null])], [], config);
        assert.deepEqual(kinds(orphan), ["missing-order"]);
    });
});

describe("buildStockLines: sales", () => {
    it("counts the last 24h of bought and sold units", () => {
        const events: StockEvent[] = [
            {shopId: "1", timestampMs: NOW - 1000, addedItems: [item(5, 10)], removedItems: []},
            {shopId: "1", timestampMs: NOW - 2000, addedItems: [], removedItems: [item(5, 30)]},
            {shopId: "1", timestampMs: NOW - 25 * 3600_000, addedItems: [item(5, 99)], removedItems: []},
        ];
        const [line] = plan([shop("1", [item(5, 60)])], [buy("1", 3), sell("1")], emptyStockConfig("9"), events);
        assert.equal(line.bought24h, 10);
        assert.equal(line.sold24h, 30);
        assert.equal(line.hoursToEmpty, 48);
    });

    it("ignores barter orders and inactive orders", () => {
        const barter: StockOrder = {id: "b", shopId: "1", active: true, remainingStock: 1, offerItems: [item(5, 1)], requiredItems: [item(6, 1)]};
        const inactive = {...buy("1", 0), active: false};
        assert.equal(plan([shop("1", [null])], [barter, inactive]).length, 0);
    });
});

describe("suggestLinks", () => {
    it("suggests stalls selling what another buys, skipping linked pairs and self-sold goods", () => {
        const shops = [shop("1", [null]), shop("2", [null]), shop("3", [null])];
        const sellOther = (shopId: string): StockOrder => ({...sell(shopId), offerItems: [item(6, 1)]});
        const buyOther = (shopId: string): StockOrder => ({...buy("1", 1), shopId, requiredItems: [item(6, 1)]});
        const orders = [buy("1", 1), buyOther("1"), sell("2"), sellOther("2"), sellOther("3"), sellOther("1")];
        const config = emptyStockConfig("9");
        assert.deepEqual(suggestLinks({shops, orders, config}), [{intakeShopId: "1", outletShopId: "2", sharedGoods: 1}]);
        config.links = [{intakeShopId: "1", outletShopId: "2"}];
        assert.deepEqual(suggestLinks({shops, orders, config}), []);
    });
});

describe("parseStockConfig", () => {
    it("round-trips an export", () => {
        const config: StockConfig = {
            ...emptyStockConfig("1008806316831722377"),
            links: [{intakeShopId: "1", outletShopId: "2"}],
            defaults: {reorderAt: 0, batchSize: 100},
            overrides: {[overrideKey("2", GOOD)]: {outletLowAt: 5, ignore: true}},
        };
        assert.deepEqual(parseStockConfig(JSON.parse(exportStockConfig(config))), config);
    });

    it("rejects malformed input", () => {
        const base = emptyStockConfig("9");
        assert.equal(parseStockConfig(null), null);
        assert.equal(parseStockConfig({...base, version: 2}), null);
        assert.equal(parseStockConfig({...base, kind: "other"}), null);
        assert.equal(parseStockConfig({...base, claimEntityId: "abc"}), null);
        assert.equal(parseStockConfig({...base, links: [{intakeShopId: 1, outletShopId: "2"}]}), null);
        assert.equal(parseStockConfig({...base, defaults: {batchSize: -1}}), null);
        assert.equal(parseStockConfig({...base, defaults: {batchSize: 1.5}}), null);
        assert.equal(parseStockConfig({...base, overrides: {"1|wood:5": {}}}), null);
        assert.equal(parseStockConfig({...base, overrides: {"1|item:5": {ignore: "yes"}}}), null);
    });

    it("drops unknown fields, duplicate links and empty overrides", () => {
        const parsed = parseStockConfig({
            ...emptyStockConfig("9"),
            extra: 1,
            links: [{intakeShopId: "1", outletShopId: "2", note: "x"}, {intakeShopId: "1", outletShopId: "2"}],
            overrides: {"1|item:5": {}},
        });
        assert.deepEqual(parsed, {...emptyStockConfig("9"), links: [{intakeShopId: "1", outletShopId: "2"}]});
    });
});
