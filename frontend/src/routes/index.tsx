import BricoFace from "~/components/ui/brico-face";
import {useColorMode} from "@kobalte/core";
import MainLayout from "~/components/MainLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {onMount} from "solid-js";

export default function Home() {
    const {colorMode} = useColorMode();

    // the get() is unnecessary since the createCached call will do it, but we need to load the class to get that
    // bundle to even run, so we might as well make sure
    onMount(() => {
        Object.values(BitCraftTables).map(t => t.preload && t.get());
    })

    return (
        <MainLayout title={"Brico's Toolbox"}>
            <BricoFace class="m-auto" color={colorMode() === 'dark' ? '#E9DFC4' : '#15567E'}/>
        </MainLayout>
    );
}
