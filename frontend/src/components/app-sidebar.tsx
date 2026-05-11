import {A} from "@solidjs/router";
import {type IconTypes} from "solid-icons";
import {FaSolidArrowDownAZ as IconSortAZ, FaSolidFolderTree as IconSortTree, FaSolidToolbox as IconTools} from "solid-icons/fa"
import {
    TbFillLayoutGrid as IconViewGrid,
    TbFillStar as IconStarFilled,
    TbOutlineBrandDiscord as IconDiscord,
    TbOutlineBrandGithub as IconGithub,
    TbOutlineChevronDown as IconChevronDown,
    TbOutlineList as IconViewList,
    TbOutlineSettings as IconSettings,
    TbOutlineStar as IconStarOutline,
} from "solid-icons/tb";
import {createMemo, For, JSX, Show} from "solid-js";
import BricoFace from "~/components/ui/brico-face";
import {Button} from "~/components/ui/button";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
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
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {useSettings} from "~/lib/settings";
import {SIDEBAR_GROUPS, type SidebarItemDef} from "~/lib/sidebar-items";

// ── Toggle button helpers ───────────────────────────────────────

function IconToggleButton<T>(props: {
    icon: IconTypes;
    value: T;
    offValue?: T;
    selectedValue: T;
    onChange: (v: T) => void;
    title?: JSX.Element;
}) {
    const isSelected = () => props.value === props.selectedValue;
    const handleClick = () => {
        if (isSelected() && props.offValue !== undefined) {
            props.onChange(props.offValue);
        } else {
            props.onChange(props.value);
        }
    };
    return (
        <Tooltip>
            <TooltipTrigger>
                <button
                    class={`size-8 flex items-center justify-center rounded transition-colors ${
                        isSelected()
                            ? "bg-sidebar-foreground text-sidebar-accent-foreground"
                            : "border-sidebar-foreground text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }`}
                    onClick={handleClick}
                >
                    {props.icon({class: "size-4"})}
                </button>
            </TooltipTrigger>
            <TooltipContent>{props.title}</TooltipContent>
        </Tooltip>
    );
}

export function AppSidebar() {
    const state = useSidebar();
    const activeMenuItemClasses = "bg-sidebar-foreground text-sidebar-accent-foreground rounded-none";

    const {
        showSidebarControls,
        sidebarSort, setSidebarSort, sidebarView, setSidebarView,
        sidebarFavoritesOnly, setSidebarFavoritesOnly, sidebarFavorites,
    } = useSettings();

    // Derived: Set of visible hrefs for O(1) lookup
    const favoriteHrefs = createMemo(() => new Set(sidebarFavorites()));

    // Derived: groups with hidden items filtered out (only when favorites-only is on)
    const visibleGroups = createMemo(() => {
        if (!sidebarFavoritesOnly()) return SIDEBAR_GROUPS;
        return SIDEBAR_GROUPS
            .map(g => ({...g, items: g.items.filter(i => favoriteHrefs().has(i.href))}))
            .filter(g => g.items.length > 0);
    });

    // Derived: flat alphabetical list, filtered to favorites when favorites-only is on
    const azItems = createMemo(() => {
        const all = SIDEBAR_GROUPS.flatMap(g => g.items);
        const filtered = sidebarFavoritesOnly()
            ? all.filter(i => favoriteHrefs().has(i.href))
            : all;
        return filtered.sort((a, b) => a.title.localeCompare(b.title));
    });

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader class="bg-sidebar-primary text-sidebar-primary-foreground">
                <A href="/" end class="text-center max-h-lh" activeClass={""}>
                    <BricoFace class="inline size-6 align-bottom"/>
                    <span class="inline-block overflow-hidden text-nowrap align-middle
                                 transition-[max-width,opacity] duration-200 ease-linear
                                 max-w-40 opacity-100
                                 group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0">
                        Brico's Toolbox
                    </span>
                </A>
            </SidebarHeader>

            {/* Sort/view/favorites toggles — collapse with CSS transition when icon-only */}
            <Show when={showSidebarControls()}>
                <div class="px-2 py-2 overflow-hidden max-h-14 opacity-100
                            transition-[max-height,opacity,padding-bottom] duration-200 ease-linear
                            group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:pb-0 group-data-[collapsible=icon]:opacity-0">
                    <div class="flex flex-row justify-around items-center">
                        {/* Sort toggle */}
                        <div class="flex border rounded-md">
                            <IconToggleButton
                                icon={IconSortTree}
                                value="tree"
                                selectedValue={sidebarSort()}
                                onChange={setSidebarSort}
                                title="Tree view"
                            />
                            <IconToggleButton
                                icon={IconSortAZ}
                                value="az"
                                selectedValue={sidebarSort()}
                                onChange={setSidebarSort}
                                title="Alphabetical"
                            />
                        </div>

                        {/* Favorites toggle */}
                        <div class="border rounded-md">
                            <IconToggleButton<boolean>
                                icon={sidebarFavoritesOnly() ? IconStarFilled : IconStarOutline}
                                value={true}
                                offValue={false}
                                selectedValue={sidebarFavoritesOnly()}
                                onChange={setSidebarFavoritesOnly}
                                title={
                                    <div class="text-sm">
                                        {sidebarFavoritesOnly() ? "Showing favorites" : "Show all items"}<br/>
                                        <div class="text-xs text-muted-foreground">
                                            Favorites can be set in the <A href="/settings"><IconSettings class="inline"/> Settings</A>
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        {/* View toggle */}
                        <div class="flex border rounded-md">
                            <IconToggleButton
                                icon={IconViewList}
                                value="list"
                                selectedValue={sidebarView()}
                                onChange={setSidebarView}
                                title="List view"
                            />
                            <IconToggleButton
                                icon={IconViewGrid}
                                value="grid"
                                selectedValue={sidebarView()}
                                onChange={setSidebarView}
                                title="Grid view"
                            />
                        </div>
                    </div>
                </div>
            </Show>

            <SidebarContent class="gap-0 group-data-[collapsible=icon]:scrollbar-none">
                <Show when={sidebarSort() === "tree"}>
                    <For each={visibleGroups()}>
                        {(group) => (
                            <Collapsible defaultOpen>
                                <CollapsibleTrigger class="group/collapsible w-full">
                                    <div class="flex flex-row items-center h-8">
                                        <SidebarGroupLabel class="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                                            {group.name}
                                        </SidebarGroupLabel>
                                        <IconChevronDown class="mr-2 ml-auto shrink-0 transition-transform
                                                                 group-data-closed/collapsible:rotate-180
                                                                 group-data-[collapsible=icon]:mx-auto"/>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarGroupContent>
                                        <Show
                                            when={sidebarView() === "grid" && state.open()}
                                            fallback={
                                                <SidebarMenu>
                                                    <For each={group.items}>
                                                        {(item) => <SidebarListItem item={item} activeClass={activeMenuItemClasses}/>}
                                                    </For>
                                                </SidebarMenu>
                                            }
                                        >
                                            <SidebarGridGroup items={group.items} activeClass={activeMenuItemClasses}/>
                                        </Show>
                                    </SidebarGroupContent>
                                </CollapsibleContent>
                                <SidebarSeparator class="my-1.5 group-data-[collapsible=icon]:hidden"/>
                            </Collapsible>
                        )}
                    </For>
                </Show>
                <Show when={sidebarSort() === "az"}>
                    <SidebarGroupContent>
                        <Show
                            when={sidebarView() === "grid" && state.open()}
                            fallback={
                                <SidebarMenu>
                                    <For each={azItems()}>
                                        {(item) => <SidebarListItem item={item} activeClass={activeMenuItemClasses}/>}
                                    </For>
                                </SidebarMenu>
                            }
                        >
                            <SidebarGridGroup items={azItems()} activeClass={activeMenuItemClasses}/>
                        </Show>
                    </SidebarGroupContent>
                </Show>
            </SidebarContent>

            <SidebarFooter class="mb-2">
                <div class="flex flex-row justify-center w-full">
                    <div class="flex overflow-hidden
                                transition-[max-width,opacity] duration-200 ease-linear
                                max-w-20 opacity-100
                                group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0">
                        <a href={"https://github.com/BitCraftToolBox/brico"} target={"_blank"}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="ghost" size="sm" class="w-9 px-0">
                                        <IconGithub/>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>GitHub</TooltipContent>
                            </Tooltip>
                        </a>
                        <a href={"https://cereal.brico.app"} target={"_blank"}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="ghost" size="sm" class="w-9 px-0">
                                        🥣
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>cereal - Raw Data Browser</TooltipContent>
                            </Tooltip>
                        </a>
                    </div>
                    <a href={"https://discord.gg/MJGD2hZDGv"} target={"_blank"}>
                        <Tooltip placement="right">
                            <TooltipTrigger>
                                <Button variant="ghost" size="sm" class="w-9 px-0">
                                    <IconDiscord/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Brico's Toolbox Discord</TooltipContent>
                        </Tooltip>
                    </a>
                </div>
                <div class="overflow-hidden
                            transition-[max-height,opacity] duration-200 ease-linear
                            max-h-6 opacity-100
                            group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:opacity-0">
                    <div class="text-muted-foreground text-sm text-center">Not affiliated with Clockwork Labs</div>
                </div>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    )
}

// ── Sub-components ─────────────────────────────────────────────

function SidebarListItem(props: { item: SidebarItemDef; activeClass: string }) {
    const item = props.item;
    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                as={A} href={item.href}
                class={`group-data-[collapsible=icon]:ml-2 ${item.disabled ? "text-muted-foreground pointer-events-none" : ""}`}
                activeClass={props.activeClass}
                tooltip={item.title}
            >
                <Show when={item.icon} fallback={<IconTools class="size-5"/>}>
                    {(icon) => icon()({class: "size-5 shrink-0"})}
                </Show>
                <span class={item.disabled ? "text-muted-foreground" : ""}>{item.title}</span>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

function SidebarGridGroup(props: { items: SidebarItemDef[]; activeClass: string }) {
    return (
        <div class="grid grid-cols-3 gap-1 px-1 py-1">
            <For each={props.items}>
                {(item) => (
                    <A
                        href={item.href}
                        activeClass={props.activeClass}
                        class={`flex flex-col items-center gap-0.5 rounded-md p-1.5 text-center hover:bg-sidebar-accent/60 transition-colors ${item.disabled ? "text-muted-foreground pointer-events-none" : ""}`}
                    >
                        <Show when={item.icon} fallback={<IconTools class="size-7"/>}>
                            {(icon) => icon()({class: "size-7 shrink-0"})}
                        </Show>
                        <span class="text-[0.6rem] leading-tight line-clamp-2 w-full">{item.title}</span>
                    </A>
                )}
            </For>
        </div>
    );
}
