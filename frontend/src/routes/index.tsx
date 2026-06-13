import {useColorMode} from "@kobalte/core";
import {A} from "@solidjs/router";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import MainLayout from "~/components/MainLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import BricoFace from "~/components/ui/brico-face";
import {Button} from "~/components/ui/button";

export default function Home() {
    const {colorMode} = useColorMode();

    return (
        <MainLayout title={"Brico's Toolbox"} hideSearch>
            <div class="flex flex-col items-center justify-center gap-6 pt-[10vh]">
                <BricoFace class="max-w-[90svw] max-h-[30svh]" color={colorMode() === 'dark' ? '#E9DFC4' : '#15567E'}/>
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
