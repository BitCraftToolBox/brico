import {useColorMode} from "@kobalte/core"
import {A} from "@solidjs/router";

import {
    TbOutlineDeviceLaptop as IconLaptop,
    TbOutlineMoon as IconMoon,
    TbOutlineSearch as IconSearch,
    TbOutlineSettings as IconSettings,
    TbOutlineSun as IconSun
} from "solid-icons/tb"
import {Show} from "solid-js";
import {isDev} from "solid-js/web";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {SidebarTrigger} from "~/components/ui/sidebar";

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
                <span class="sr-only">Toggle theme</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setColorMode("light")}>
                    <IconSun class="mr-2 size-4"/>
                    <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setColorMode("dark")}>
                    <IconMoon class="mr-2 size-4"/>
                    <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setColorMode("system")}>
                    <IconLaptop class="mr-2 size-4"/>
                    <span>System</span>
                </DropdownMenuItem>
                {colorPage()}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface NavProps {
    title: string;
    hideSearch?: boolean;
}

export default function Nav(props: NavProps) {
    return (
        <nav class="flex flex-col sticky z-20 top-0 h-10 bg-sidebar-primary text-sidebar-primary-foreground">
            <div class="flex flex-row items-center h-10 w-full gap-2 px-2">
                <SidebarTrigger class="shrink-0"/>
                <div class="shrink-0">
                    <h1 class="text-lg text-center leading-none">{props.title}</h1>
                </div>
                <div class="flex-1"/>
                <Show when={!props.hideSearch}>
                    {/* Full search input on sm+ */}
                    <GlobalSearchInput class="hidden sm:block w-56 lg:w-72" placeholder="Search..."/>
                    {/* Icon link on xs */}
                    <div class="shrink-0 sm:hidden">
                        <Button as={"A"} href="/search" variant="ghost" size="sm" class="w-7 px-0" aria-label="Search">
                            <IconSearch class="size-5"/>
                        </Button>
                    </div>
                </Show>
                <div class="shrink-0">
                    <DarkModeToggle/>
                </div>
                <div class="shrink-0">
                    <A href="/settings">
                        <Button variant="ghost" size="sm" class="w-7 px-0" aria-label="Settings">
                            <IconSettings class="size-5"/>
                        </Button>
                    </A>
                </div>
            </div>
        </nav>
    )
}
