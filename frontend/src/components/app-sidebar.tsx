import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarSeparator,
    useSidebar
} from "~/components/ui/sidebar"
import {For, Show} from "solid-js";
import {A} from "@solidjs/router";
import {
    TbBrandDiscord as IconDiscord,
    TbBrandGithub as IconGithub,
    TbChevronDown as IconChevronDown
} from "solid-icons/tb";
import {FaSolidToolbox as IconTools} from "solid-icons/fa"
import {Button} from "~/components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import BricoFace from "~/components/ui/brico-face";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {IconTypes} from "solid-icons";


type SidebarItemDef = {
    title: string
    href: string
    /* TODO figure out bitcraft icon font or export it or something */
    icon?: IconTypes
    disabled?: boolean
}

type SidebarGroupDef = {
    name: string,
    items: SidebarItemDef[]
}

const groups: SidebarGroupDef[] = [
    {
        name: "Compendium",
        items: [
            {
                href: '/database/items',
                title: 'Items',
            },
            {
                href: '/database/cargo',
                title: 'Cargo'
            },
            {
                href: '/database/creatures',
                title: 'Creatures',
                disabled: true
            },
            {
                href: '/database/resources',
                title: 'Resources',
            },
            {
                href: '/database/buildings',
                title: 'Structures',
            },
            {
                href: '/database/collection',
                title: 'Collection',
                disabled: true
            },
            {
                href: '/database/deployable',
                title: 'Deployables'
            },
            {
                href: '/database/traveler-tasks',
                title: 'Traveler Tasks'
            },
            {
                href: '/database/claim-research',
                title: 'Claim Research',
                disabled: true
            },
            {
                href: '/database/biomes',
                title: 'Biomes',
                disabled: true
            },
            {
                href: '/database/item-lists',
                title: 'Item Lists',
                disabled: true
            },
            {
                href: 'database/weapons',
                title: 'Weapons',
                disabled: true
            },
            {
                href: 'database/achievements',
                title: 'Achievements',
                disabled: true
            },
        ]
    },
    // {
    //     name: 'Tools (coming Soon™)',
    //     items: [
    //         {
    //             href: '/database/crafting',
    //             title: 'Crafting Calculator',
    //             disabled: true
    //         },
    //         {
    //             href: '/tools/timers',
    //             title: 'Timers',
    //             disabled: true
    //         }
    //     ]
    // }
]

export function AppSidebar() {
    const state = useSidebar();
    const activeMenuItemClasses = "bg-sidebar-accent text-sidebar-accent-foreground rounded-none";
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <A href="/" end class="text-center max-h-lh" activeClass={""}>
                    <BricoFace class="inline size-6"/><Show when={state.open()}><span
                    class="text-nowrap"> Brico's Toolbox</span></Show>
                </A>
            </SidebarHeader>
            <SidebarContent>
                <For each={groups}>
                    {(group) => (
                        <Collapsible defaultOpen>
                            <CollapsibleTrigger class="group/collapsible w-full">
                                <div class="flex flex-row justify-between items-center">
                                    <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
                                    <IconChevronDown class="mr-2 ml-auto transition-transform group-data-[closed]/collapsible:rotate-180"/>
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                {group.items &&
                                    <SidebarGroupContent>
                                        <SidebarMenu>
                                            <For each={group.items}>
                                                {(item) => (
                                                    <SidebarMenuItem>
                                                        <SidebarMenuButton
                                                            as={A} href={item.href}
                                                            class={`${state.open() ? "" : "ml-2"} ${item.disabled ? "text-muted-foreground pointer-events-none" : ""}`}
                                                            activeClass={activeMenuItemClasses}
                                                        >
                                                            <Show when={item.icon} fallback={<IconTools/>}>
                                                                {item.icon!({})}
                                                            </Show><Show when={state.open()}><span class={`${item.disabled ? "text-muted-foreground" : ""}`}>{item.title}</span></Show>
                                                        </SidebarMenuButton>
                                                    </SidebarMenuItem>
                                                )}
                                            </For>
                                        </SidebarMenu>
                                    </SidebarGroupContent>
                                }
                            </CollapsibleContent>
                            <SidebarSeparator/>
                        </Collapsible>
                    )}
                </For>
            </SidebarContent>
            <SidebarFooter class="mb-2">
                <div class="flex flex-row justify-center w-full">
                    <Show when={state.open()}>
                        <a href={"https://github.com/BitCraftToolBox/brico"}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="ghost" size="sm" class="w-9 px-0">
                                        <IconGithub/>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>GitHub</TooltipContent>
                            </Tooltip>
                        </a>
                        <a href={"https://discord.gg/umbilica"}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="ghost" size="sm" class="w-9 px-0">
                                        <img src="/cordis_star.svg" width="24px" height="24px"
                                             alt="Umbilica Icon"></img>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Join Umbilica!</TooltipContent>
                            </Tooltip>
                        </a>
                    </Show>
                    <a href={"https://discord.gg/MJGD2hZDGv"}>
                        <Tooltip>
                            <TooltipTrigger>
                                <Button variant="ghost" size="sm" class="w-9 px-0">
                                    <IconDiscord/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Brico's Toolbox Discord</TooltipContent>
                        </Tooltip>
                    </a>
                </div>
                <Show when={state.open()}>
                    <div class="text-muted-foreground text-sm text-center">Not affiliated with Clockwork Labs</div>
                </Show>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    )
}