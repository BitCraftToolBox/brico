/**
 * structured-data.ts — JSON-LD emitters.
 *
 * Why this exists: the visual design of the app flattens badly to plain text. The property grid
 * stacks a label above its value with no separator (correct-looking, but it scrapes as
 * "Occupants4. Allow HuntingNo."), and the breadcrumb is deliberately short. Rather than distort
 * the layout for crawlers, hand them the same information in machine-readable form.
 *
 * Emitted into `<head>` through `@solidjs/meta`'s low-level `useHead` — the package ships no
 * `<Script>` component, but `useHead` takes an arbitrary tag, and going through it (instead of
 * rendering a `<script>` in the tree) keeps these components DOM-free, so they can't perturb
 * hydration keys on the SSR bot path.
 *
 * Node identity: every page emits the site-wide graph (`WebSite`, `Organization`, and the
 * `VideoGame` the whole site is about) plus its own page-level nodes, which reference the site-wide
 * ones by `@id`. Consumers merge nodes across `<script>` blocks within a page, so the split is only
 * about which component owns which node.
 */

import {useHead} from "@solidjs/meta";
import {createUniqueId} from "solid-js";
import {breadcrumbText} from "~/lib/game-links";
import type {Label} from "~/lib/labels";
import {absoluteUrl, BITCRAFT_URL, OG_THUMBNAIL, SITE_URL, useCanonicalUrl} from "~/lib/og-meta";

// ─── Node ids ───────────────────────────────────────────────────

const WEBSITE_ID = `${SITE_URL}/#website`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
/** The game itself, as an entity — what `about`/`mentions` point at to say "this site is BitCraft". */
const GAME_ID = `${SITE_URL}/#bitcraft`;

// ─── Emitter ────────────────────────────────────────────────────

/**
 * JSON for a `<script>` body, with `<` escaped so a stray `</script>` inside a game string can't
 * terminate the tag early. (`JSON.stringify` has no reason to escape it, and `useHead` renders
 * script children raw.)
 */
function serialize(data: object): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Emits one `application/ld+json` block. `data` is read inside `useHead`'s render effect, so the
 * payload tracks its reactive sources — a locale change or late-arriving table data rewrites it.
 * Returning `undefined` emits an empty block rather than none: the tag is registered at setup, so
 * there is nothing to conditionalize by the time the payload is known.
 */
function useJsonLd(data: () => object | undefined) {
    useHead({
        tag: "script",
        props: {
            type: "application/ld+json",
            get children() {
                const d = data();
                return d ? serialize(d) : "";
            },
        },
        setting: {close: true},
        id: createUniqueId(),
    });
}

// ─── Site-wide ──────────────────────────────────────────────────

/**
 * The site-wide graph, emitted once per page by MainLayout:
 *
 * - `WebSite` + `SearchAction` — states the site's identity, and makes it eligible for Google's
 *   sitelinks search box. Pairs with the existing `/opensearch.xml`.
 * - `VideoGame` — the one unambiguous, machine-readable way to say "this app is about the game
 *   BitCraft", which nothing else on the site did: the game's name appeared only in `<meta>` tags
 *   and description prose.
 */
export function SiteJsonLd() {
    useJsonLd(() => ({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "@id": WEBSITE_ID,
                url: `${SITE_URL}/`,
                name: "Brico's Toolbox",
                alternateName: "Brico.app",
                description: "The BitCraft online compendium and companion app.",
                inLanguage: "en",
                publisher: {"@id": ORGANIZATION_ID},
                about: {"@id": GAME_ID},
                potentialAction: {
                    "@type": "SearchAction",
                    target: {
                        "@type": "EntryPoint",
                        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
                    },
                    "query-input": "required name=search_term_string",
                },
            },
            {
                "@type": "Organization",
                "@id": ORGANIZATION_ID,
                name: "BitCraft Toolbox",
                url: `${SITE_URL}/`,
                logo: absoluteUrl(OG_THUMBNAIL),
                sameAs: [
                    "https://github.com/BitCraftToolBox/brico",
                    "https://discord.gg/MJGD2hZDGv",
                ],
            },
            {
                "@type": "VideoGame",
                "@id": GAME_ID,
                name: "BitCraft",
                alternateName: "BitCraft Online",
                url: BITCRAFT_URL,
                sameAs: [
                    BITCRAFT_URL,
                    "https://store.steampowered.com/app/3454650/BitCraft_Online/"
                ],
                publisher: {"@type": "Organization", name: "Clockwork Labs"},
            },
        ],
    }));
    return null;
}

// ─── Breadcrumbs ────────────────────────────────────────────────

/**
 * `BreadcrumbList` for a page under `href`, mirroring the visible trail (`breadcrumbText`) but one
 * level deeper: `objectName` appends the current object as a final, url-less crumb. The visible nav
 * deliberately omits it — it would just repeat the page's own `<h1>` — but structured data has no
 * such duplication problem, and the trail reads wrong without it.
 *
 * The section crumb ("Database"/"Tools") carries no url: there is no `/database` or `/tools`
 * landing page to link it to.
 */
export function BreadcrumbJsonLd(props: {href?: string; titleOverride?: Label | string; objectName?: string}) {
    useJsonLd(() => {
        const href = props.href;
        if (!href) return undefined;
        const text = breadcrumbText(href, props.titleOverride);
        const crumbs: {name: string; url?: string}[] = [];
        if (text?.section) crumbs.push({name: text.section});
        if (text?.page) crumbs.push({name: text.page, url: absoluteUrl(href)});
        if (props.objectName) crumbs.push({name: props.objectName});
        if (!crumbs.length) return undefined;
        return {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: crumbs.map((crumb, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: crumb.name,
                ...(crumb.url ? {item: crumb.url} : {}),
            })),
        };
    });
    return null;
}

// ─── Detail pages ───────────────────────────────────────────────

/** One `label`/`value` pair from a detail page's property grid. */
export interface JsonLdProperty {
    name: string;
    value: string | number | boolean;
}

/**
 * `ItemPage` — a `WebPage` subtype meant for exactly this case, a page devoted to a single item —
 * with the object as its `mainEntity`.
 *
 * `Product` would be the obvious type for `mainEntity` and is deliberately not used: it invites
 * "missing field offers/price" errors in Search Console for something that has neither. `Thing`
 * costs us nothing here, since the point is entity understanding rather than a rich result. (Note
 * `additionalProperty` is loose on a bare `Thing` — schema.org lists it under `Product`/`Place` and
 * friends — but it is well-formed, and it's the only way to hand over the stat grid as clean
 * label/value pairs instead of letting a crawler flatten the visually-stacked DOM.)
 */
export function ItemPageJsonLd(props: {
    name: string;
    description?: string;
    image?: string;
    properties?: JsonLdProperty[];
}) {
    const canonical = useCanonicalUrl();
    useJsonLd(() => {
        const props_ = props.properties ?? [];
        return {
            "@context": "https://schema.org",
            "@type": "ItemPage",
            url: canonical(),
            name: props.name,
            isPartOf: {"@id": WEBSITE_ID},
            about: {"@id": GAME_ID},
            mainEntity: {
                "@type": "Thing",
                name: props.name,
                ...(props.description ? {description: props.description} : {}),
                ...(props.image ? {image: props.image} : {}),
                ...(props_.length ? {
                    additionalProperty: props_.map(p => ({
                        "@type": "PropertyValue",
                        name: p.name,
                        value: p.value,
                    })),
                } : {}),
            },
        };
    });
    return null;
}
