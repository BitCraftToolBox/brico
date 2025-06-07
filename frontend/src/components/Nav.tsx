import {useColorMode} from "@kobalte/core"

import {TbDeviceLaptop as IconLaptop, TbMoon as IconMoon, TbSun as IconSun} from "solid-icons/tb"
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {SidebarTrigger} from "~/components/ui/sidebar";
import {children, JSX, Show} from "solid-js";

function DarkModeToggle() {
    const {setColorMode} = useColorMode()

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
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface NavProps {
    title: string;
    children: JSX.Element;
}

export default function Nav(props: NavProps) {
    const c = children(() => props.children);
    return (
        <nav class={`flex flex-col bg-sidebar pt-1 sticky z-20 top-0 ${c() ? "h-20" : "h-10"}`}>
            <div class="flex flex-row justify-center h-10 w-full">
                <SidebarTrigger class="mr-auto ml-2"/>
                <div>
                    <h1 class="text-lg text-center">{props.title}</h1>
                </div>
                <div class="ml-auto mr-2">
                    <DarkModeToggle/>
                </div>
            </div>
            <Show when={c()}>
                <div class="flex flex-row justify-center h-10 w-full">
                    {c()}
                </div>
            </Show>
        </nav>
    )
}
