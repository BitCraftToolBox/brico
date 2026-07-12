import {Link, Meta, Title} from "@solidjs/meta";
import {useLocation} from "@solidjs/router";
import {JSX, Show, Suspense} from "solid-js";
import Nav from "~/components/Nav";
import {absoluteUrl, OG_THUMBNAIL, SITE_URL} from "~/lib/og-meta";
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
    /** When true the page title is used verbatim (no " - Brico's Toolbox" suffix). */
    noTitleSuffix?: boolean;
    navTitle?: JSX.Element;
    children?: JSX.Element;
    wrapperClasses?: string;
    hideSearch?: boolean;
}

export default function MainLayout(props: LayoutProps) {
    const isMobile = useIsMobile();
    const location = useLocation();
    const fullTitle = () => props.noTitleSuffix ? props.title : `${props.title} - Brico's Toolbox`;
    const description = () => props.description || DEFAULT_DESCRIPTION;
    const image = () => absoluteUrl(props.image ?? OG_THUMBNAIL);
    const card = () => props.card ?? "summary";
    // Canonical URL: bare path, dropping UI-state query params (?info=/?detail=/?q=) so their
    // variants don't fragment into separate indexable URLs.
    const canonical = () => `${SITE_URL}${location.pathname}`;

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
                        {props.children}
                    </main>
                </Suspense>
            </div>
        </div>
    );
}
