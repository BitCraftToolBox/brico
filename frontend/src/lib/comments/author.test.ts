import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {type LinkHandle, previewAuthorName} from "./author.ts";

const link = (provider: string, externalHandle: string | undefined, at: number): LinkHandle => ({
    provider,
    externalHandle,
    linkedAt: {microsSinceUnixEpoch: BigInt(at)},
});

describe("previewAuthorName", () => {
    it("prefers a valid display name", () => {
        assert.equal(previewAuthorName("  Tester  ", [link("bitcraft-rel", "Hero", 1)]), "Tester");
    });
    it("skips a display name that fails the rules", () => {
        assert.equal(previewAuthorName("😀😀", [link("bitcraft-rel", "Hero", 1)]), "Hero");
    });
    it("uses the oldest BitCraft handle, then Discord", () => {
        const links = [link("discord", "disc", 1), link("bitcraft-rel", "Newer", 5), link("bitcraft-rel", "Older", 3)];
        assert.equal(previewAuthorName(undefined, links), "Older");
        assert.equal(previewAuthorName(undefined, [link("discord", "disc", 1), link("stelo", "x", 2)]), "disc");
    });
    it("ignores links without a handle", () => {
        assert.equal(previewAuthorName(undefined, [link("bitcraft-rel", undefined, 1), link("discord", "disc", 2)]), "disc");
    });
    it("is undefined with nothing to post under", () => assert.equal(previewAuthorName(undefined, []), undefined));
});
