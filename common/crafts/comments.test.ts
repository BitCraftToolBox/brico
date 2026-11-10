import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {checkDisplayName, commentPageKey, isValidCommentPageKey, MAX_COMMENT_LENGTH, normalizeCommentBody, normalizeNote,} from "./comments.ts";
import {MAX_DISPLAY_NAME_LENGTH} from "./errors.ts";

describe("isValidCommentPageKey", () => {
    it("accepts route segment and numeric id", () => {
        assert.equal(isValidCommentPageKey(commentPageKey("item", 1234)), true);
        assert.equal(isValidCommentPageKey("premium-item:7"), true);
    });
    it("rejects other shapes", () => {
        for (const key of ["item", "item:", "item:12a", ":12", "Item:1", "item_desc:1", "item:1:2", "item:-1", "a".repeat(33) + ":1", "item:" + "1".repeat(21)]) {
            assert.equal(isValidCommentPageKey(key), false, key);
        }
    });
});

describe("normalizeCommentBody", () => {
    it("trims and normalizes line endings", () => assert.equal(normalizeCommentBody("  a\r\nb\rc \n"), "a\nb\nc"));
    it("keeps tabs and newlines, rejects other control characters", () => {
        assert.equal(normalizeCommentBody("a\tb\nc"), "a\tb\nc");
        assert.equal(normalizeCommentBody("a\u0000b"), null);
        assert.equal(normalizeCommentBody("a\u001bb"), null);
    });
    it("rejects empty bodies", () => assert.equal(normalizeCommentBody(" \n\t "), null));
    it("limits by code points", () => {
        assert.equal(normalizeCommentBody("a".repeat(MAX_COMMENT_LENGTH)), "a".repeat(MAX_COMMENT_LENGTH));
        assert.equal(normalizeCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1)), null);
        assert.notEqual(normalizeCommentBody("😀".repeat(MAX_COMMENT_LENGTH)), null);
    });
});

describe("checkDisplayName", () => {
    const ok = (name: string) => assert.deepEqual(checkDisplayName(name), {name: name.normalize("NFC").trim()}, name);
    const bad = (name: string, problem: string) => assert.deepEqual(checkDisplayName(name), {problem}, name);

    it("accepts plain alphanumerics and an underscore", () => {
        ok("Alice");
        ok("alice_99");
        ok("Ünïcode");
        ok("名前テスト");
    });
    it("accepts single internal separators", () => {
        ok("Mary Ann");
        ok("a-b.c_d");
    });
    it("trims and NFC-normalizes", () => {
        assert.deepEqual(checkDisplayName("  Zoe  "), {name: "Zoe"});
        assert.deepEqual(checkDisplayName("Café"), {name: "Café"});
    });
    it("enforces length in code points", () => {
        bad("a", "too-short");
        bad("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1), "too-long");
        ok("a".repeat(MAX_DISPLAY_NAME_LENGTH));
    });
    it("rejects emoji and symbols", () => {
        bad("Cool😀Guy", "characters");
        bad("a@b", "characters");
        bad("<b>hi</b>", "characters");
    });
    it("rejects zalgo and invisible characters", () => {
        bad("Z̀́̂̃algo", "characters");
        bad("ab​cd", "characters");
        bad("ab‮cd", "characters");
        bad("ab\ncd", "characters");
    });
    it("rejects leading, trailing and doubled separators", () => {
        bad("-ab", "characters");
        bad("ab-", "characters");
        bad("a  b", "characters");
        bad("a_-b", "characters");
    });
});

describe("normalizeNote", () => {
    it("trims, normalizes line endings and allows empty", () => {
        assert.equal(normalizeNote("  a\r\nb \n", 10), "a\nb");
        assert.equal(normalizeNote("   ", 10), "");
    });
    it("rejects control characters and over-long notes", () => {
        assert.equal(normalizeNote("a\u0000b", 10), null);
        assert.equal(normalizeNote("a".repeat(11), 10), null);
        assert.equal(normalizeNote("😀".repeat(10), 10), "😀".repeat(10));
    });
});
