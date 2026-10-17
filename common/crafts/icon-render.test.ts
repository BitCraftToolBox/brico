import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {DARK_TIER_COLOR_HEX, ICON_CONTAINER_SIZE, ICON_SPRITE_SIZE, rarityToFrameSlug, tierColorHex} from "./icon-render.ts";

describe("rarityToFrameSlug", () => {
    it("maps every known rarity tag to its frame slug", () => {
        assert.equal(rarityToFrameSlug("Common"), "common");
        assert.equal(rarityToFrameSlug("Uncommon"), "uncommon");
        assert.equal(rarityToFrameSlug("Rare"), "rare");
        assert.equal(rarityToFrameSlug("Epic"), "epic");
        assert.equal(rarityToFrameSlug("Legendary"), "legendary");
        assert.equal(rarityToFrameSlug("Mythic"), "mythic");
    });

    it("falls back to basic for BitCraft's own Default tag, undefined, and anything unrecognized", () => {
        assert.equal(rarityToFrameSlug("Default"), "basic");
        assert.equal(rarityToFrameSlug(undefined), "basic");
        assert.equal(rarityToFrameSlug("SomethingNew"), "basic");
    });
});

describe("tierColorHex", () => {
    it("returns the exact hex for every in-range tier", () => {
        for (let tier = 0; tier <= 10; tier++) {
            assert.equal(tierColorHex(tier), DARK_TIER_COLOR_HEX[tier]);
        }
    });

    it("clamps out-of-range tiers to the nearest end", () => {
        assert.equal(tierColorHex(-3), DARK_TIER_COLOR_HEX[0]);
        assert.equal(tierColorHex(99), DARK_TIER_COLOR_HEX[10]);
    });
});

describe("ICON_CONTAINER_SIZE / ICON_SPRITE_SIZE", () => {
    it("keeps the sprite box no larger than its container in both shapes", () => {
        for (const shape of ["item", "cargo"] as const) {
            assert.ok(ICON_SPRITE_SIZE[shape].width <= ICON_CONTAINER_SIZE[shape].width);
            assert.ok(ICON_SPRITE_SIZE[shape].height <= ICON_CONTAINER_SIZE[shape].height);
        }
    });
});
