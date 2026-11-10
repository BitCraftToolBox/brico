import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {renderCommentMarkdown} from "./markdown.ts";

const ALLOWED_TAGS = new Set(["p", "em", "strong", "code", "pre", "blockquote", "ul", "ol", "li", "a", "br"]);
const ALLOWED_ATTRS = new Set(["href", "target", "rel", "start"]);

/** Every tag in `html` is on the allow-list, with only allowed attributes and safe link targets. */
function assertSafe(html: string) {
    for (const [, name, attrs] of html.matchAll(/<\/?([a-z0-9]+)((?:\s+[^>]*)?)\/?>/gi)) {
        assert.ok(ALLOWED_TAGS.has(name.toLowerCase()), `tag <${name}> in ${html}`);
        for (const [, attr, value] of attrs.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/gi)) {
            assert.ok(ALLOWED_ATTRS.has(attr.toLowerCase()), `attribute ${attr} in ${html}`);
            if (attr === "href") assert.match(value, /^(?:https?:\/\/|\/(?!\/))/i, `href ${value}`);
        }
    }
    assert.doesNotMatch(html, /<[^>]*\son\w+\s*=/i);
}

describe("renderCommentMarkdown", () => {
    it("renders a game link as a placeholder carrying only the validated page key", () => {
        assert.equal(
            renderCommentMarkdown("see [[item:1234]] and [[item-list:5]]"),
            "<p>see <span data-game-link=\"item:1234\">Item #1234</span> and <span data-game-link=\"item-list:5\">Item list #5</span></p>\n",
        );
    });

    it("leaves malformed or code-quoted game links as text", () => {
        for (const source of ["[[item]]", "[[item:x]]", "[[Item:1]]", "[[item:1\"><b>]]", "`[[item:1]]`"]) {
            const html = renderCommentMarkdown(source);
            assert.doesNotMatch(html, /data-game-link/, source);
            assertSafe(html);
        }
    });

    it("renders the supported syntax", () => {
        const html = renderCommentMarkdown("**bold** _em_ `code`\n\n> quote\n\n- a\n- b\n\n1. x\n\n[site](https://example.com)");
        assert.match(html, /<strong>bold<\/strong>/);
        assert.match(html, /<em>em<\/em>/);
        assert.match(html, /<code>code<\/code>/);
        assert.match(html, /<blockquote>/);
        assert.match(html, /<ul>/);
        assert.match(html, /<ol>/);
        assert.match(html, /<a href="https:\/\/example\.com"/);
        assertSafe(html);
    });

    it("keeps single newlines as line breaks", () => assert.match(renderCommentMarkdown("a\nb"), /a<br>\s*b/));

    it("escapes raw HTML", () => {
        for (const source of [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "<a href=\"javascript:alert(1)\">x</a>",
            "<iframe src=\"https://evil.example\"></iframe>",
            "<svg onload=alert(1)>",
            "<div style=\"position:fixed\">x</div>",
            "<!-- comment --><b>x</b>",
        ]) {
            const html = renderCommentMarkdown(source);
            assert.doesNotMatch(html, /<(?:script|img|iframe|svg|div|b)\b/i, source);
            assertSafe(html);
        }
    });

    it("refuses unsafe link schemes", () => {
        for (const source of [
            "[x](javascript:alert(1))",
            "[x](JaVaScRiPt:alert(1))",
            "[x](&#106;avascript:alert(1))",
            "[x](java\tscript:alert(1))",
            "[x](vbscript:msgbox(1))",
            "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
            "[x](file:///etc/passwd)",
            "[x](//evil.example/path)",
            "<javascript:alert(1)>",
            "[x]: javascript:alert(1)\n\n[x]",
        ]) {
            const html = renderCommentMarkdown(source);
            assert.doesNotMatch(html, /href=/i, source);
            assertSafe(html);
        }
    });

    it("does not render images", () => {
        const html = renderCommentMarkdown("![alt](https://example.com/a.png)");
        assert.doesNotMatch(html, /<img/i);
        assertSafe(html);
    });

    it("does not break out of attributes", () => {
        const html = renderCommentMarkdown("[x](https://example.com \"t\" onmouseover=\"alert(1)\")");
        assertSafe(html);
        const quoted = renderCommentMarkdown("[x](<https://example.com/\" onmouseover=\"alert(1)>)");
        assertSafe(quoted);
    });

    it("marks links as untrusted and opens them in a new tab", () => {
        const html = renderCommentMarkdown("[site](https://example.com) and https://example.org/x");
        assert.equal([...html.matchAll(/rel="nofollow ugc noopener"/g)].length, 2);
        assert.equal([...html.matchAll(/target="_blank"/g)].length, 2);
    });

    it("allows site paths, opened in the same tab", () => {
        const html = renderCommentMarkdown("[item](/database/item/1)");
        assert.match(html, /href="\/database\/item\/1"/);
        assert.doesNotMatch(html, /target=/);
    });

    it("renders headings, tables and rules as text", () => {
        const html = renderCommentMarkdown("# title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---");
        assert.doesNotMatch(html, /<(?:h\d|table|hr)/i);
        assertSafe(html);
    });
});
