import {Trans} from "@lingui/solid/macro";
import {BITCRAFT_URL} from "~/lib/og-meta";

/**
 * Site-wide footer, rendered once per page at the bottom of `<main>` (see MainLayout).
 */
export default function SiteFooter() {
    return (
        <footer class="mt-auto text-center text-xs text-muted-foreground text-balance">
            <p class="mt-4 pt-2 border-t">
                <Trans>
                    Brico's Toolbox is a fan-made database of{" "}
                    <a href={BITCRAFT_URL} target="_blank" rel="noopener" class="underline hover:text-foreground">BitCraft</a>{" "}
                    items, recipes, creatures, structures, and more.
                </Trans>
            </p>
            <p><Trans>Not affiliated with Clockwork Labs.</Trans></p>
        </footer>
    );
}
