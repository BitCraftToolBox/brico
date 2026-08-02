import {ConfigColorMode} from "@kobalte/core";
import * as SelectPrimitive from "@kobalte/core/select";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {type IconTypes} from "solid-icons";
import {FaSolidArrowDownAZ as IconSortAZ, FaSolidFolderTree as IconSortTree} from "solid-icons/fa";
import {SiCrowdin as IconCrowdin} from "solid-icons/si";
import {
    TbFillLayoutGrid as IconViewGrid,
    TbOutlineDeviceLaptop as IconSystem,
    TbOutlineDots as IconDots,
    TbOutlineList as IconViewList,
    TbOutlineList as IconSortData,
    TbOutlineListNumbers as IconSortPK,
    TbOutlineMoon as IconMoon,
    TbOutlineSun as IconSun,
} from "solid-icons/tb";
import {children, createMemo, createSignal, For, JSX, onCleanup, onMount, Show} from "solid-js";
import {isServer} from "solid-js/web";
import MainLayout from "~/components/MainLayout";
import BricoFace from "~/components/ui/brico-face";
import {Button} from "~/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Switch, SwitchControl, SwitchThumb} from "~/components/ui/switch";
import {DATA_LOCALES, dataTranslationsPending} from "~/lib/data-translation";
import {localeLabel, PSEUDOLOCALE_ENABLED, UI_LOCALES, uiLocaleLoading} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import {AUTO_LOCALE, NaturalSortOrder, type SortMode, useSettings, type ViewMode} from "~/lib/settings";
import {SIDEBAR_GROUPS, SidebarGroupDef, type SidebarItemDef} from "~/lib/sidebar-items";

// ── Shared UI helpers ─────────────────────────────────────────

/**
 * A language `Select` over `options`, with `AUTO_LOCALE` first and labelled by `autoLabel`.
 *
 * Both language rows share this; the only differences are the option list and what "automatic"
 * means (the browser's preference for the UI, the interface language for game data).
 */
function LocaleSelect(props: {
    value: string;
    onChange: (v: string) => void;
    options: readonly string[];
    autoLabel: string;
    disabled?: boolean;
}) {
    const options = () => [AUTO_LOCALE, ...props.options];
    const label = (locale: string) => locale === AUTO_LOCALE ? props.autoLabel : localeLabel(locale);
    return (
        <Select
            value={props.value}
            onChange={(v) => v && props.onChange(v)}
            options={options()}
            disabled={props.disabled}
            itemComponent={(p) => <SelectItem item={p.item}>{label(p.item.rawValue)}</SelectItem>}
        >
            <SelectTrigger class="h-8 w-[200px]">
                <SelectValue<string>>{(s) => label(s.selectedOption())}</SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );
}

// `title`/`description` are JSX rather than `string` so callers can pass <Trans> directly.
function SettingsSection(props: {title: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    const description = children(() => props.description);
    return (
        <section class="flex flex-col gap-3">
            <div>
                <h2 class="text-base font-semibold">{props.title}</h2>
                <Show when={description()}>
                    <p class="text-sm text-muted-foreground">{description()}</p>
                </Show>
            </div>
            <div class="rounded-lg border bg-card p-4 flex flex-col gap-4">
                {props.children}
            </div>
        </section>
    );
}

function SettingsRow(props: {label: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    const description = children(() => props.description);
    return (
        <div class="flex flex-row items-center justify-between gap-4">
            <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium">{props.label}</span>
                <Show when={description()}>
                    <span class="text-xs text-muted-foreground">{description()}</span>
                </Show>
            </div>
            <div class="shrink-0">{props.children}</div>
        </div>
    );
}

function ButtonGroup<T extends string>(props: {
    // `label` is a plain string, not JSX: it is used as `title`/`aria-label` as well as visible
    // text, so callers resolve it with `useLingui()._(msg\`…\`)` rather than wrapping in <Trans>.
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

const KONAMI_CODE = [
    "ArrowUp", "ArrowUp",
    "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight",
    "ArrowLeft", "ArrowRight",
    "b", "a",
    "Enter",
];

/**
 * Multi-select that lets users choose which sidebar items are "favorites"
 * (i.e. visible). Options are grouped by category using Kobalte's native
 * option-group support. Selected = visible; deselected = hidden.
 */
function SidebarFavoritesSelect() {
    const settings = useSettings();
    const label = useLabel();

    const allItems = createMemo(() => SIDEBAR_GROUPS.flatMap(g => g.items));
    const selectedItems = createMemo(() =>
        allItems().filter(item => settings.sidebarFavorites().includes(item.href))
    );

    return (
        <div class="flex flex-col gap-1.5">
            <div>
                <span class="text-sm font-medium"><Trans>Favorite items</Trans></span>
                <p class="text-xs text-muted-foreground mt-0.5">
                    <Trans>Checked items appear in the sidebar. New items are always visible by default.</Trans>
                </p>
            </div>
            <Select<SidebarItemDef, SidebarGroupDef>
                multiple
                options={SIDEBAR_GROUPS}
                optionValue={(item) => item.href}
                optionTextValue={(item) => label(item.titleLabel)}
                optionGroupChildren="items"
                value={selectedItems()}
                placeholder={<>
                    <Trans>No items visible
                    {" "}<span class="text-xs text-muted-foreground">You know you can just collapse the sidebar, right? Did you just uncheck every single item to see what would happen?</span>
                    </Trans>
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
                            <span>{label(itemProps.item.rawValue.titleLabel)}</span>
                        </div>
                    </SelectItem>
                )}
                sectionComponent={(secProps) => (
                    <SelectPrimitive.Section class="px-2 pt-2 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        {label(secProps.section.rawValue.nameLabel)}
                    </SelectPrimitive.Section>
                )}
            >
                <SelectTrigger class="w-full">
                    <SelectValue<SidebarItemDef>>
                        {(state) => {
                            const count = state.selectedOptions().length;
                            const total = allItems().length;
                            return count >= total
                                ? <Trans>All items visible</Trans>
                                : <Trans>{count} of {total} items visible</Trans>;
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
    const {_} = useLingui();

    const [konamiUnlocked, setKonamiUnlocked] = createSignal(false);
    let konamiIdx = 0;
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === KONAMI_CODE[konamiIdx]) {
            konamiIdx++;
            if (konamiIdx === KONAMI_CODE.length) {
                setKonamiUnlocked(true);
                konamiIdx = 0;
            }
        } else {
            // Allow restarting from the first key if the mistyped key happens to be it
            konamiIdx = e.key === KONAMI_CODE[0] ? 1 : 0;
        }
    };
    if (!isServer) {
        onMount(() => window.addEventListener("keydown", onKeyDown));
        onCleanup(() => window.removeEventListener("keydown", onKeyDown));
    }
    const [developerMode, setDeveloperMode] = createSignal(false);
    const [taps, setTaps] = createSignal(0);
    const [showDevModeUnlock, setShowDevModeUnlock] = createSignal(false);
    const incUnlockCounter = () => {
        if (showEasterSection()) return;
        setTaps(taps() + 1);
        if (taps() >= 7) {
            setDeveloperMode(true);
            setShowDevModeUnlock(true);
            setTimeout(() => setShowDevModeUnlock(false), 1500);
        }
    }

    /** Show the section if unlocked this session OR if already enabled (to allow toggling off). */
    const showEasterSection = () => konamiUnlocked() || developerMode() || settings.easterEggs();

    // Derived counts for the "Reset hidden columns" row
    const hiddenColumnStats = createMemo(() => {
        const map = settings.tableHiddenColumns();
        const tableNames = Object.keys(map).filter(t => map[t].length > 0);
        const totalCols = tableNames.reduce((sum, t) => sum + map[t].length, 0);
        return {tables: tableNames.length, columns: totalCols};
    });

    return (
        <MainLayout title="Settings" hideSearch description="Configure Brico.app — theme, favorites, and display preferences for the BitCraft compendium.">
            <div class="max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <h1 class="text-2xl font-bold" onclick={incUnlockCounter}><Show when={showDevModeUnlock()} fallback={<Trans>Settings</Trans>}><Trans>You are now a developer!</Trans></Show></h1>

                {/* ── Theme ──────────────────────────────── */}
                <SettingsSection
                    title={<Trans>Theme</Trans>}
                    description={<Trans>Choose how Brico's Toolbox looks.</Trans>}
                >
                    <SettingsRow label={<Trans>Color mode</Trans>} description={<Trans>Light, dark, or follow your system preference.</Trans>}>
                        <ButtonGroup<ConfigColorMode>
                            value={settings.colorStorageManager.get() ?? "system"}
                            onChange={settings.colorStorageManager.set}
                            options={[
                                {value: "light",  icon: IconSun,    label: _(msg`Light`)},
                                {value: "dark",   icon: IconMoon,   label: _(msg`Dark`)},
                                {value: "system", icon: IconSystem, label: _(msg`System`)},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow label={<Trans>Midnight</Trans>} description={<Trans>High contrast for vampires and OLED enjoyers. Only affects dark mode.</Trans>}>
                        <Switch checked={settings.midnightDark()} onChange={settings.setMidnightDark}>
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                </SettingsSection>

                {/* ── Language ───────────────────────────── */}
                <SettingsSection
                    title={<Trans>Language</Trans>}
                    description={<Trans>Choose the languages used for Brico's own text and for in-game text.</Trans>}
                >
                    <SettingsRow
                        label={<Trans>Interface language</Trans>}
                        description={<><Trans>Language for Brico's own labels, menus, and settings.</Trans>
                            <Show when={uiLocaleLoading()}>
                                {" "}<span class="text-muted-foreground"><Trans>Loading…</Trans></span>
                            </Show>
                            <Show when={PSEUDOLOCALE_ENABLED}>
                                <br/><span class="text-muted-foreground"><Trans>Forced to the pseudolocale for Crowdin review.</Trans></span>
                            </Show>
                        </>}
                    >
                        <LocaleSelect
                            value={settings.uiLocale()}
                            onChange={settings.setUILocale}
                            options={UI_LOCALES}
                            autoLabel={_(msg`Automatic`)}
                            disabled={PSEUDOLOCALE_ENABLED}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Game data language</Trans>}
                        description={<>
                            <Trans>Language for in-game names, descriptions, etc.<br/>
                                <span class="text-muted-foreground">
                                    Official (though AI-generated) translations from Clockwork Labs. These reflect in-game text,
                                    and are not controlled by Brico.app.
                                </span>
                            </Trans>
                            <Show when={dataTranslationsPending()}>
                                <br/><span class="text-muted-foreground"><Trans>Loading translations…</Trans></span>
                            </Show>
                            <Show when={PSEUDOLOCALE_ENABLED}>
                                <br/><span class="text-muted-foreground"><Trans>Forced to Crowdin's target language for review.</Trans></span>
                            </Show>
                        </>}
                    >
                        <LocaleSelect
                            value={settings.dataLocale()}
                            onChange={settings.setDataLocale}
                            options={DATA_LOCALES}
                            autoLabel={_(msg`Same as interface`)}
                            disabled={PSEUDOLOCALE_ENABLED}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Want to help translate Brico.app?</Trans>}
                        description={<Trans>
                            Join the project on Crowdin and contribute by using <span class="font-mono">translate.brico.app</span>.
                        </Trans>}
                    >
                        <div class="flex flex-col sm:flex-row gap-2">
                            <Button as={"a"} variant="outline" href="https://crowdin.com/project/brico" target="_blank">
                                <IconCrowdin class="size-4 shrink-0"/> <span>Crowdin</span>
                            </Button>
                            <Button as={"a"} variant="outline" href="https://translate.brico.app">
                                <BricoFace class="inline size-4 shrink-0 align-bottom"/> <span>Translate</span>
                            </Button>
                        </div>
                    </SettingsRow>
                </SettingsSection>

                {/* ── Sidebar ────────────────────────────── */}
                <SettingsSection
                    title={<Trans>Sidebar</Trans>}
                    description={<Trans>Customize how the navigation sidebar is organized and displayed.</Trans>}
                >
                    <SettingsRow
                        label={<Trans>Show sidebar controls</Trans>}
                        description={<Trans>When disabled, hides the quick controls for the sort order/view style/favorites.</Trans>}
                    >
                        <Switch
                            checked={settings.showSidebarControls()}
                            onChange={settings.setShowSidebarControls}
                        >
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Collapse sidebar by default</Trans>}
                        description={<Trans>Whether to show the sidebar in its collapsed (icon only) state on initial load.</Trans>}
                    >
                        <Switch
                            checked={settings.sidebarStartsCollapsed()}
                            onChange={settings.setSidebarStartsCollapsed}
                        >
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SettingsRow label={<Trans>Sort order</Trans>} description={<Trans>Show items grouped by category (tree) or sorted alphabetically.</Trans>}>
                        <ButtonGroup<SortMode>
                            value={settings.sidebarSort()}
                            onChange={settings.setSidebarSort}
                            options={[
                                {value: "tree", icon: IconSortTree, label: _(msg`Tree`)},
                                {value: "az",   icon: IconSortAZ,   label: _(msg`A–Z`)},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow label={<Trans>View style</Trans>} description={<Trans>Compact list or icon grid.</Trans>}>
                        <ButtonGroup<ViewMode>
                            value={settings.sidebarView()}
                            onChange={settings.setSidebarView}
                            options={[
                                {value: "list", icon: IconViewList, label: _(msg`List`)},
                                {value: "grid", icon: IconViewGrid, label: _(msg`Grid`)},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Favorites only</Trans>}
                        description={<Trans>When enabled, only your favorite items are shown in the sidebar.</Trans>}
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
                    title={<Trans>Tables</Trans>}
                    description={<Trans>Options for data tables across the app.</Trans>}
                >
                    <SettingsRow
                        label={<Trans>Default rows per page</Trans>}
                        description={<Trans>How many rows are shown per page when a table first loads.</Trans>}
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
                        label={<Trans>Show row actions first</Trans>}
                        description={<Trans>Moves the <IconDots class="inline"/> menu to the first column instead of the last.</Trans>}
                    >
                        <Switch checked={settings.tableActionsFirst()} onChange={settings.setTableActionsFirst}>
                            <SwitchControl><SwitchThumb/></SwitchControl>
                        </Switch>
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Table natural sort order</Trans>}
                        description={<><Trans>Naturally sort tables by their primary ID, or use the internal database ordering.</Trans>
                            <br/><span class="text-muted-foreground"><Trans>Any manually applied column sort will override this.</Trans></span>
                        </>}
                    >
                        <ButtonGroup<NaturalSortOrder>
                            value={settings.tableNaturalSort()}
                            onChange={settings.setTableNaturalSort}
                            options={[
                                {value: "pk", icon: IconSortPK, label: _(msg`Object ID`)},
                                {value: "db", icon: IconSortData, label: _(msg`Database Order`)},
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label={<Trans>Reset hidden columns</Trans>}
                        // Two nested plurals: languages differ both in *which* plural categories
                        // exist and in agreement, so this must stay one message with two ICU
                        // plurals rather than concatenated fragments.
                        description={<Trans>
                            Un-hide <Plural value={hiddenColumnStats().columns} one="# table column" other="# table columns"/>
                            {" "}across <Plural value={hiddenColumnStats().tables} one="# table page" other="# table pages"/>.
                        </Trans>}
                    >
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={hiddenColumnStats().columns === 0}
                            onClick={() => settings.setTableHiddenColumns({})}
                        >
                            <Trans>Reset</Trans>
                        </Button>
                    </SettingsRow>
                </SettingsSection>

                <Show when={showEasterSection()}>
                    <SettingsSection
                        title={<Trans>🥚 Easter Eggs</Trans>}
                        description={<Trans>Secret features. How did you even find this?</Trans>}
                    >
                        <SettingsRow
                            label={<Trans>Enable easter eggs</Trans>}
                            description={<Trans>Unlocks hidden easter-egg features scattered across the site.</Trans>}
                        >
                            <Switch checked={settings.easterEggs()} onChange={settings.setEasterEggs}>
                                <SwitchControl><SwitchThumb/></SwitchControl>
                            </Switch>
                        </SettingsRow>
                        <SettingsRow label={<Trans>TF2 Mode</Trans>} description={<Trans>Hats</Trans>}>
                            <Switch checked={settings.tf2Mode()} onChange={settings.setTf2Mode}>
                                <SwitchControl><SwitchThumb/></SwitchControl>
                            </Switch>
                        </SettingsRow>
                        <SettingsRow label={<Trans>Region 9 Mode</Trans>} description={<Trans>Jamba Be Praised</Trans>}>
                            <Switch checked={settings.r9Mode()} onChange={settings.setR9Mode}>
                                <SwitchControl><SwitchThumb/></SwitchControl>
                            </Switch>
                        </SettingsRow>
                    </SettingsSection>
                </Show>
            </div>
        </MainLayout>
    );
}
