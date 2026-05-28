/**
 * DetailPageLayout — Unified detail page layout for all game object types.
 *
 * Structure:
 * 1. Header: Icon + Name/Title, Tier, Rarity, Description, Tag
 * 2. Info Section with pseudo-tabs: Details | Summary | Raw Data
 * 3. Relationship Tabs: Each tab renders a mini table of related objects
 */

import {useSearchParams} from "@solidjs/router";
import {
    TbOutlineClipboardCheck as IconClipboardCheck,
    TbOutlineClipboardCopy as IconClipboardCopy,
    TbOutlineClipboardText as IconClipboardText,
    TbOutlineExternalLink as IconExternal
} from "solid-icons/tb";
import {Component, createEffect, createSignal, For, JSX, onMount, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {FontIcon} from "~/components/icons/font-icons";
import MainLayout from "~/components/MainLayout";
import {TierIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardHeader} from "~/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {Rarities} from "~/lib/bitcraft-utils";
import {cn} from "~/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

export interface DetailProperty {
    label: JSX.Element | string;
    value: JSX.Element | string | number | boolean | undefined | null;
}

export interface DetailGroup {
    heading?: JSX.Element | string;
    properties: DetailProperty[];
}

export interface RelationshipTab {
    id: string;
    label: string;
    showWhenEmpty?: boolean;
    count?: number;
    content: () => JSX.Element;
}

export interface DetailPageProps {
    /** Page title (shown in browser tab / MainLayout) */
    title: string;
    /** Shown before the title in the navbar */
    breadcrumb?: JSX.Element;
    /** Whether the primary data is still loading */
    loading?: boolean;
    /** Icon element */
    icon?: JSX.Element;
    iconIsWide?: boolean;
    /** Display name */
    name: string;
    /** Tier value (renders TierIcon) */
    tier?: number;
    /** Rarity tag string */
    rarity?: string;
    /** Description text */
    description?: string;
    /** Tag/category label */
    tag?: string;
    /**
     * Detailed info — either a flat list of properties (rendered as one group)
     * or an array of DetailGroup with optional subheadings.
     */
    details?: DetailProperty[] | DetailGroup[];
    /** Content for the Summary pseudo-tab (leave undefined to hide tab) */
    summaryContent?: () => JSX.Element;
    /** Raw data object for the Raw Data pseudo-tab */
    rawData?: any;
    /** SpacetimeDB table name (snake_case) for cereal link */
    spacetimeTable?: string;
    /** Object ID for copying */
    objectId?: string | number;
    /** BitCraft chat hyperlink */
    chatLink?: string;
    /** Extra detail tabs **/
    infoTabs?: [string, () => JSX.Element][]
    /** Relationship tabs */
    tabs?: RelationshipTab[];
    /** Fallback when entity not found */
    notFound?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Type guard: is the details array a list of DetailGroup? */
function isGroupArray(arr: DetailProperty[] | DetailGroup[]): arr is DetailGroup[] {
    return arr.length > 0 && "properties" in arr[0];
}

/** Normalize details to always be DetailGroup[] */
function normalizeGroups(details: DetailProperty[] | DetailGroup[] | undefined): DetailGroup[] {
    if (!details || details.length === 0) return [];
    if (isGroupArray(details)) return details;
    return [{properties: details}];
}

/** Filter out properties with no value */
function visibleProps(props: DetailProperty[]): DetailProperty[] {
    return props.filter(d => d.value !== undefined && d.value !== null);
}

// ─── Property Grid ──────────────────────────────────────────────

const PropertyGrid: Component<{ properties: DetailProperty[] }> = (props) => (
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
        <For each={visibleProps(props.properties)}>
            {(prop) => (
                <div class="flex flex-col">
                    <span class="text-muted-foreground text-xs">{prop.label}</span>
                    <span class="font-medium">
                        {typeof prop.value === "boolean"
                            ? (prop.value ? "Yes" : "No")
                            : prop.value}
                    </span>
                </div>
            )}
        </For>
    </div>
);

// ─── Pseudo-Tab Link ────────────────────────────────────────────

type InfoTab = "details" | "summary" | "raw" | string;

const PseudoTabLink: Component<{
    label: string;
    tab: InfoTab;
    active: InfoTab;
    onClick: (tab: InfoTab) => void;
}> = (props) => (
    <button
        class={`text-sm pb-1 border-b-2 transition-colors ${
            props.active === props.tab
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
        }`}
        onClick={() => props.onClick(props.tab)}
    >
        {props.label}
    </button>
);

// copy button
const CopyButton: Component<{
    content: string;
    copyElement?: JSX.Element;
    copiedElement?: JSX.Element;
}> = (props) => {
    const [jsonCopied, setJsonCopied] = createSignal(false);
    const copyContent = () => {
        if (props.content) {
            navigator.clipboard.writeText(props.content).then(() => {
                setJsonCopied(true);
                setTimeout(() => setJsonCopied(false), 1500);
            });
        }
    };

    return (
        <Button variant="outline" size="sm" onClick={copyContent}>
            <Show when={jsonCopied()} fallback={props.copyElement || <><IconClipboardCopy class="mr-1"/> Copy JSON</>}>
                {props.copiedElement || <><IconClipboardCheck class="mr-1"/> Copied!</>}
            </Show>
        </Button>
    );
}

// ─── Main Component ─────────────────────────────────────────────

export const DetailPageLayout: Component<DetailPageProps> = (props) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const availableTabs = () => props.tabs?.filter(t => t.count === undefined || t.count > 0) ?? [];
    const disabledTabs = () => props.tabs?.filter(t => t.count !== undefined && t.count === 0 && (t.showWhenEmpty ?? true)) ?? [];
    const groups = () => normalizeGroups(props.details);
    const hasDetails = () => groups().some(g => visibleProps(g.properties).length > 0);
    const hasInfoSection = () => hasDetails() || props.summaryContent || props.rawData || props.infoTabs;

    const [infoTab, setInfoTabRaw] = createSignal<InfoTab>("summary");
    const setInfoTab = (tab: string) => {
        setInfoTabRaw(tab);
        setSearchParams({tab}, {replace: true});
    }
    // Start undefined; the effect below will resolve from ?detail= or default to first tab.
    const [selectedTab, setSelectedTabRaw] = createSignal<string | undefined>(undefined);
    const setSelectedTab = (detail: string) => {
        setSelectedTabRaw(detail);
        setSearchParams({detail}, {replace: true});
    }

    onMount(() => {
        const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
        if (tabParam) {
            // Build the list of valid info-tab ids so we can validate the param.
            const validInfoTabs: string[] = [
                ...(props.summaryContent ? ["summary"] : []),
                ...(props.infoTabs?.map(t => t[0]) ?? []),
                ...(hasDetails() ? ["details"] : []),
                ...(props.rawData ? ["raw"] : []),
            ];
            if (validInfoTabs.includes(tabParam)) {
                setInfoTab(tabParam as InfoTab);
                return; // skip the default-details logic below
            }
        }
        // Default: prefer Details when there is no Summary
        if (hasDetails() && !props.summaryContent) {
            setInfoTab("details");
        }
    });

    createEffect(() => {
        const tabs = availableTabs();
        const detailParam = Array.isArray(searchParams.detail) ? searchParams.detail[0] : searchParams.detail;

        if (detailParam) {
            const match = tabs.find(t => t.id === detailParam);
            setSelectedTab(match?.id ?? tabs[0]?.id);
            return;
        }

        // No param: keep the current selection if it is still valid, otherwise reset to first tab.
        // (selectedTab() is only read in this branch so it is not a dependency when detailParam is set,
        //  preventing a re-trigger loop after setSelectedTab is called above.)
        const current = selectedTab();
        if (current && tabs.find(t => t.id === current)) return;
        setSelectedTab(tabs[0]?.id);
    });

    return (
        <MainLayout title={props.title} navTitle={<>{props.breadcrumb}{props.title}</>}>
            <Show when={!props.loading} fallback={
                <div class="flex items-center justify-center py-20">
                    <Spinner type={SpinnerType.ballTriangle} class="mx-auto"/>
                </div>
            }>
                <div class="max-w-5xl mx-auto flex flex-col gap-4 px-4 pb-6">
                    {/* Header Section */}
                    <div class={`flex ${props.iconIsWide ? "flex-col items-center sm:flex-row sm:items-start" : "flex-row items-start"} gap-4`}>
                        <Show when={props.icon}>
                            {props.icon}
                        </Show>
                        <div class="flex flex-col gap-1">
                            <h1 class="text-2xl font-bold flex items-center gap-2 flex-wrap">
                                {props.name}
                                <Show when={props.tier !== undefined}>
                                    <TierIcon tier={props.tier!}/>
                                </Show>
                                <Show when={props.rarity}>
                                    <span class={`text-sm font-medium px-2 py-0.5 rounded ${Rarities.getBorderColorClass({tag: props.rarity!} as any)} border`}>
                                        {props.rarity}
                                    </span>
                                </Show>
                            </h1>
                            <Show when={props.tag}>
                                <span class="text-sm text-muted-foreground">{props.tag}</span>
                            </Show>
                            <Show when={props.description}>
                                <p class="text-muted-foreground max-w-prose">{props.description}</p>
                            </Show>
                        </div>
                    </div>

                    {/* Info Section with pseudo-tabs */}
                    <Show when={hasInfoSection()}>
                        <Card>
                            <CardHeader class="pb-2">
                                <div class="flex gap-4 items-center">
                                    <Show when={props.summaryContent}>
                                        <PseudoTabLink label="Summary" tab="summary" active={infoTab()} onClick={setInfoTab}/>
                                    </Show>
                                    <For each={props.infoTabs}>{tab =>
                                        <PseudoTabLink label={tab[0]} tab={tab[0]} active={infoTab()} onClick={setInfoTab}/>
                                    }</For>
                                    <PseudoTabLink label="Details" tab="details" active={infoTab()} onClick={setInfoTab}/>
                                    <Show when={props.rawData}>
                                        <PseudoTabLink label="Raw Data" tab="raw" active={infoTab()} onClick={setInfoTab}/>
                                    </Show>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Summary tab */}
                                <Show when={infoTab() === "summary" && props.summaryContent}>
                                    {props.summaryContent!()}
                                </Show>
                                {/* Extra tabs */}
                                <For each={props.infoTabs}>{tab =>
                                    <Show when={infoTab() === tab[0]}>
                                        {tab[1]()}
                                    </Show>
                                }</For>
                                {/* Details tab */}
                                <Show when={infoTab() === "details" && hasDetails()}>
                                    <div class="flex flex-col gap-4">
                                        <For each={groups()}>
                                            {(group) => (
                                                <Show when={visibleProps(group.properties).length > 0}>
                                                    <div>
                                                        <Show when={group.heading}>
                                                            <h3 class="text-sm font-semibold text-muted-foreground mb-2 border-b pb-1">
                                                                {group.heading}
                                                            </h3>
                                                        </Show>
                                                        <PropertyGrid properties={group.properties}/>
                                                    </div>
                                                </Show>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                                {/* Raw Data tab */}
                                <Show when={infoTab() === "raw" && props.rawData}>
                                    <div class="flex flex-col gap-3">
                                        <div class="flex gap-2 items-center flex-wrap">
                                            <CopyButton
                                                content={JSON.stringify(props.rawData, null, 2)}
                                                copyElement={<><IconClipboardText/> Copy JSON</>}
                                            />
                                            <Show when={props.objectId !== undefined}>
                                                <CopyButton
                                                    content={String(props.objectId)}
                                                    copyElement={<><IconClipboardCopy/> Copy ID</>}
                                                />
                                            </Show>
                                            <Show when={props.chatLink}>{s =>
                                                <CopyButton
                                                    content={s()}
                                                    copyElement={<><FontIcon codepoint="FFE0" class="mr-1"/> Copy Chat Link</>}
                                                />
                                            }</Show>
                                            <Show when={props.spacetimeTable && props.objectId !== undefined}>
                                                <a
                                                    href={`https://cereal.brico.app/table/${props.spacetimeTable}/${props.objectId}`}
                                                    target="_blank"
                                                    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <IconExternal/> Browse raw data on 🥣 cereal
                                                </a>
                                            </Show>
                                        </div>
                                        <pre class="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-[500px] whitespace-pre-wrap break-all">
                                            {JSON.stringify(props.rawData, null, 2)}
                                        </pre>
                                    </div>
                                </Show>
                            </CardContent>
                        </Card>
                    </Show>

                    {/* Relationship Tabs Section */}
                    <Show when={availableTabs().length + disabledTabs().length}>
                        <Card>
                            <CardContent class="pt-4">
                                <Tabs value={selectedTab()} onChange={setSelectedTab}>
                                    <Show when={availableTabs().length}>
                                        <TabsList class="flex flex-wrap h-auto gap-1">
                                            <For each={availableTabs()}>
                                                {(tab) => (
                                                    <TabsTrigger value={tab.id} class="text-sm items-baseline">
                                                        {tab.label}
                                                        <Show when={tab.count !== undefined}>
                                                            <span class="ml-1 text-xs text-muted-foreground">({tab.count})</span>
                                                        </Show>
                                                    </TabsTrigger>
                                                )}
                                            </For>
                                        </TabsList>
                                    </Show>
                                    <Show when={disabledTabs().length}>
                                        <TabsList class="flex flex-wrap h-auto gap-1">
                                            <For each={disabledTabs()}>
                                                {(tab) => (
                                                    <TabsTrigger value={tab.id} disabled class="text-sm opacity-50">
                                                        {tab.label} (0)
                                                    </TabsTrigger>
                                                )}
                                            </For>
                                        </TabsList>
                                    </Show>
                                    <For each={availableTabs()}>
                                        {(tab) => (
                                            <TabsContent value={tab.id} class="mt-4">
                                                {tab.content()}
                                            </TabsContent>
                                        )}
                                    </For>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </Show>
                </div>
            </Show>
        </MainLayout>
    );
};

// ─── Helper: Simple Relationship Table ──────────────────────────

export interface RelTableColumn<T> {
    header: string;
    cell: (row: T) => JSX.Element;
    class?: string;
}

interface RelTableProps<T> {
    data: T[];
    columns: RelTableColumn<T>[];
    onRowClick?: (row: T) => void;
}

export function RelTable<T>(props: RelTableProps<T>) {
    return (
        <div class="overflow-auto max-h-[90svh] rounded border">
            <table class="w-full text-sm">
                <thead class="sticky top-0 z-10 bg-background border-b">
                <tr>
                    <For each={props.columns}>
                        {(col) => (
                            <th class={cn("text-left px-3 py-2 font-medium text-muted-foreground", col.class)}>
                                {col.header}
                            </th>
                        )}
                    </For>
                </tr>
                </thead>
                <tbody>
                <For each={props.data} fallback={
                    <tr>
                        <td colspan={props.columns.length} class="text-center py-4 text-muted-foreground">No data</td>
                    </tr>
                }>
                    {(row) => (
                        <tr
                            class={`border-b hover:bg-muted/50 ${props.onRowClick ? "cursor-pointer" : ""}`}
                            onclick={() => props.onRowClick?.(row)}
                        >
                            <For each={props.columns}>
                                {(col) => (
                                    <td class={cn("px-3 py-2", col.class)}>
                                        {col.cell(row)}
                                    </td>
                                )}
                            </For>
                        </tr>
                    )}
                </For>
                </tbody>
            </table>
        </div>
    );
}
