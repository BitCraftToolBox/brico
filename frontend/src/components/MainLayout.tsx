import {Link, Meta, Title} from "@solidjs/meta";
import {JSX, Show, Suspense} from "solid-js";
import Nav from "~/components/Nav";
import SiteFooter from "~/components/SiteFooter";
import {absoluteUrl, OG_THUMBNAIL, TITLE_SUFFIX, useCanonicalUrl} from "~/lib/og-meta";
import {SiteJsonLd} from "~/lib/structured-data";
import {cn} from "~/lib/utils";
import {useIsMobile} from "./ui/sidebar";

const DEFAULT_DESCRIPTION = "The BitCraft online compendium and companion app";

interface LayoutProps {
    title: string;
    /** Page description for SEO/social meta. Falls back to the generic site description. */
    description?: string;
    /** Comma-separated keyword list for <meta name="keywords">. */
    keywords?: string;
    /** OG/Twitter image (absolute or root-relative). Defaults to the branded square thumbnail. */
    image?: string;
    /** Twitter card layout. "summary" (thumbnail) by default; index uses "summary_large_image". */
    card?: "summary" | "summary_large_image";
    /**
     * Canonical URL to declare instead of this page's own — for a page whose content genuinely lives
     * at another URL (an item list, whose contents the owning item/creature page already renders in
     * full). The page stays reachable; only the indexing signal is consolidated.
     */
    canonicalOverride?: string;
    /** When true the page title is used verbatim (no " - Brico's Toolbox" suffix). */
    noTitleSuffix?: boolean;
    /**
     * Brand suffix appended to `title`. Defaults to the plain brand; detail and table pages pass
     * `BITCRAFT_TITLE_SUFFIX` so the game's name is in the `<title>` where it matters for search.
     */
    titleSuffix?: string;
    /**
     * Set by pages that render their own `<h1>` in the body. Everything else gets a visually-hidden
     * one from `<main>` below, so every page has exactly one — no more, no less. (The nav bar used
     * to be the `<h1>`; see the comment in Nav.tsx.)
     */
    ownHeading?: boolean;
    navTitle?: JSX.Element;
    children?: JSX.Element;
    wrapperClasses?: string;
    hideSearch?: boolean;
}

export default function MainLayout(props: LayoutProps) {
    const isMobile = useIsMobile();
    const fullTitle = () => props.noTitleSuffix ? props.title : `${props.title} - ${props.titleSuffix ?? TITLE_SUFFIX}`;
    const description = () => props.description || DEFAULT_DESCRIPTION;
    const image = () => absoluteUrl(props.image ?? OG_THUMBNAIL);
    const card = () => props.card ?? "summary";
    const pageUrl = useCanonicalUrl();
    const canonical = () => props.canonicalOverride ?? pageUrl();

    return (
        <div class="relative flex flex-col w-full h-dvh overflow-hidden">
            {/* Single source of per-page metadata — every page renders through MainLayout,
                so exactly one of each tag is emitted (avoids @solidjs/meta meta duplication). */}
            <Title>{fullTitle()}</Title>
            <Link rel="canonical" href={canonical()}/>
            <Meta name="description" content={description()}/>
            <Show when={props.keywords}>
                <Meta name="keywords" content={props.keywords!}/>
            </Show>
            <Meta property="og:title" content={fullTitle()}/>
            <Meta property="og:description" content={description()}/>
            <Meta property="og:url" content={canonical()}/>
            <Meta property="og:image" content={image()}/>
            <Meta name="twitter:card" content={card()}/>
            <Meta name="twitter:title" content={fullTitle()}/>
            <Meta name="twitter:description" content={description()}/>
            <Meta name="twitter:image" content={image()}/>
            <SiteJsonLd/>
            <Nav title={props.navTitle ?? props.title} hideSearch={props.hideSearch}/>
            <div class="flex flex-1 min-h-0">
                <Suspense>
                    <main
                        class={cn(
                            "flex-1 overflow-auto pb-2 pt-4",
                            isMobile() ? "max-w-screen-sm mx-auto px-2" : "px-4",
                            props.wrapperClasses
                        )}
                    >
                        <div class="flex flex-col min-h-full">
                            <div>
                                <Show when={!props.ownHeading}>
                                    <h1 class="sr-only">{props.title}</h1>
                                </Show>
                                {props.children}
                            </div>
                            <SiteFooter/>
                        </div>
                    </main>
                </Suspense>
            </div>
        </div>
    );
}
