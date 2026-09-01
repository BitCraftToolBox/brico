import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {claimDisplayName, regionDisplayName} from "./names.ts";

describe("claimDisplayName", () => {
    it("passes a player-named claim through untouched", () => {
        assert.equal(claimDisplayName("Elmwood Glade"), "Elmwood Glade");
        // Already-resolved coordinates are plain text too — no template marker, so nothing to do.
        assert.equal(claimDisplayName("Large Pyrelite Cave (N: 6157, E: 9199)"), "Large Pyrelite Cave (N: 6157, E: 9199)");
    });

    it("resolves the auto-named ruin/cave template", () => {
        assert.equal(
            claimDisplayName("{0} (N: {1}, E: {2})|~Giant Skitch Dungeon|~6403|~8341"),
            "Giant Skitch Dungeon (N: 6403, E: 8341)",
        );
    });

    it("keeps a placeholder that has no argument", () => {
        assert.equal(claimDisplayName("{0} of {1}|~Ruins"), "Ruins of {1}");
    });

    it("handles an empty argument list and out-of-order placeholders", () => {
        assert.equal(claimDisplayName("plain|~"), "plain");
        assert.equal(claimDisplayName("{1}, {0}|~second|~first"), "first, second");
    });
});

describe("regionDisplayName", () => {
    it("appends the region number to a known name", () => {
        assert.equal(regionDisplayName("Lumethis", 14), "Lumethis (R14)");
    });

    it("falls back to the number alone when the region row has not arrived", () => {
        assert.equal(regionDisplayName(undefined, 14), "Region 14");
        assert.equal(regionDisplayName(null, 3), "Region 3");
        // The relay ships an empty string for a region it knows of but has no name for yet.
        assert.equal(regionDisplayName("   ", 3), "Region 3");
    });
});
