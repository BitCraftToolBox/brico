import {useColorMode} from "@kobalte/core";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import MainLayout from "~/components/MainLayout";
import BricoFace from "~/components/ui/brico-face";

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
            </div>
        </MainLayout>
    );
}
