import {useColorMode} from "@kobalte/core";
import {createEffect, For} from "solid-js";
import MainLayout from "~/components/MainLayout";

type ColorConfig = {
    name: string;
    varName: string;
};

const baseColors: ColorConfig[] = [
    {name: "background", varName: "--background"},
    {name: "foreground", varName: "--foreground"},
    {name: "muted", varName: "--muted"},
    {name: "muted-foreground", varName: "--muted-foreground"},
    {name: "popover", varName: "--popover"},
    {name: "popover-foreground", varName: "--popover-foreground"},
    {name: "border", varName: "--border"},
    {name: "input", varName: "--input"},
    {name: "card", varName: "--card"},
    {name: "card-foreground", varName: "--card-foreground"},
    {name: "primary", varName: "--primary"},
    {name: "primary-foreground", varName: "--primary-foreground"},
    {name: "secondary", varName: "--secondary"},
    {name: "secondary-foreground", varName: "--secondary-foreground"},
    {name: "accent", varName: "--accent"},
    {name: "accent-foreground", varName: "--accent-foreground"},
    {name: "destructive", varName: "--destructive"},
    {name: "destructive-foreground", varName: "--destructive-foreground"},
    {name: "info", varName: "--info"},
    {name: "info-foreground", varName: "--info-foreground"},
    {name: "success", varName: "--success"},
    {name: "success-foreground", varName: "--success-foreground"},
    {name: "warning", varName: "--warning"},
    {name: "warning-foreground", varName: "--warning-foreground"},
    {name: "error", varName: "--error"},
    {name: "error-foreground", varName: "--error-foreground"},
    {name: "ring", varName: "--ring"},
];

const sidebarColors: ColorConfig[] = [
    {name: "sidebar-background", varName: "--sidebar-background"},
    {name: "sidebar-foreground", varName: "--sidebar-foreground"},
    {name: "sidebar-primary", varName: "--sidebar-primary"},
    {name: "sidebar-primary-foreground", varName: "--sidebar-primary-foreground"},
    {name: "sidebar-accent", varName: "--sidebar-accent"},
    {name: "sidebar-accent-foreground", varName: "--sidebar-accent-foreground"},
    {name: "sidebar-border", varName: "--sidebar-border"},
    {name: "sidebar-ring", varName: "--sidebar-ring"},
];

const bitcolorColors: ColorConfig[] = [
    {name: "bc-tier-color-0", varName: "--bc-tier-color-0"},
    {name: "bc-tier-color-1", varName: "--bc-tier-color-1"},
    {name: "bc-tier-color-2", varName: "--bc-tier-color-2"},
    {name: "bc-tier-color-3", varName: "--bc-tier-color-3"},
    {name: "bc-tier-color-4", varName: "--bc-tier-color-4"},
    {name: "bc-tier-color-5", varName: "--bc-tier-color-5"},
    {name: "bc-tier-color-6", varName: "--bc-tier-color-6"},
    {name: "bc-tier-color-7", varName: "--bc-tier-color-7"},
    {name: "bc-tier-color-8", varName: "--bc-tier-color-8"},
    {name: "bc-tier-color-9", varName: "--bc-tier-color-9"},
    {name: "bc-tier-color-10", varName: "--bc-tier-color-10"},
];

function ColorSwatch(props: { color: ColorConfig, mode: "RGB" | "HSL" }) {
    return (
        <div class="flex flex-col gap-2 w-fit">
            <div class="flex h-24 w-24 rounded-md border border-border overflow-hidden">
                <div
                    class="flex-1"
                    style={{
                        "background-color": props.mode == "HSL" ? `hsl(var(${props.color.varName}))` : `var(${props.color.varName})`,
                    }}
                />
            </div>
            <div class="text-sm">
                <div class="font-medium text-foreground">{props.color.name}</div>
                <div class="text-xs text-muted-foreground font-mono" data-var-content={`${props.color.varName}`}>
                </div>
            </div>
        </div>
    );
}

function ColorGroup(props: { title: string; colors: ColorConfig[], mode: "RGB" | "HSL" }) {
    return (
        <section class="mb-8">
            <h2 class="text-2xl font-bold mb-4 text-foreground">{props.title}</h2>
            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                <For each={props.colors}>
                    {(color) => <ColorSwatch color={color} mode={props.mode}/>}
                </For>
            </div>
        </section>
    );
}

export default function ColorsPage() {
    const {colorMode} = useColorMode();
    createEffect(() => {
        // reactive dependency - color mode changes will cause computed styles to change, but we can't watch the style directly
        colorMode();
        // body style doesn't actually change until the signal change gets propagated, so we set an instant timeout to run this right after
        setTimeout(() => {
            const style = getComputedStyle(document.body);
            document.querySelectorAll("[data-var-content]").forEach((item) => {
                if (item instanceof HTMLElement) {
                    item.innerHTML = style.getPropertyValue(item.dataset.varContent ?? "");
                }
            })
        }, 0);
    });
    return (
        <MainLayout title="Colors" hideSearch>
            <div class="w-full">
                <h1 class="text-4xl font-bold mb-8 text-foreground">Theme Colors</h1>

                <ColorGroup title="Base Colors" colors={baseColors} mode={"HSL"}/>
                <ColorGroup title="Sidebar Colors" colors={sidebarColors} mode={"HSL"}/>
                <ColorGroup title="BitCraft Tier Colors" colors={bitcolorColors} mode={"RGB"}/>
            </div>
        </MainLayout>
    );
}

