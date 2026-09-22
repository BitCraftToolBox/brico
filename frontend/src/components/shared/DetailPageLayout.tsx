/**
 * DetailPageLayout — Unified detail page layout for all game object types.
 *
 * Structure:
 * 1. Header: Icon + Name/Title, Tier, Rarity, Description, Tag
 * 2. Info Section with pseudo-tabs: Details | Summary | Raw Data
 * 3. Relationship Tabs: Each tab renders a mini table of related objects
 */

import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
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
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {Rarities} from "~/lib/bitcraft-utils";
import {sourceRow} from "~/lib/data-translation";
import {breadcrumb} from "~/lib/game-links";
import {rarityLabel} from "~/lib/game-strings";
import {type Label, useLabel} from "~/lib/labels";
import {BITCRAFT_TITLE_SUFFIX, detailMetaDescription, metaKeywords} from "~/lib/og-meta";
import {BreadcrumbJsonLd, ItemPageJsonLd, type JsonLdProperty} from "~/lib/structured-data";
import {cn, useCopy} from "~/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

export interface DetailProperty {
    /** A `Label` (see `~/lib/labels`), a plain string, or arbitrary markup. */
    label: Label | string | (() => JSX.Element);
    value: string | number | boolean | undefined | null | (() => JSX.Element);
}

export interface DetailGroup {
    heading?: Label | string | (() => JSX.Element);
    properties: DetailProperty[];
}

export interface RelationshipTab {
    id: string;
    /**
     * A `Label` — preferred, because tabs are built by plain factory functions outside any
     * component, so the text has to be resolved at render time rather than baked in — or a plain
     * string for call sites not yet migrated.
     */
    label: Label | string;
    showWhenEmpty?: boolean;
    count?: number;
    content: () => JSX.Element;
}

export interface DetailPageProps {
    /** Page title (shown in browser tab / MainLayout) */
    title: string;
    /**
     * Href of the list page this object belongs to (e.g. `"/database/item"`). Single source for both
     * the navbar breadcrumb and the `BreadcrumbList` JSON-LD trail, so the two can't drift.
     */
    breadcrumbHref?: string;
    /**
     * Override for the breadcrumb's page-level wording — a singular noun for a detail page, or an
     * already-resolved display string. See `breadcrumb()` in ~/lib/game-links.
     */
    breadcrumbTitle?: Label | string;
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
     * Noun for this entity type (e.g. "resource", "item", "skill"), used to build the SEO/social
     * meta description + keywords from tier/rarity/tag. Defaults to a generic term.
     */
    metaKind?: string;
    /** OG/Twitter thumbnail (absolute or root-relative). Defaults to the branded thumbnail. */
    metaImage?: string;
    /** Tab to try to open first - tries details first if unset **/
    defaultTab?: string;
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
    /**
     * Canonical URL to declare instead of this page's own — see `MainLayout`. Also suppresses the
     * `ItemPage` JSON-LD, which would otherwise claim this URL as an entity page.
     */
    canonicalOverride?: string;
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

const PropertyGrid: Component<{ properties: DetailProperty[] }> = (props) => {
    const label = useLabel();
    return (
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <For each={visibleProps(props.properties)}>
                {(prop) => (
                    <div class="flex flex-col">
                        <span class="text-muted-foreground text-xs">
                            {typeof prop.label === "function" ? (prop.label as () => JSX.Element)() : label(prop.label)}
                        </span>
                        <span class="font-medium">
                            {typeof prop.value === "boolean"
                                ? (prop.value ? <Trans>Yes</Trans> : <Trans>No</Trans>)
                                : typeof prop.value === "function"
                                    ? (prop.value as () => JSX.Element)()
                                    : prop.value}
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
};

// ─── Pseudo-Tab Link ────────────────────────────────────────────

type InfoTab = "details" | "summary" | "raw" | string;

const PseudoTabLink: Component<{
    label: string | JSX.Element;
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
    const [copyContent, contentCopied] = useCopy(() => props.content);

    return (
        <Button variant="outline" size="sm" onClick={copyContent}>
            <Show when={contentCopied()} fallback={props.copyElement || <><IconClipboardCopy class="mr-1"/> <Trans>Copy JSON</Trans></>}>
                {props.copiedElement || <><IconClipboardCheck class="mr-1"/> <Trans>Copied!</Trans></>}
            </Show>
        </Button>
    );
}

// ─── Main Component ─────────────────────────────────────────────

export const DetailPageLayout: Component<DetailPageProps> = (props) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabLabel = useLabel();

    /**
     * The Raw Data tab shows the *untranslated* row — it is raw. `sourceRow()` returns the original
     * English row for anything the data layer rewrote, and the row itself when nothing matched, so
     * callers can keep passing whatever they already render from.
     */
    const rawData = () => sourceRow(props.rawData);

    const availableTabs = () => props.tabs?.filter(t => t.count === undefined || t.count > 0) ?? [];
    const disabledTabs = () => props.tabs?.filter(t => t.count !== undefined && t.count === 0 && (t.showWhenEmpty ?? true)) ?? [];
    const metaArgs = () => ({
        kind: props.metaKind ?? "entry",
        tier: props.tier,
        rarity: props.rarity,
        tag: props.tag,
        description: props.description,
    });

    const groups = () => normalizeGroups(props.details);
    const hasDetails = () => groups().some(g => visibleProps(g.properties).length > 0);
    const hasInfoSection = () => hasDetails() || props.summaryContent || props.rawData || props.infoTabs;

    /**
     * The property grid as plain `name`/`value` pairs for JSON-LD. The grid stacks its label above
     * its value with no separator, which looks right but flattens to garbage for a crawler reading
     * visible text ("Occupants4. Allow HuntingNo."), so hand over the pairs directly instead of
     * distorting the layout. Function-valued labels and values are markup — links, tooltips, icon
     * rows — with no meaningful plain-text form, so they're skipped rather than stringified.
     */
    const jsonLdProperties = (): JsonLdProperty[] => {
        const out: JsonLdProperty[] = [];
        if (props.tier !== undefined) out.push({name: "Tier", value: props.tier});
        if (props.rarity) out.push({name: "Rarity", value: props.rarity});
        // "Category", not "Type": several grids already have a "Type" row of their own (weapon type,
        // tool type), and two same-named PropertyValues in one list is ambiguous.
        if (props.tag) out.push({name: "Category", value: props.tag});
        for (const group of groups()) {
            for (const prop of visibleProps(group.properties)) {
                if (typeof prop.label === "function" || typeof prop.value === "function") continue;
                out.push({name: tabLabel(prop.label), value: prop.value!});
            }
        }
        return out;
    };

    const [infoTab, setInfoTabRaw] = createSignal<InfoTab>(props.defaultTab ?? "details");
    const setInfoTab = (info: string) => {
        setInfoTabRaw(info);
        setSearchParams({info}, {replace: true});
    }
    // Start undefined; the effect below will resolve from ?detail= or default to first tab.
    const [selectedTab, setSelectedTabRaw] = createSignal<string | undefined>(undefined);
    const setSelectedTab = (detail: string) => {
        setSelectedTabRaw(detail);
        setSearchParams({detail}, {replace: true});
    }

    onMount(() => {
        const tabParam = Array.isArray(searchParams.info) ? searchParams.info[0] : searchParams.info;
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
        // Default: find a tab with content
        if (!hasDetails() && props.summaryContent) {
            setInfoTab("summary");
        } else if (!props.summaryContent && hasDetails()) {
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
        <>
        <BreadcrumbJsonLd href={props.breadcrumbHref} titleOverride={props.breadcrumbTitle} objectName={props.name}/>
        {/* Skipped when the page canonicalizes elsewhere: asserting an `ItemPage` for a URL we've
            just told crawlers isn't the canonical one would contradict the canonical tag. */}
        <Show when={!props.canonicalOverride}>
            <ItemPageJsonLd
                name={props.name}
                description={props.description}
                image={props.metaImage}
                properties={jsonLdProperties()}
            />
        </Show>
        <MainLayout
            title={props.title}
            canonicalOverride={props.canonicalOverride}
            titleSuffix={BITCRAFT_TITLE_SUFFIX}
            ownHeading
            description={detailMetaDescription(metaArgs())}
            keywords={metaKeywords(metaArgs())}
            image={props.metaImage}
            navTitle={props.breadcrumbHref ? breadcrumb(props.breadcrumbHref, props.breadcrumbTitle) : undefined}
        >
            <Show when={!props.loading} fallback={
                <div class="flex items-center justify-center py-20">
                    <Spinner type={SpinnerType.ballTriangle} class="mx-auto"/>
                </div>
            }>
                <div class="max-w-5xl mx-auto flex flex-col gap-4 px-4 pb-6">
                    {/* Header Section */}
                    <div class={`flex ${props.iconIsWide ? "flex-col items-center sm:flex-row sm:items-start" : "flex-row items-start"} gap-4`}>
                        {props.icon}
                        <div class="flex flex-col gap-1">
                            <h1 class="text-2xl font-bold flex items-center gap-2 flex-wrap">
                                {props.name}
                                <Show when={props.tier !== undefined}>
                                    <TierIcon tier={props.tier!}/>
                                </Show>
                                <Show when={props.rarity}>{r => {
                                    return <span class={`text-sm font-medium px-2 py-0.5 rounded ${Rarities.getBorderColorClass({tag: r()} as any)} border`}>
                                        {rarityLabel(r())}
                                    </span>
                                }}</Show>
                                <Show when={props.chatLink}>
                                    {link => {
                                        const [copy, copied] = useCopy(link, 1000);
                                        const [open, setOpen] = createSignal(false);
                                        const {_} = useLingui();
                                        return (
                                            <Tooltip open={open() || copied()} onOpenChange={setOpen}>
                                                <TooltipTrigger
                                                    as={Button} variant="default" onclick={copy} aria-label={_(msg`Copy Chat Link`)}
                                                    size="icon" class={cn("size-6", copied() ? "hover:bg-success/90 bg-success" : "")}
                                                >
                                                    <FontIcon codepoint="0115"/>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <Show when={copied()} fallback={<Trans>Copy Chat Link</Trans>}>
                                                        <Trans>Copied!</Trans>
                                                    </Show>
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    }}
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
                                        <PseudoTabLink label={<Trans>Summary</Trans>} tab="summary" active={infoTab()} onClick={setInfoTab}/>
                                    </Show>
                                    <For each={props.infoTabs}>{tab =>
                                        <PseudoTabLink label={tab[0]} tab={tab[0]} active={infoTab()} onClick={setInfoTab}/>
                                    }</For>
                                    <PseudoTabLink label={<Trans>Details</Trans>} tab="details" active={infoTab()} onClick={setInfoTab}/>
                                    <Show when={props.rawData}>
                                        <PseudoTabLink label={<Trans>Raw Data</Trans>} tab="raw" active={infoTab()} onClick={setInfoTab}/>
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
                                                                {typeof group.heading === "function"
                                                                    ? (group.heading as () => JSX.Element)()
                                                                    : tabLabel(group.heading!)}
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
                                <Show when={infoTab() === "raw" && rawData()}>
                                    <div class="flex flex-col gap-3">
                                        <div class="flex gap-2 items-center flex-wrap">
                                            <CopyButton
                                                content={JSON.stringify(rawData(), null, 2)}
                                                copyElement={<><IconClipboardText/> <Trans>Copy JSON</Trans></>}
                                            />
                                            <Show when={props.objectId !== undefined}>
                                                <CopyButton
                                                    content={String(props.objectId)}
                                                    copyElement={<><IconClipboardCopy/> <Trans>Copy ID</Trans></>}
                                                />
                                            </Show>
                                            <Show when={props.chatLink}>{s =>
                                                <CopyButton
                                                    content={s()}
                                                    copyElement={<><FontIcon codepoint="FFE0" class="mr-1"/> <Trans>Copy Chat Link</Trans></>}
                                                />
                                            }</Show>
                                            <Show when={props.spacetimeTable && props.objectId !== undefined}>
                                                <a
                                                    href={`https://cereal.brico.app/table/${props.spacetimeTable}/${props.objectId}`}
                                                    target="_blank"
                                                    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <IconExternal/> <Trans>Browse raw data on 🥣 cereal</Trans>
                                                </a>
                                            </Show>
                                        </div>
                                        <pre class="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-[500px] whitespace-pre-wrap break-all">
                                            {JSON.stringify(rawData(), null, 2)}
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
                                                        {tabLabel(tab.label)}
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
                                                        {tabLabel(tab.label)} (0)
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
        </>
    );
};

// ─── Helper: Simple Relationship Table ──────────────────────────

export interface RelTableColumn<T> {
    header: Label | string;
    cell: (row: T) => JSX.Element;
    class?: string;
}

interface RelTableProps<T> {
    data: T[];
    columns: RelTableColumn<T>[];
    onRowClick?: (row: T) => void;
}

export function RelTable<T>(props: RelTableProps<T>) {
    const label = useLabel();
    return (
        <div class="overflow-auto max-h-[90svh] rounded border">
            <table class="w-full text-sm">
                <thead class="sticky top-0 z-10 bg-background border-b">
                <tr>
                    <For each={props.columns}>
                        {(col) => (
                            <th class={cn("text-left px-3 py-2 font-medium text-muted-foreground", col.class)}>
                                {label(col.header)}
                            </th>
                        )}
                    </For>
                </tr>
                </thead>
                <tbody>
                <For each={props.data} fallback={
                    <tr>
                        <td colspan={props.columns.length} class="text-center py-4 text-muted-foreground"><Trans>No data</Trans></td>
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
