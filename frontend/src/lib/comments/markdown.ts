/**
 * markdown.ts — renders comment bodies to HTML. Comments are stored as Markdown only, so this is the
 * single place user text becomes markup: raw HTML is escaped, images and headings are off, and links
 * are limited to https and site paths.
 */
import {isValidCommentPageKey} from "@brico/crafts/comments";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({html: false, linkify: true, breaks: true, typographer: false});
md.disable(["image", "table", "heading", "lheading", "hr", "html_block", "html_inline", "reference"]);

/** The Markdown source of a link to a database page: `[[item:1234]]`. */
export function gameLinkSource(pageKey: string): string {
    return `[[${pageKey}]]`;
}

/** Plain-text name for a page key whose entry can't be resolved, e.g. `Item list #5` for `item-list:5`. */
export function gameLinkFallback(pageKey: string): string {
    const [kind, id] = pageKey.split(":");
    const words = kind.replaceAll("-", " ");
    return `${words.charAt(0).toUpperCase()}${words.slice(1)} #${id}`;
}

// `[[<page key>]]` becomes an empty-bodied `<span data-game-link>` that `Markdown.tsx` replaces with a live link.
md.inline.ruler.before("link", "game_link", (state, silent) => {
    const {src, pos} = state;
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf("]]", pos + 2);
    if (end === -1) return false;
    const pageKey = src.slice(pos + 2, end);
    if (!isValidCommentPageKey(pageKey)) return false;
    if (!silent) state.push("game_link", "", 0).meta = {pageKey};
    state.pos = end + 2;
    return true;
});

md.renderer.rules.game_link = (tokens, idx) => {
    const {pageKey} = tokens[idx].meta as {pageKey: string};
    return `<span data-game-link="${md.utils.escapeHtml(pageKey)}">${md.utils.escapeHtml(gameLinkFallback(pageKey))}</span>`;
};

const ALLOWED_LINK = /^(?:https:\/\/|\/(?!\/))/i;
md.validateLink = url => ALLOWED_LINK.test(url.trim());

const defaultLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!String(token.attrGet("href") ?? "").startsWith("/")) {
        token.attrSet("target", "_blank");
        token.attrSet("rel", "nofollow ugc noopener");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
};

/** HTML for a comment body; safe to assign to `innerHTML`. */
export function renderCommentMarkdown(body: string): string {
    return md.render(body);
}
