import {A} from "@solidjs/router";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import MainLayout from "~/components/MainLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import BricoFace from "~/components/ui/brico-face";
import {Button} from "~/components/ui/button";
import {OG_LARGE} from "~/lib/og-meta";

export default function Home() {
    return (
        <MainLayout
            title={"Brico's Toolbox"}
            noTitleSuffix
            hideSearch
            description="Brico's Toolbox — the BitCraft online compendium and companion app. Search items, buildings, creatures, recipes, and more."
            image={OG_LARGE}
            card="summary_large_image"
        >
            <div class="flex flex-col items-center justify-center gap-6 pt-[10vh]">
                <BricoFace class="max-w-[90svw] max-h-[30svh] dark:text-[#E9DFC4] text-[#15567E]"/>
                <GlobalSearchInput
                    class="w-full max-w-lg"
                    placeholder="Search items, buildings, creatures..."
                    large
                    autofocus
                />
                <Button variant="ghost" as={A} href="/events" class="mt-8 h-20">
                    <GameIcon
                        name="Track World Events"
                        iconAsset="GeneratedIcons/Other/GeneratedIcons/Other/Buildings/Crafting/Bank"
                        shape="square"
                        small
                        noInteract
                        rarity={{tag: "Mythic"}}
                        tier={-1}
                    />
                    <span>Track World Event Timers</span>
                </Button>
            </div>
        </MainLayout>
    );
}
