import {useColorMode} from "@kobalte/core"
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";

import {
    TbOutlineDeviceLaptop as IconLaptop,
    TbOutlineMoon as IconMoon,
    TbOutlineSearch as IconSearch,
    TbOutlineSettings as IconSettings,
    TbOutlineSun as IconSun
} from "solid-icons/tb"
import {For, JSX, Show} from "solid-js";
import {isDev} from "solid-js/web";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {SidebarTrigger} from "~/components/ui/sidebar";
import {dataLocaleFor} from "~/lib/data-translation";
import {localeLabel, PSEUDOLOCALE_ENABLED, UI_LOCALES, type UILocale} from "~/lib/i18n";
import {AUTO_LOCALE, useSettings} from "~/lib/settings";

/** Flag shown for each `UI_LOCALES` entry. Not derivable from the locale tag, so hand-mapped. */
const LOCALE_FLAGS: Partial<Record<UILocale, string>> = {
    en: "🇺🇸",
    de: "🇩🇪",
    es: "🇪🇸",
    fr: "🇫🇷",
    pl: "🇵🇱",
    "pt-BR": "🇧🇷",
    ru: "🇷🇺",
    ja: "🇯🇵",
    "zh-Hans": "🇨🇳",
    "zh-Hant": "🇹🇼",
};
const AUTO_FLAG = "🌐";

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

    const translationsPage = isDev || PSEUDOLOCALE_ENABLED ? () => (<>
        <DropdownMenuSeparator/>
        <DropdownMenuItem>
            <A href="/tools/translations">All Translations</A>
        </DropdownMenuItem>
    </>) : () => <></>;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger as={Button<"button">} variant="ghost" size="sm" class="w-7 px-0">
                <span class="text-base leading-none" aria-hidden="true">{LOCALE_FLAGS[settings.resolvedUILocale()] ?? AUTO_FLAG}</span>
                <span class="sr-only"><Trans>Change language</Trans></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={setAuto}>
                    <span class="mr-2 w-5 text-center" aria-hidden="true">{AUTO_FLAG}</span>
                    <span><Trans>Automatic</Trans></span>
                </DropdownMenuItem>
                <DropdownMenuSeparator/>
                <For each={UI_LOCALES}>
                    {(locale) => (
                        <DropdownMenuItem onSelect={() => setLocale(locale)} disabled={PSEUDOLOCALE_ENABLED && locale !== "zu"}>
                            <span class="mr-2 w-5 text-center" aria-hidden="true">{LOCALE_FLAGS[locale] ?? AUTO_FLAG}</span>
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
    const {setColorMode} = useColorMode()
    const colorPage = isDev ? () => (<>
        <DropdownMenuSeparator/>
        <DropdownMenuItem>
            <A href="/tools/colors">Theme Colors</A>
        </DropdownMenuItem>
    </>) : () => <></>;

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

interface NavProps {
    title: JSX.Element;
    hideSearch?: boolean;
}

export default function Nav(props: NavProps) {
    const {_} = useLingui();
    return (
        <nav class="flex flex-col sticky z-20 top-0 h-10 bg-sidebar-primary text-sidebar-primary-foreground">
            <div class="flex flex-row items-center h-10 w-full gap-2 px-2">
                <SidebarTrigger class="shrink-0"/>
                <div class="max-w-[calc(90svw-5rem)] overflow-x-clip">
                    <h1 class="text-lg text-center text-nowrap leading-none">{props.title}</h1>
                </div>
                <div class="flex-1"/>
                <Show when={!props.hideSearch}>
                    {/* Full search input on sm+ */}
                    <GlobalSearchInput class="hidden sm:block w-56 lg:w-72" placeholder={_(msg`Search...`)}/>
                    {/* Icon link on xs */}
                    <div class="shrink-0 sm:hidden">
                        <Button as={"A"} href="/search" variant="ghost" size="sm" class="w-7 px-0" aria-label={_(msg`Search`)}>
                            <IconSearch class="size-5"/>
                        </Button>
                    </div>
                </Show>
                <div class="shrink-0">
                    <LanguageMenu/>
                </div>
                <div class="shrink-0">
                    <DarkModeToggle/>
                </div>
                <div class="shrink-0">
                    <A href="/settings">
                        <Button variant="ghost" size="sm" class="w-7 px-0" aria-label={_(msg`Settings`)}>
                            <IconSettings class="size-5"/>
                        </Button>
                    </A>
                </div>
            </div>
        </nav>
    )
}
