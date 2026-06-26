import {TbOutlineExternalLink as IconExternal, TbOutlineInfoCircle as IconCurrent, TbOutlineInfoTriangle as IconOutdated} from "solid-icons/tb";
import {createResource, onCleanup, onMount, Show} from "solid-js";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {CURRENT_VERSION, type VersionInfo} from "~/lib/version";

async function fetchLatestVersion(): Promise<VersionInfo | undefined> {
    if (typeof window === "undefined") return undefined;

    try {
        const response = await fetch("https://cereal-data.brico.app/latest.json");
        if (!response.ok) return undefined;
        const json = await response.json() as VersionInfo;
        if (!json?.tag || typeof json.tag !== "string") return undefined;
        return json;
    } catch {
        return undefined;
    }
}

function versionSummary(version: VersionInfo, short?: boolean): string {
    const label = short
        ? version.label?.split(" -")[0]
        : version.label;
    return `${version.tag}${label ? ` - ${label}` : ""}`;
}

function descSummary(description?: string): string | undefined {
    if (!description) return undefined;
    return description.split("\n\n")[0];
}

function hasDescription(version: VersionInfo): boolean {
    return Boolean(version.description && version.description.trim().length > 0);
}

export function VersionChecker() {
    const [latestVersion, {refetch}] = createResource(fetchLatestVersion);

    onMount(() => {
        let timer = setInterval(refetch, 15 * 60 * 1000); // 15 minutes
        onCleanup(() => clearInterval(timer));
    });

    const isUnknown = () => CURRENT_VERSION.tag === "Unknown";
    const isOutdated = () => {
        const latest = latestVersion();
        if (!latest) return false;
        return isUnknown() || latest.tag !== CURRENT_VERSION.tag;
    };

    const showWarning = () => isUnknown() || isOutdated();

    return (
        <div class="w-full flex justify-center py-1">
            <Popover placement="right">
                <PopoverTrigger>
                    <Button variant="ghost" size="sm" class="h-8 max-w-full px-2 flex items-center gap-0 cursor-pointer">
                        <Show when={showWarning()} fallback={<IconCurrent class="size-4 shrink-0"/>}>
                            <IconOutdated class="size-4 shrink-0 text-warning-foreground"/>
                        </Show>
                        <span
                            class="overflow-hidden text-sm
                                   transition-[max-width,opacity] duration-200 ease-linear
                                   ml-1.5 max-w-40 opacity-100
                                   group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:ml-0"
                        >
                            {versionSummary(CURRENT_VERSION, true)}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent class="max-w-80 text-xs space-y-2" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
                    <div class="font-medium">Current data version</div>
                    <div>{versionSummary(CURRENT_VERSION)}</div>
                    <Show when={hasDescription(CURRENT_VERSION)}>
                        <div class="text-muted-foreground">{descSummary(CURRENT_VERSION.description)}</div>
                    </Show>

                    <Show when={isOutdated() && latestVersion()} fallback={
                        <Show when={latestVersion()}>
                            <div class="border-t border-border"/>
                            <div class="font-medium">Up to date</div>
                        </Show>
                    }>
                        {(latest) => (
                            <>
                                <div class="border-t border-border"/>
                                <div class="font-medium">
                                    Latest available{" "}
                                    <a href="https://preview.brico.app" target="_blank" class="underline">
                                        (check preview <IconExternal class="inline"/>)
                                    </a>
                                </div>
                                <div>{versionSummary(latest())}</div>
                                <Show when={hasDescription(latest())}>
                                    <div class="text-muted-foreground">{descSummary(latest().description)}</div>
                                </Show>
                            </>
                        )}
                    </Show>
                </PopoverContent>
            </Popover>
        </div>
    );
}
