import {ConfigColorMode} from "@kobalte/core";
import * as SelectPrimitive from "@kobalte/core/select";
import {type IconTypes} from "solid-icons";
import {FaSolidArrowDownAZ as IconSortAZ, FaSolidFolderTree as IconSortTree} from "solid-icons/fa";
import {
    TbFillLayoutGrid as IconViewGrid,
    TbOutlineDeviceLaptop as IconSystem,
    TbOutlineList as IconViewList,
    TbOutlineMoon as IconMoon,
    TbOutlineSun as IconSun,
} from "solid-icons/tb";
import {createMemo, For, JSX, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {Button} from "~/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch, SwitchControl, SwitchThumb} from "~/components/ui/switch";
import {type SortMode, useSettings, type ViewMode} from "~/lib/settings";
import {SIDEBAR_GROUPS, SidebarGroupDef, type SidebarItemDef} from "~/lib/sidebar-items";

// ── Shared UI helpers ─────────────────────────────────────────

function SettingsSection(props: {title: string; description?: string; children: JSX.Element}) {
    return (
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-base font-semibold">{props.title}</h2>
                {props.description && (
                    <p class="text-sm text-muted-foreground">{props.description}</p>
                )}
            </div>
            <div class="rounded-lg border bg-card p-4 flex flex-col gap-4">
                {props.children}
            </div>
        </section>
    );
}

function SettingsRow(props: {label: string; description?: string; children: JSX.Element}) {
    return (
        <div class="flex flex-row items-center justify-between gap-4">
            <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium">{props.label}</span>
                {props.description && (
                    <span class="text-xs text-muted-foreground">{props.description}</span>
                )}
            </div>
            <div class="shrink-0">{props.children}</div>
        </div>
    );
}

function ButtonGroup<T extends string>(props: {
    options: {value: T; icon: IconTypes; label: string}[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div class="flex flex-col sm:flex-row rounded-md border border-input overflow-hidden">
            <For each={props.options}>
                {(opt) => (
                    <button
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={props.value === opt.value}
                        class={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors
                            ${props.value === opt.value
                                ? "bg-primary text-primary-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }
                            not-last:border-r not-last:border-input`}
                        onClick={() => props.onChange(opt.value)}
                    >
                        {opt.icon({class: "size-4 shrink-0"})}
                        <span>{opt.label}</span>
                    </button>
                )}
            </For>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [8, 10, 20, 30, 40, 50];

/**
 * Multi-select that lets users choose which sidebar items are "favorites"
 * (i.e. visible). Options are grouped by category using Kobalte's native
 * option-group support. Selected = visible; deselected = hidden.
 */
function SidebarFavoritesSelect() {
    const settings = useSettings();

    const allItems = createMemo(() => SIDEBAR_GROUPS.flatMap(g => g.items));
    const selectedItems = createMemo(() =>
        allItems().filter(item => settings.sidebarFavorites().includes(item.href))
    );

    return (
        <div class="flex flex-col gap-1.5">
            <div>
                <span class="text-sm font-medium">Favorite items</span>
                <p class="text-xs text-muted-foreground mt-0.5">
                    Checked items appear in the sidebar. New items are always visible by default.
                </p>
            </div>
            <Select<SidebarItemDef, SidebarGroupDef>
                multiple
                options={SIDEBAR_GROUPS}
                optionValue={(item) => item.href}
                optionTextValue={(item) => item.title}
                optionGroupChildren="items"
                value={selectedItems()}
                placeholder={<>
                    No items visible
                    {" "}<span class="text-xs text-muted-foreground">(You know you can just collapse the sidebar, right? Did you just uncheck every single item to see what would happen?)</span>
                </>}
                onChange={(items: SidebarItemDef[]) =>
                    settings.setSidebarFavorites(items.map(i => i.href))
                }
                itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item} class="pl-6">
                        <div class="flex items-center gap-2">
                            <Show when={itemProps.item.rawValue.icon}>
                                {(icon) => icon()({class: "size-4 shrink-0"})}
                            </Show>
                            <span>{itemProps.item.rawValue.title}</span>
                        </div>
                    </SelectItem>
                )}
                sectionComponent={(secProps) => (
                    <SelectPrimitive.Section class="px-2 pt-2 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        {secProps.section.rawValue.name}
                    </SelectPrimitive.Section>
                )}
            >
                <SelectTrigger class="w-full">
                    <SelectValue<SidebarItemDef>>
                        {(state) => {
                            const count = state.selectedOptions().length;
                            const total = allItems().length;
                            return count >= total
                                ? "All items visible"
                                : `${count} of ${total} items visible`;
                        }}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent class="max-h-80 overflow-auto"/>
            </Select>
        </div>
    );
}

export default function SettingsPage() {
    const settings = useSettings();

    // Derived counts for the "Reset hidden columns" row
    const hiddenColumnStats = createMemo(() => {
        const map = settings.tableHiddenColumns();
        const tableNames = Object.keys(map).filter(t => map[t].length > 0);
        const totalCols = tableNames.reduce((sum, t) => sum + map[t].length, 0);
        return {tables: tableNames.length, columns: totalCols};
    });

    return (
        <MainLayout title="Settings" hideSearch>
            <div class="max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <h1 class="text-2xl font-bold">Settings</h1>

                {/* ── Theme ──────────────────────────────── */}
                <SettingsSection
                    title="Theme"
                    description="Choose how Brico's Toolbox looks."
                >
                    <SettingsRow label="Color mode" description="Light, dark, or follow your system preference.">
                        <ButtonGroup<ConfigColorMode>
                            value={settings.colorStorageManager.get() ?? "system"}
                            onChange={settings.colorStorageManager.set}
                            options={[
                                {value: "light",  icon: IconSun,    label: "Light"},
                                {value: "dark",   icon: IconMoon,   label: "Dark"},
                                {value: "system", icon: IconSystem, label: "System"},
                            ]}
                        />
                    </SettingsRow>
                </SettingsSection>

                {/* ── Sidebar ────────────────────────────── */}
                <SettingsSection
                    title="Sidebar"
                    description="Customize how the navigation sidebar is organized and displayed."
                >
                    <SettingsRow
                        label="Show sidebar controls"
                        description="When disabled, hides the quick controls for the sort order/view style/favorites."
                    >
                        <Switch
                            checked={settings.showSidebarControls()}
                            onChange={settings.setShowSidebarControls}
                        >
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SettingsRow
                        label="Collapse sidebar by default"
                        description="Whether to show the sidebar in its collapsed (icon only) state on initial load."
                    >
                        <Switch
                            checked={settings.sidebarStartsCollapsed()}
                            onChange={settings.setSidebarStartsCollapsed}
                        >
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SettingsRow label="Sort order" description="Show items grouped by category (tree) or sorted alphabetically.">
                        <ButtonGroup<SortMode>
                            value={settings.sidebarSort()}
                            onChange={settings.setSidebarSort}
                            options={[
                                {value: "tree", icon: IconSortTree, label: "Tree"},
                                {value: "az",   icon: IconSortAZ,   label: "A–Z"},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow label="View style" description="Compact list or icon grid.">
                        <ButtonGroup<ViewMode>
                            value={settings.sidebarView()}
                            onChange={settings.setSidebarView}
                            options={[
                                {value: "list", icon: IconViewList, label: "List"},
                                {value: "grid", icon: IconViewGrid, label: "Grid"},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Favorites only"
                        description="When enabled, only your favorite items are shown in the sidebar."
                    >
                        <Switch
                            checked={settings.sidebarFavoritesOnly()}
                            onChange={settings.setSidebarFavoritesOnly}
                        >
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SidebarFavoritesSelect/>
                </SettingsSection>

                {/* ── Tables ─────────────────────────────── */}
                <SettingsSection
                    title="Tables"
                    description="Options for data tables across the app."
                >
                    <SettingsRow
                        label="Default rows per page"
                        description="How many rows are shown per page when a table first loads."
                    >
                        <Select
                            value={settings.tablePageSize()}
                            onChange={(v) => v && settings.setTablePageSize(v)}
                            options={PAGE_SIZE_OPTIONS}
                            itemComponent={(p) => (
                                <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>
                            )}
                        >
                            <SelectTrigger class="h-8 w-[80px]">
                                <SelectValue<number>>{(s) => s.selectedOption()}</SelectValue>
                            </SelectTrigger>
                            <SelectContent/>
                        </Select>
                    </SettingsRow>
                    <SettingsRow
                        label="Reset hidden columns"
                        description={`Un-hide ${hiddenColumnStats().columns} table column${hiddenColumnStats().columns !== 1 ? "s" : ""} across ${hiddenColumnStats().tables} table page${hiddenColumnStats().tables !== 1 ? "s" : ""}.`}
                    >
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={hiddenColumnStats().columns === 0}
                            onClick={() => settings.setTableHiddenColumns({})}
                        >
                            Reset
                        </Button>
                    </SettingsRow>
                </SettingsSection>
            </div>
        </MainLayout>
    );
}
