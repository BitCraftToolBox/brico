import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import MainLayout from "~/components/MainLayout";
import BricoFace from "~/components/ui/brico-face";
import {OG_LARGE} from "~/lib/og-meta";

export default function Home() {
    const {_} = useLingui();
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
                    placeholder={_(msg`Search items, buildings, creatures...`)}
                    large
                    autofocus
                />
            </div>
        </MainLayout>
    );
}
