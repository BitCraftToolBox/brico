import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {applyFormat, insertText} from "./format.ts";

const selected = (edit: ReturnType<typeof applyFormat>) => edit.text.slice(edit.selectionStart, edit.selectionEnd);

describe("applyFormat wrapping", () => {
    it("wraps a selection", () => {
        const edit = applyFormat("a word here", 2, 6, "bold");
        assert.equal(edit.text, "a **word** here");
        assert.equal(selected(edit), "word");
    });
    it("inserts a selected placeholder when nothing is selected", () => {
        const edit = applyFormat("ab", 1, 1, "italic");
        assert.equal(edit.text, "a*italic text*b");
        assert.equal(selected(edit), "italic text");
    });
    it("unwraps a selection already inside its markers", () => {
        const edit = applyFormat("a `code` b", 3, 7, "code");
        assert.equal(edit.text, "a code b");
        assert.equal(selected(edit), "code");
    });
});

describe("applyFormat strike and numbered list", () => {
    it("wraps a selection in strikethrough markers", () => {
        assert.equal(applyFormat("a word", 2, 6, "strike").text, "a ~~word~~");
    });
    it("numbers every touched line", () => {
        assert.equal(applyFormat("one\ntwo\nthree", 0, 13, "numbered").text, "1. one\n2. two\n3. three");
    });
    it("removes the numbers when every line has one", () => {
        assert.equal(applyFormat("1. a\n2. b", 0, 9, "numbered").text, "a\nb");
    });
});

describe("applyFormat line prefixes", () => {
    it("prefixes every touched line", () => {
        const edit = applyFormat("one\ntwo\nthree", 5, 9, "list");
        assert.equal(edit.text, "one\n- two\n- three");
    });
    it("removes the prefix when every line has it", () => {
        const edit = applyFormat("> a\n> b", 0, 7, "quote");
        assert.equal(edit.text, "a\nb");
    });
    it("works on an empty text", () => assert.equal(applyFormat("", 0, 0, "quote").text, "> "));
    it("uses only the caret's line when nothing is selected", () => {
        assert.equal(applyFormat("a\nb\nc", 2, 2, "list").text, "a\n- b\nc");
    });
});

describe("applyFormat link", () => {
    it("wraps the selection and selects the url", () => {
        const edit = applyFormat("see docs now", 4, 8, "link");
        assert.equal(edit.text, "see [docs](https://) now");
        assert.equal(selected(edit), "https://");
    });
    it("inserts a template with nothing selected", () => {
        const edit = applyFormat("", 0, 0, "link");
        assert.equal(edit.text, "[link text](https://)");
        assert.equal(selected(edit), "https://");
    });
});

describe("insertText", () => {
    it("replaces the selection and leaves the caret after the insert", () => {
        const edit = insertText("see X now", 4, 5, "[[item:1]]");
        assert.equal(edit.text, "see [[item:1]] now");
        assert.equal(edit.selectionStart, 14);
        assert.equal(edit.selectionEnd, 14);
    });
});
