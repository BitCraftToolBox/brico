import {useColorMode} from "@kobalte/core"
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";

import {
    TbOutlineDeviceLaptop as IconLaptop,
    TbOutlineLoader2 as IconConnecting,
    TbOutlineMoon as IconMoon,
    TbOutlinePlugConnected as IconConnected,
    TbOutlinePlugConnectedX as IconConnectionError,
    TbOutlinePlugOff as IconDisconnected,
    TbOutlineSearch as IconSearch,
    TbOutlineSettings as IconSettings,
    TbOutlineSun as IconSun,
    TbOutlineWorld as IconWorld,
} from "solid-icons/tb"
import {createMemo, For, JSX, Match, Show, Switch} from "solid-js";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {SidebarTrigger} from "~/components/ui/sidebar";
import {dataLocaleFor} from "~/lib/data-translation";
import {localeLabel, PSEUDOLOCALE_ENABLED, UI_LOCALES, type UILocale} from "~/lib/i18n";
import {AUTO_LOCALE, useSettings} from "~/lib/settings";
import {type ConnectionSnapshot, useConnectionManager} from "~/lib/spacetime/manager";
import {Popover, PopoverContent, PopoverTrigger} from "./ui/popover";

function LanguageMenu() {
    const settings = useSettings();

    const setLocale = (locale: UILocale) => {
        settings.setUILocale(locale);
        settings.setDataLocale(dataLocaleFor(locale));
    };
    const setAuto = () => {
        settings.setUILocale(AUTO_LOCALE);
        settings.setDataLocale(AUTO_LOCALE);
    };

    const translationsPage = () => settings.devMenusEnabled() || PSEUDOLOCALE_ENABLED ? <>
        <DropdownMenuSeparator/>
        <DropdownMenuItem>
            <A href="/tools/translations">All Translations</A>
        </DropdownMenuItem>
    </> : <></>;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger as={Button<"button">} variant="ghost" size="sm" class="w-7 px-0">
                <span class="text-base leading-none" aria-hidden="true"><IconWorld/></span>
                <span class="sr-only"><Trans>Change language</Trans></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={setAuto}>
                    <span><Trans>Automatic</Trans></span>
                </DropdownMenuItem>
                <DropdownMenuSeparator/>
                <For each={UI_LOCALES}>
                    {(locale) => (
                        <DropdownMenuItem onSelect={() => setLocale(locale)} disabled={PSEUDOLOCALE_ENABLED && locale !== "zu"}>
                            <span>{localeLabel(locale)}</span>
                        </DropdownMenuItem>
                    )}
                </For>
                {translationsPage()}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function DarkModeToggle() {
    const {devMenusEnabled} = useSettings();
    const {setColorMode} = useColorMode();
    const colorPage = () => devMenusEnabled() ? <>
        <DropdownMenuSeparator/>
        <DropdownMenuItem>
            <A href="/tools/colors">Theme Colors</A>
        </DropdownMenuItem>
    </> : <></>;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger as={Button<"button">} variant="ghost" size="sm" class="w-7 px-0">
                <IconSun class="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"/>
                <IconMoon class="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"/>
                <span class="sr-only"><Trans>Toggle theme</Trans></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setColorMode("light")}>
                    <IconSun class="mr-2 size-4"/>
                    <span><Trans>Light</Trans></span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setColorMode("dark")}>
                    <IconMoon class="mr-2 size-4"/>
                    <span><Trans>Dark</Trans></span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setColorMode("system")}>
                    <IconLaptop class="mr-2 size-4"/>
                    <span><Trans>System</Trans></span>
                </DropdownMenuItem>
                {colorPage()}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

type OverallConnectionStatus = "idle" | "live" | "pending" | "error";

function overallConnectionStatus(connections: ConnectionSnapshot[]): OverallConnectionStatus {
    // `closed` covers both an explicit `close()` and a connection held (e.g. by `AccountProvider`)
    // but never opened — neither is "trying to connect", so it must not read as `pending` forever.
    const relevant = connections.filter(c => c.status !== "closed");
    if (relevant.length === 0) return "idle";
    if (relevant.some(c => c.status === "error")) return "error";
    if (relevant.some(c => c.status !== "live")) return "pending";
    return "live";
}

const CONNECTION_STATUS_CLASS: Record<OverallConnectionStatus, string> = {
    idle: "text-muted-foreground",
    live: "text-success-foreground",
    pending: "text-warning-foreground",
    error: "text-destructive",
};

/** Navbar status icon for the app-wide `ConnectionManager` — a tooltip lists what it's holding. */
function ConnectionStatusIndicator() {
    const {_} = useLingui();
    const {devMenusEnabled, connectionManagerOpen: open, setConnectionManagerOpen: setOpen} = useSettings();
    const connections = useConnectionManager().snapshot;
    const overall = createMemo(() => overallConnectionStatus(connections()));
    const toggleOpen = () => setOpen(!open());

    return (
        <Popover open={devMenusEnabled() && open()}>
            <PopoverTrigger as={Button} variant="ghost" size="sm" class="w-7 px-0" aria-label={_(msg`Connection status`)} onclick={toggleOpen}>
                <Switch>
                    <Match when={overall() === "idle"}>
                        <IconDisconnected class={`size-5 ${CONNECTION_STATUS_CLASS.idle}`}/>
                    </Match>
                    <Match when={overall() === "pending"}>
                        <IconConnecting class={`size-5 ${CONNECTION_STATUS_CLASS.pending} animate-spin`}/>
                    </Match>
                    <Match when={overall() === "error"}>
                        <IconConnectionError class={`size-5 ${CONNECTION_STATUS_CLASS.error}`}/>
                    </Match>
                    <Match when={overall() === "live"}>
                        <IconConnected class={`size-5 ${CONNECTION_STATUS_CLASS.live}`}/>
                    </Match>
                </Switch>
            </PopoverTrigger>
            <PopoverContent class="w-auto max-w-[90svw] opacity-75">
                <Show when={connections().length > 0} fallback={<div><Trans>No active connections</Trans></div>}>
                    <div class="space-y-2">
                        <For each={connections()}>
                            {(conn) => (
                                <div>
                                    <div class="font-medium flex flex-row gap-2">
                                        {conn.module}
                                        <div class="text-muted-foreground">
                                            ({conn.status}<Show when={conn.error}>{(error) => `: ${error()}`}</Show>)
                                        </div>
                                    </div>
                                    <For each={conn.resources}>
                                        {(resource) => (
                                            <div class="pl-2">
                                                <span class="font-mono">{resource.key} {resource.requests}</span>
                                                <Show when={!resource.ready}>{" "}<Trans>(pending)</Trans></Show>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </PopoverContent>
        </Popover>
    );
}

/**
 * Accessible name for the breadcrumb landmark. Carries a translator comment because BitCraft has
 * its own literal "Breadcrumb …" in the catalog, so a bare "Breadcrumb" is ambiguous out of context.
 */
const BREADCRUMB_LABEL = msg({
    message: "Breadcrumb",
    comment: "Accessible name for the navigation trail in the top bar (not the in-game prospecting trail)",
});

interface NavProps {
    title: JSX.Element;
    hideSearch?: boolean;
}

export default function Nav(props: NavProps) {
    const {_} = useLingui();
    const {devMenusEnabled} = useSettings();
    return (
        // <header>, not <nav>: this bar is the site banner (trigger, breadcrumb, search, prefs).
        <header class="flex flex-col sticky z-20 top-0 h-10 bg-sidebar-primary text-sidebar-primary-foreground">
            <div class="flex flex-row items-center h-10 w-full gap-2 px-2">
                <SidebarTrigger class="shrink-0"/>
                <nav aria-label={_(BREADCRUMB_LABEL)} class="max-w-[calc(90svw-5rem)] overflow-x-clip shrink min-w-0" style={{direction: "rtl"}}>
                    <div class="text-lg text-center text-nowrap leading-none">{props.title}</div>
                </nav>
                <div class="flex-1"/>
                <Show when={!props.hideSearch}>
                    {/* Full search input on sm+ */}
                    <GlobalSearchInput class="hidden sm:block w-56 lg:w-72" placeholder={_(msg`Search...`)}/>
                    {/* Icon link on xs */}
                    <div class="shrink-0 sm:hidden">
                        <Button as={A} href="/search" variant="ghost" size="sm" class="w-7 px-0" aria-label={_(msg`Search`)}>
                            <IconSearch class="size-5"/>
                        </Button>
                    </div>
                </Show>
                {/* Least important controls: hide them outright on very narrow screens so search/settings never get pushed off-screen. */}
                <div class="hidden min-[400px]:block shrink-0">
                    <LanguageMenu/>
                </div>
                <div class="hidden min-[400px]:block shrink-0">
                    <DarkModeToggle/>
                </div>
                <Show when={devMenusEnabled()}>
                    <div class="shrink-0">
                        <ConnectionStatusIndicator/>
                    </div>
                </Show>
                <div class="shrink-0">
                    <A href="/settings">
                        <Button variant="ghost" size="sm" class="w-7 px-0" aria-label={_(msg`Settings`)}>
                            <IconSettings class="size-5"/>
                        </Button>
                    </A>
                </div>
            </div>
        </header>
    )
}
