/**
 * browse.tsx — the live open-craft browser.
 *
 * The filter itself is evaluated by `@brico/crafts/filter`, deliberately kept as a standalone pure
 * module.
 *
 * The rows go through `~/components/data-table/live-table`, not the `DataTable` the static
 * database pages use: this page needs that component's sortable headers, pagination bar and column
 * toggle to look and behave like every other table on the site, but none of its search, faceted
 * filters, URL round-tripping or per-table session state — filtering here belongs to
 * `FilterBuilder`, and the faceted row models would re-derive per-column facets over a few
 * thousand rows twice a second for nothing.
 */
import {
    BOUNTY_CURRENCIES,
    CLAIM_ACCESS_FLAGS,
    evaluateFilter,
    type FilterField,
    type FilterNode,
    filtersEqual,
    type FilterValue,
    openWorkFilter,
    parseFilter,
    quickWorkFilter,
    quickWorkFilterState,
} from "@brico/crafts/filter";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import type {TriggerKind} from "@brico/crafts/watch";
import {i18n, type MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {leadingAndTrailing, throttle} from "@solid-primitives/scheduled";
import {A, useSearchParams} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {
    TbOutlineBell as IconBell,
    TbOutlineBellRinging as IconBellRinging,
    TbOutlineChevronDown as IconChevronDown,
    TbOutlineClipboardCheck as IconClipboardCheck,
    TbOutlineCopy as IconCopy,
    TbOutlineDeviceFloppy as IconSave,
    TbOutlineFileExport as IconSavedFilters,
    TbOutlineInfoCircle as IconBountyOverview,
    TbOutlineLock as IconLock,
    TbOutlineTrash as IconRemove,
} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, For, Show} from "solid-js";
import {type FieldOption, FilterBuilder} from "~/components/crafts/FilterBuilder";
import {OutputIcon} from "~/components/crafts/OutputIcon";
import {QuickFilterGrid} from "~/components/crafts/QuickFilterGrid";
import {type FilterExport, SavedFiltersDialog} from "~/components/crafts/SavedFiltersDialog";
import {LiveTable} from "~/components/data-table/live-table";
import {FontIcon} from "~/components/icons/font-icons";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {TierIcon} from "~/components/shared/GameIcon";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "~/components/ui/dialog";
import {Label} from "~/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {useLinkedIntegrations} from "~/lib/account/links.tsx";
import {useAccount} from "~/lib/account/state.tsx";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {createBountyAssignments} from "~/lib/crafts/bounty";
import {craftEntriesFrom, type CraftEntry} from "~/lib/crafts/entries";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {claimAccessFlagLabel, currencyData} from "~/lib/crafts/filter-vocab";
import {byLabel, craftStaticOptions, SKILL_ORDER} from "~/lib/crafts/options";
import {formatPayoutRate} from "~/lib/crafts/payout";
import {type CraftSnapshot, createCraftRelay, EMPTY_SNAPSHOT} from "~/lib/crafts/relay";
import {createCraftWatchRunner, type WatchNotification} from "~/lib/crafts/watches";
import {breadcrumbCurrent} from "~/lib/game-links";
import {trackUILocale, uiLocale} from "~/lib/i18n";
import {gameText, useLabel} from "~/lib/labels.ts";
import {useNotifications} from "~/lib/notifications/state";
import {type CraftWatchTriggers, type SavedCraftFilter, useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {cn, useCopy} from "~/lib/utils";

const PAGE_HREF = "/tools/crafts/browse";

/** Keys the persisted hidden-column set. Shares a namespace with the database tables' names. */
const TABLE_NAME = "craft-browser";

/**
 * How often the filter builder's value pickers are refreshed.
 *
 * They are rebuilt from every open craft — six passes over the whole list plus a locale-aware sort
 * — which is far too much to redo on each 500 ms relay snapshot for a dropdown that is usually
 * closed. A claim or player appearing a few seconds late in a picker is not something anyone can
 * notice; a list that stutters twice a second is.
 */
const OPTIONS_REFRESH_MS = 5000;

/** The distinct, non-null values of one craft property, as a lookup set for `FieldOption.active`. */
function activeValues<T extends FilterValue>(entries: readonly CraftEntry[], valueOf: (entry: CraftEntry) => T | null): Set<T> {
    const values = new Set<T>();
    for (const entry of entries) {
        const value = valueOf(entry);
        if (value !== null) values.add(value);
    }
    return values;
}

/**
 * Same as `activeValues`, for a craft property that is a *set* rather than a single nullable value
 * — `inputItem`/`inputItemTag` (see `CraftSubject.inputItems`), where a craft's several inputs each
 * contribute their own key/tag rather than the craft having just one.
 */
function activeSetValues<T extends FilterValue>(entries: readonly CraftEntry[], valuesOf: (entry: CraftEntry) => readonly (T | null)[]): Set<T> {
    const values = new Set<T>();
    for (const entry of entries) {
        for (const value of valuesOf(entry)) {
            if (value !== null) values.add(value);
        }
    }
    return values;
}

let relativeTimeFormat: Intl.RelativeTimeFormat | undefined;
let relativeTimeFormatLocale: string | undefined;

/** Cached per locale, same reasoning as the `Intl.Collator`/`Intl.DurationFormat` caches elsewhere. */
function getRelativeTimeFormat(locale: string): Intl.RelativeTimeFormat {
    if (relativeTimeFormatLocale !== locale) {
        relativeTimeFormat = new Intl.RelativeTimeFormat(locale, {style: "narrow", numeric: "always"});
        relativeTimeFormatLocale = locale;
    }
    return relativeTimeFormat!;
}

/**
 * Compact "how long ago", sized for a table cell — the exact time goes in the cell's tooltip.
 *
 * `Intl.RelativeTimeFormat` (not hand-glued "Xm ago" text) so unit placement and pluralization
 * follow the target locale's own rules instead of an English template — the same reasoning as
 * `~/lib/utils.ts`'s `Intl.DurationFormat` usage.
 */
function sinceText(ms: number, now: number, locale: string): string {
    trackUILocale();
    const seconds = Math.max(Math.round((now - ms) / 1000), 0);
    const rtf = getRelativeTimeFormat(locale);
    if (seconds < 60) return i18n._(msg`just now`);
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
    if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), "hour");
    return rtf.format(-Math.floor(seconds / 86400), "day");
}

function ProgressBar(props: {entry: CraftEntry}) {
    return (
        <div class="flex items-center gap-2">
            <div class="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary" style={{width: `${Math.round(props.entry.fraction * 100)}%`}}/>
            </div>
            <span class="tabular-nums text-xs text-muted-foreground">
                {props.entry.effortDone.toLocaleString(uiLocale())} / {props.entry.effortTotal.toLocaleString(uiLocale())}
            </span>
        </div>
    );
}

/** A cell whose value the relay may not have resolved, rendered as a muted dash when it hasn't. */
function OrDash(props: {value: string | null}) {
    return (
        <Show when={props.value} fallback={<span class="text-muted-foreground">—</span>}>
            {value => <>{value()}</>}
        </Show>
    );
}

type CraftCell<TValue> = CellContext<CraftEntry, TValue>;

/** A craft's bounty rate, decimal-formatted in whichever direction the shared display setting prefers. */
function PayoutRateCell(props: {rate: number; currency: string}) {
    const {_} = useLingui();
    const settings = useSettings();
    return (
        <button
            class="hover:underline"
            title={_(msg`Switch between currency/effort and effort/currency`)}
            onClick={() => settings.setPayoutDisplayMode(settings.payoutDisplayMode() === "currencyPerEffort" ? "effortPerCurrency" : "currencyPerEffort")}
        >
            {formatPayoutRate(props.rate, props.currency, settings.payoutDisplayMode())}
        </button>
    );
}

/**
 * The table's columns.
 *
 * Every one carries an `accessorFn`, which is what makes it both sortable and hideable — the
 * "View" dropdown skips display-only columns. Cells read `row.original` non-reactively, which is
 * safe here and only here: the feed hands the table a fresh entry object for every craft on every
 * snapshot, so the row (and everything under it) is rebuilt rather than re-read.
 */
const COLUMNS: ColumnDef<CraftEntry, any>[] = [
    {
        id: "craft",
        meta: {label: msg`Craft`},
        enableHiding: false,
        accessorFn: entry => entry.recipeName,
        cell: (props: CraftCell<string>) => {
            const entry = props.row.original;
            return (
                <div class="flex items-center gap-2">
                    <OutputIcon output={entry.output}/>
                    <span>
                        <A href={`/tools/crafts/${entry.id}`} class="font-medium hover:underline">{entry.recipeName}</A>
                        <Show when={entry.count > 1}><span class="text-muted-foreground"> ×{entry.count}</span></Show>
                        <Show when={!entry.public}><Badge variant="secondary" class="ml-2"><Trans>private</Trans></Badge></Show>
                        <Show when={entry.complete}><Badge variant="secondary" class="ml-2"><Trans>ready</Trans></Badge></Show>
                    </span>
                </div>
            );
        },
    },
    {
        id: "skill",
        meta: {label: gameText(msg`Skill`)},
        accessorFn: entry => entry.skillName ?? "",
        cell: (props: CraftCell<string>) => {
            const entry = props.row.original;
            return (
                <Show when={entry.skillName} fallback={<span class="text-muted-foreground">—</span>}>
                    {name => (
                        <span class="inline-flex items-center gap-1.5">
                            <Show when={entry.skillIcon}>{icon => <FontIcon codepoint={icon()} class="size-4"/>}</Show>
                            {name()}
                        </span>
                    )}
                </Show>
            );
        },
    },
    {
        id: "tier",
        meta: {label: gameText(msg`Tier`)},
        // Crafts with no `recipe_meta` row have no tier at all; 0 sorts them below tier 1.
        accessorFn: entry => entry.tier ?? 0,
        cell: (props: CraftCell<number>) => (
            <Show when={props.row.original.tier} fallback={<span class="text-muted-foreground">—</span>}>
                {tier => <TierIcon tier={tier()}/>}
            </Show>
        ),
    },
    {
        id: "progress",
        meta: {label: msg`Progress`},
        accessorFn: entry => entry.fraction,
        cell: (props: CraftCell<number>) => <ProgressBar entry={props.row.original}/>,
    },
    {
        id: "remaining",
        meta: {label: msg`Remaining`},
        accessorFn: entry => entry.effortRemaining,
        cell: (props: CraftCell<number>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
    },
    {
        id: "effort",
        meta: {label: msg`Total effort`},
        accessorFn: entry => entry.effortTotal,
        cell: (props: CraftCell<number>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
    },
    {
        id: "bounty",
        meta: {label: msg`Bounty`},
        // `payout` is already a currency-per-effort rate — the float approximation
        // `CraftSubject.payout` carries, for display/sort only (see its doc comment).
        accessorFn: entry => entry.subject.payout ?? undefined,
        cell: (props: CraftCell<number>) => {
            const entry = props.row.original;
            return (
                <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                    <span class="inline-flex items-center gap-1.5">
                        <PayoutRateCell rate={entry.subject.payout!} currency={entry.subject.currency!}/>
                        <Show when={entry.subject.bountyPrivate}>
                            <IconLock class="size-3.5 text-muted-foreground"/>
                        </Show>
                    </span>
                </Show>
            );
        },
        // -1/1 actually compares two undefined rows as 0, unlike first/last which fast-circuit an undefined
        sortUndefined: -1
    },
    {
        id: "estPayout",
        meta: {label: msg`Est. payout`},
        accessorFn: entry => (entry.subject.payout ?? 0) * entry.effortTotal,
        cell: (props: CraftCell<number>) => {
            const entry = props.row.original;
            return (
                <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                    <span class="tabular-nums">
                        {(entry.subject.payout! * entry.effortTotal).toLocaleString(uiLocale(), {maximumFractionDigits: 0})} <CurrencyLabel currency={entry.subject.currency!}/>
                    </span>
                </Show>
            );
        },
    },
    {
        id: "estPayoutRemaining",
        meta: {label: msg`Est. payout remaining`},
        accessorFn: entry => (entry.subject.payout ?? 0) * entry.effortRemaining,
        cell: (props: CraftCell<number>) => {
            const entry = props.row.original;
            return (
                <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                    <span class="inline-flex gap-1 tabular-nums">
                        {(entry.subject.payout! * entry.effortRemaining).toLocaleString(uiLocale(), {maximumFractionDigits: 0})}
                        <CurrencyLabel currency={entry.subject.currency!} iconOnly={true}/>
                    </span>
                </Show>
            );
        },
    },
    {
        id: "region",
        meta: {label: msg`Region`},
        accessorFn: entry => entry.regionName,
    },
    {
        id: "claim",
        meta: {label: msg`Claim`},
        accessorFn: entry => entry.claimName ?? "",
        cell: (props: CraftCell<string>) => <OrDash value={props.row.original.claimName}/>,
    },
    {
        id: "owner",
        meta: {label: msg`Owner`},
        accessorFn: entry => entry.ownerName ?? "",
        cell: (props: CraftCell<string>) => <OrDash value={props.row.original.ownerName}/>,
    },
    {
        id: "lastActive",
        meta: {label: msg`Last active`},
        accessorFn: entry => entry.lastActiveMs,
        cell: (props: CraftCell<number>) => (
            <span class="whitespace-nowrap text-muted-foreground" title={new Date(props.getValue()).toLocaleString(uiLocale())}>
                {sinceText(props.getValue(), Date.now(), uiLocale())}
            </span>
        ),
    },
];

/** A watch with every trigger off — equivalent to no watch, and never persisted as such. */
const NO_WATCH: CraftWatchTriggers = {added: false, finished: false, removed: false};

/** The three watch triggers, in the order the bell popover lists them. */
const WATCH_TRIGGERS: {key: TriggerKind; label: MessageDescriptor}[] = [
    {key: "added", label: msg`Added`},
    {key: "finished", label: msg`Finished`},
    {key: "removed", label: msg`Removed`},
];

/** Popover body for a filter chip's bell: one checkbox per trigger, committed immediately. */
function WatchTriggerPicker(props: {watch: CraftWatchTriggers; onChange: (next: CraftWatchTriggers) => void}) {
    const {_} = useLingui();
    return (
        <PopoverContent class="w-48 space-y-2 p-3">
            <p class="text-xs font-medium text-muted-foreground"><Trans>Notify when a matching craft is…</Trans></p>
            <div class="space-y-1.5">
                <For each={WATCH_TRIGGERS}>
                    {trigger => (
                        <div class="flex flex-row gap-2">
                            <Checkbox
                                checked={props.watch[trigger.key]}
                                onChange={(checked: boolean) => props.onChange({...props.watch, [trigger.key]: checked})}
                            />
                            <Label>{_(trigger.label)}</Label>
                        </div>
                    )}
                </For>
            </div>
        </PopoverContent>
    );
}

/**
 * One chip in the saved-filters row: load on click, copy as JSON, watch bell, delete with
 * confirmation. `active` is purely cosmetic — it marks a chip whose filter exactly matches
 * (`filtersEqual`) the live filter, same "primary" treatment as the Open Crafts/My Crafts/Advanced
 * Filters buttons; it never changes what clicking the chip does.
 */
function SavedFilterChip(props: {
    saved: SavedCraftFilter;
    watch: CraftWatchTriggers;
    active: boolean;
    onLoad: () => void;
    onDelete: () => void;
    onWatchChange: (next: CraftWatchTriggers) => void;
}) {
    const {_} = useLingui();
    const [confirmOpen, setConfirmOpen] = createSignal(false);
    const [copy, copied] = useCopy(JSON.stringify({name: props.saved.name, filter: props.saved.filter} satisfies FilterExport));
    const watchActive = createMemo(() => props.watch.added || props.watch.finished || props.watch.removed);
    // The chip's icon buttons default to a muted color against the chip's own (neutral) background
    // — once that background turns primary-colored, the same muted tone reads too low-contrast, so
    // they switch to a translucent-then-solid primary-foreground instead.
    const iconClass = () => props.active ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground";

    return (
        <span class={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm",
            props.active ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}>
            <button class="hover:underline" onClick={props.onLoad}>{props.saved.name}</button>
            <Popover>
                <PopoverTrigger
                    class={cn(iconClass(), !props.active && watchActive() && "text-primary hover:text-primary")}
                    aria-label={_(msg`Watch settings for filter ${props.saved.name}`)}
                    title={watchActive() ? _(msg`Watch active`) : _(msg`Watch this filter`)}
                >
                    <Show when={watchActive()} fallback={<IconBell class="size-3.5"/>}>
                        <IconBellRinging class="size-3.5"/>
                    </Show>
                </PopoverTrigger>
                <WatchTriggerPicker watch={props.watch} onChange={props.onWatchChange}/>
            </Popover>
            <button
                class={iconClass()}
                aria-label={_(msg`Copy filter ${props.saved.name} as JSON`)}
                onClick={copy}
            >
                <Show when={copied()} fallback={<IconCopy class="size-3.5"/>}>
                    <IconClipboardCheck class="size-3.5"/>
                </Show>
            </button>
            <Dialog open={confirmOpen()} onOpenChange={setConfirmOpen}>
                <DialogTrigger
                    class={iconClass()} aria-label={_(msg`Delete filter ${props.saved.name}`)}
                    onClick={e => { if (e.shiftKey) props.onDelete(); }}
                >
                    <IconRemove class="size-3.5"/>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle><Trans>Delete "{props.saved.name}"?</Trans></DialogTitle>
                        <DialogDescription><Trans>This can't be undone. The filter will still be available via previously created share codes.</Trans></DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}><Trans>Cancel</Trans></Button>
                        <Button variant="destructive" onClick={() => {setConfirmOpen(false); props.onDelete();}}><Trans>Delete</Trans></Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </span>
    );
}

/** How a watch toast describes each transition, following the craft it's about. */
const TRIGGER_VERB: Record<TriggerKind, MessageDescriptor> = {
    added: msg`now matches`,
    finished: msg`finished crafting`,
    removed: msg`no longer matches`,
};

/**
 * `suppressLocal` is called right here, at the same place the toast fires — see
 * `~/lib/notifications/state.tsx`'s doc comment ("Avoiding double notification") for why the
 * server-delivered `notification` row for this same transition must not also count as unread.
 */
function notifyWatch(notification: WatchNotification, suppressLocal: (key: string) => void) {
    suppressLocal(`${notification.filterId}:${notification.event.craftId}:${notification.event.kind}`);
    const craft = notification.event.craft;
    showToast({
        title: () => notification.filterName,
        description: () => (
            <>
                <A href={`/tools/crafts/${notification.event.craftId}`} class="underline">
                    {craft?.recipeName ?? i18n._(msg`Craft ${notification.event.craftId}`)}
                </A>
                {" "}{i18n._(TRIGGER_VERB[notification.event.kind])}
            </>
        ),
        variant: notification.event.kind === "removed" ? "default" : "success",
        // Arrives passively, not from something the user just did — see `ShowToastOptions.priority`.
        priority: "low",
    });
}

export default function CraftBrowser() {
    const {_} = useLingui();
    const label = useLabel();
    const {savedCraftFilters, setSavedCraftFilters, craftFilterWatches, setCraftFilterWatches, craftBrowserState} = useSettings();
    const {suppressLocal} = useNotifications();
    const {isLoggedIn} = useAccount();
    const {links: linkedAccounts} = useLinkedIntegrations();
    const bitcraftAccounts = createMemo(() => {
        const links = linkedAccounts();
        const bcLinks = links.filter(l => l.provider === "bitcraft-ea2");
        return bcLinks.map(link => link.externalId);
    });
    const relay = createCraftRelay();
    const bountyAssignments = createBountyAssignments();

    const {panelOpen, setPanelOpen, advancedFiltersOpen, setAdvancedFiltersOpen, filter, setFilter, sorting, setSorting, pagination, setPagination} = craftBrowserState();
    const [saveName, setSaveName] = createSignal("");
    const [savedFiltersOpen, setSavedFiltersOpen] = createSignal(false);

    // Fill in the current craft filter when there's a `?share=<code>` in the page URL.
    // Reads as `SavedFiltersDialog`'s code-paste import (`readSharedFilters`), but doesn't create
    // a new entry, just sets the current filter.
    // Anonymous connection already opened for `bountyAssignments` above; this waits for that to be
    // `active()` before redeeming. Param is then stripped immediately to prevent re-reads on navigation.
    const [searchParams, setSearchParams] = useSearchParams();
    const shareConn = useConnection(BRICO_APP_SERVER);
    createEffect(() => {
        const code = searchParams.share;
        const active = shareConn.active();
        if (typeof code !== "string" || !active) return;
        setSearchParams({share: undefined}, {replace: true});
        active.procedures.readSharedFilters({code: code.trim().toUpperCase()})
            .then(result => {
                for (const row of result.filters) {
                    let parsedJson: unknown;
                    try {
                        parsedJson = JSON.parse(row.filterJson);
                    } catch {
                        continue;
                    }
                    const parsed = parseFilter(parsedJson);
                    if (parsed) {
                        setFilter(parsed);
                        return;
                    }
                }
            })
            .catch(() => {/* an invalid/expired code just leaves the filter as it was */});
    });

    // `null` whenever the current filter isn't exactly `openWorkFilter()` plus an optional
    // skill/tier selection — see `quickWorkFilterState`'s doc comment. The grids only ever
    // *reflect* that one shape; anything else (a hand-edited filter, an imported one, ...) renders
    // them inert rather than guessing at a partial match, so a stray click there can't silently
    // discard whatever more complex filter is actually active.
    const quickState = createMemo(() => quickWorkFilterState(filter()));
    const quickActive = createMemo(() => quickState() !== null);
    const toggleQuickSkill = (id: number) => {
        const current = quickState();
        if (!current) return;
        const skills = current.skills.includes(id) ? current.skills.filter(s => s !== id) : [...current.skills, id];
        setFilter(quickWorkFilter({...current, skills}));
    };
    const toggleQuickTier = (tier: number) => {
        const current = quickState();
        if (!current) return;
        const tiers = current.tiers.includes(tier) ? current.tiers.filter(t => t !== tier) : [...current.tiers, tier];
        setFilter(quickWorkFilter({...current, tiers}));
    };

    const staticOptions = createMemo(() => craftStaticOptions());

    // Ordered, icon-carrying skill list for the quick-filter grid — the same in-game order the
    // bounty rule builder's skill/tier grid uses (`SKILL_ORDER`), intersected with the skills that
    // actually appear on some recipe (the same set `craftStaticOptions().skill` already computed).
    const quickFilterSkills = createMemo(() => {
        const allowed = new Set(staticOptions().skill.map(option => option.value));
        const order = new Map(SKILL_ORDER.map((id, index) => [id, index]));
        return (BitCraftTables.SkillDesc.get() ?? [])
            .filter(skill => allowed.has(skill.id) && order.has(skill.id))
            .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
            .map(skill => ({id: skill.id, name: skill.name, iconAssetName: skill.iconAssetName ?? undefined}));
    });
    const quickFilterTiers = createMemo(() => staticOptions().tier.map(option => option.value as number));

    const myCraftsFilter = createMemo((): FilterNode => ({
        op: "and",
        children: [
            {op: "or", children: bitcraftAccounts().map(pid => ({field: "owner", cmp: "eq", value: pid}))},
        ],
    }));
    const filterMyCrafts = () => setFilter(myCraftsFilter());

    // Cosmetic-only "is this shortcut exactly the live filter" checks, for the "primary" highlight
    // on the Open Crafts/My Crafts/saved-chip buttons below — see `filtersEqual`'s doc comment.
    const openCraftsActive = createMemo(() => filtersEqual(filter(), openWorkFilter()));
    const myCraftsActive = createMemo(() => isLoggedIn() && bitcraftAccounts().length > 0 && filtersEqual(filter(), myCraftsFilter()));

    const entries = createMemo(() => craftEntriesFrom(relay.snapshot(), bountyAssignments()));
    createCraftWatchRunner(entries, savedCraftFilters, craftFilterWatches, relay.ready, notification => notifyWatch(notification, suppressLocal));

    const watchFor = (id: string): CraftWatchTriggers => craftFilterWatches()[id] ?? NO_WATCH;
    // All-false is stored as "no entry" so an unwatched filter never lingers in localStorage.
    const setWatchFor = (id: string, next: CraftWatchTriggers) => {
        const {[id]: _dropped, ...rest} = craftFilterWatches();
        setCraftFilterWatches(next.added || next.finished || next.removed ? {...rest, [id]: next} : rest);
    };

    const matched = createMemo(() => {
        const active = filter();
        return entries().filter(entry => evaluateFilter(active, entry.subject));
    });
    const completeCount = createMemo(() => matched().filter(entry => entry.complete).length);

    // The full universe of pickable values. `active` (see `FieldOption`'s doc comment) is what tells
    // apart potential options and live ones.
    const [optionSource, setOptionSource] = createSignal<{entries: CraftEntry[]; snapshot: CraftSnapshot}>({entries: [], snapshot: EMPTY_SNAPSHOT});
    const refreshOptions = leadingAndTrailing(throttle, setOptionSource, OPTIONS_REFRESH_MS);
    // Gated on `relay.ready` so the initial *empty* state of the relay doesn't burn the leading edge of the throttle.
    createEffect(() => {
        if (!relay.ready()) return;
        refreshOptions({entries: entries(), snapshot: relay.snapshot()});
    });

    const options = createMemo(() => {
        const {entries: rows, snapshot} = optionSource();
        const withActive = <T extends FilterValue>(list: FieldOption[], active: ReadonlySet<T>): FieldOption[] =>
            list.map(option => ({...option, active: active.has(option.value as T)}));

        const byField: Partial<Record<FilterField, FieldOption[]>> = {
            region: withActive(
                [...snapshot.regions.values()].map(r => ({value: r.id, label: regionDisplayName(r.name, r.id)})).sort(byLabel),
                activeValues(rows, e => e.regionId),
            ),
            claim: withActive(
                [...snapshot.claims.values()].map(c => ({value: c.entityId.toString(), label: claimDisplayName(c.name)})).sort(byLabel),
                activeValues(rows, e => e.subject.claim),
            ),
            // Item names repeat across tiers — ten separate outputs are all "Empty Bucket" — so
            // these options carry the tier badge and rarity border that tell them apart.
            item: withActive(staticOptions().item, activeValues(rows, e => e.subject.item)),
            itemTag: withActive(staticOptions().itemTag, activeValues(rows, e => e.subject.itemTag)),
            inputItem: withActive(staticOptions().inputItem, activeSetValues(rows, e => e.subject.inputItems.map(i => i.key))),
            inputItemTag: withActive(staticOptions().itemTag, activeSetValues(rows, e => e.subject.inputItems.map(i => i.tag))),
            skill: staticOptions().skill,
            tier: staticOptions().tier,
            buildingType: withActive(staticOptions().buildingType, activeValues(rows, e => e.subject.buildingType)),
            owner: withActive(
                [...snapshot.players.values()].map(p => ({value: p.entityId.toString(), label: p.name})).sort(byLabel),
                activeValues(rows, e => e.subject.owner),
            ),
            // `ownerAccess` asks "what access does the craft's owner have in the craft's own
            // claim", over a fixed, closed vocabulary — not something drawn from live relay data.
            ownerAccess: CLAIM_ACCESS_FLAGS.map(flag => ({value: flag, label: label(claimAccessFlagLabel(flag))})),
            // Same reasoning as `ownerAccess`: a fixed, closed allow-list, not something derived
            // from live crafts.
            currency: BOUNTY_CURRENCIES.map(id => ({value: id, label: currencyData(id) ? label(currencyData(id)!.label) : id})),
        };
        return byField;
    });

    // effortTotal / effortRemaining / payout are open-ended and public / complete are yes-or-no, so
    // all five fall through to an editor the builder picks itself rather than an option list.
    const optionsFor = (field: FilterField) => options()[field];

    // A name match against an existing saved filter switches the Save button into an explicit
    // Overwrite / Save Copy choice below — see `appendAsNew` and `overwriteExisting`.
    const existingByName = createMemo(() => {
        const name = saveName().trim();
        return name ? savedCraftFilters().find(existing => existing.name === name) : undefined;
    });

    // Used both for a brand-new name (the plain "Save" button) and for "Save Copy" on a name that
    // already exists: either way this mints a new id and appends, never touching another entry.
    const appendAsNew = () => {
        const name = saveName().trim();
        if (!name) return;
        const saved: SavedCraftFilter = {id: crypto.randomUUID(), name, filter: filter()};
        setSavedCraftFilters([...savedCraftFilters(), saved]);
        setSaveName("");
    };

    // Overwrites in place, keeping the existing entry's id. Dropping an id instead (e.g. delete +
    // recreate) would silently break anything already synced against it — a share link, another
    // device's copy — via the tombstone `filter-sync-merge.ts` pushes for the vanished id. Deleting
    // a filter must stay a separate, explicit action (the trash icon on the chip).
    const overwriteExisting = () => {
        const existing = existingByName();
        if (!existing) return;
        setSavedCraftFilters(savedCraftFilters().map(other => (other.id === existing.id ? {...existing, filter: filter()} : other)));
        setSaveName("");
    };

    // Appends every imported entry as a brand-new saved filter — like `appendAsNew`, never
    // `overwriteExisting`, even when an entry's name collides with an existing saved filter; a
    // duplicate-named entry is a smaller surprise than silently losing one.
    const handleImport = (entries: FilterExport[]) => {
        if (entries.length === 0) return;
        setSavedCraftFilters([
            ...savedCraftFilters(),
            ...entries.map((entry): SavedCraftFilter => ({id: crypto.randomUUID(), name: entry.name, filter: entry.filter})),
        ]);
    };

    return (
        <MainLayout
            title={_(msg`Craft Browser`)}
            ownHeading
            description="Live BitCraft crafts, with combinable filters on claim, skill, tier, effort and more."
            navTitle={breadcrumbCurrent(PAGE_HREF)}
        >
            <div class="w-full space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground"><Trans>Craft Browser</Trans></h1>
                    <div class="ml-auto flex flex-row gap-2">
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Collapsible open={panelOpen()} onOpenChange={setPanelOpen}>
                    <Card>
                        <CardHeader>
                            <CollapsibleTrigger class="block w-full text-left">
                                <div class="flex flex-row items-center justify-between gap-2 space-y-0">
                                    <CardTitle><Trans>Filters</Trans></CardTitle>
                                    <IconChevronDown class={cn("size-5 shrink-0 text-muted-foreground transition-transform", !panelOpen() && "-rotate-90")}/>
                                </div>
                            </CollapsibleTrigger>
                            <div class="flex flex-wrap items-center gap-2 pt-2">
                                <Button variant={openCraftsActive() ? "default" : "outline"} size="sm" class="h-8" onClick={() => setFilter(openWorkFilter())}>
                                    {quickActive() ? <Trans>Open Crafts</Trans> : <Trans>Reset</Trans>}
                                </Button>
                                <Show when={isLoggedIn() && bitcraftAccounts().length}>
                                    <Button variant={myCraftsActive() ? "default" : "outline"} size="sm" class="h-8" onClick={filterMyCrafts}>
                                        <Trans>My Crafts</Trans>
                                    </Button>
                                </Show>
                                <Show when={savedCraftFilters().length > 0}>
                                    <div class="flex flex-wrap gap-2">
                                        <For each={savedCraftFilters()}>
                                            {saved => (
                                                <SavedFilterChip
                                                    saved={saved}
                                                    watch={watchFor(saved.id)}
                                                    active={filtersEqual(filter(), saved.filter)}
                                                    onLoad={() => setFilter(saved.filter)}
                                                    onDelete={() => {
                                                        setSavedCraftFilters(savedCraftFilters().filter(other => other.id !== saved.id));
                                                        setWatchFor(saved.id, NO_WATCH);
                                                    }}
                                                    onWatchChange={next => setWatchFor(saved.id, next)}
                                                />
                                            )}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent class="space-y-4">
                                <QuickFilterGrid
                                    skills={quickFilterSkills()}
                                    tiers={quickFilterTiers()}
                                    selectedSkills={new Set(quickState()?.skills ?? [])}
                                    selectedTiers={new Set(quickState()?.tiers ?? [])}
                                    active={quickActive()}
                                    onToggleSkill={toggleQuickSkill}
                                    onToggleTier={toggleQuickTier}
                                />

                                <Collapsible open={advancedFiltersOpen()} onOpenChange={setAdvancedFiltersOpen} class="space-y-2">
                                    <Card class="bg-muted/30">
                                        <CollapsibleTrigger class="block w-full text-left">
                                            <CardHeader class="flex-row items-center justify-between gap-2 space-y-0">
                                                <CardTitle><Trans>Advanced Filters</Trans></CardTitle>
                                                <IconChevronDown class={cn("size-4 shrink-0 text-muted-foreground transition-transform", !advancedFiltersOpen() && "-rotate-90")}/>
                                            </CardHeader>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <CardContent class="p-0">
                                                <FilterBuilder node={filter()} options={optionsFor} onChange={setFilter}/>
                                            </CardContent>
                                        </CollapsibleContent>
                                    </Card>
                                </Collapsible>
                                <div class="flex flex-wrap items-end gap-2">
                                    <TextField
                                        class="w-56"
                                        value={saveName()}
                                        onChange={setSaveName}
                                    >
                                        <TextFieldInput
                                            class="h-9"
                                            placeholder={_(msg`Name this filter`)}
                                            onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (existingByName() ? overwriteExisting() : appendAsNew())}
                                        />
                                    </TextField>
                                    <Show
                                        when={existingByName()}
                                        fallback={
                                            <Button variant="outline" size="sm" class="h-9" disabled={!saveName().trim()} onClick={appendAsNew}>
                                                <IconSave class="mr-1 size-4"/><Trans>Save</Trans>
                                            </Button>
                                        }
                                    >
                                        <Button variant="outline" size="sm" class="h-9" onClick={overwriteExisting}>
                                            <IconSave class="mr-1 size-4"/><Trans>Overwrite</Trans>
                                        </Button>
                                        <Button variant="outline" size="sm" class="h-9" onClick={appendAsNew}>
                                            <IconCopy class="mr-1 size-4"/><Trans>Save Copy</Trans>
                                        </Button>
                                    </Show>
                                    <Button variant="outline" size="sm" class="ml-auto h-9" onClick={() => setSavedFiltersOpen(true)}>
                                        <IconSavedFilters class="mr-1 size-4"/><Trans>Saved Filters</Trans>
                                    </Button>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                <SavedFiltersDialog
                    open={savedFiltersOpen()}
                    onOpenChange={setSavedFiltersOpen}
                    savedFilters={savedCraftFilters()}
                    onImport={handleImport}
                    labelFor={(field, value) => optionsFor(field)?.find(option => option.value === value)?.label ?? String(value)}
                />

                <LiveTable
                    name={TABLE_NAME}
                    columns={COLUMNS}
                    data={matched()}
                    initialState={{
                        sorting: [{id: "bounty", desc: true}, {id: "remaining", desc: true}]
                    }}
                    toolbar={
                        <Button variant="outline" class="h-8" as={A} href={"/account/bounties"}>
                            <IconBountyOverview/> <Trans>Bounties</Trans>
                        </Button>
                    }
                    session={{sorting, setSorting, pagination, setPagination}}
                    getRowId={entry => entry.id}
                    empty={relay.ready() ? <Trans>No crafts match this filter.</Trans> : <Trans>Connecting to the relay…</Trans>}
                    paginationLabel={
                        <Trans>
                            {matched().length.toLocaleString(uiLocale())} of <Plural value={entries().length} one="# craft" other="# crafts"/>
                            {" "}<Plural value={matched().length} one="matches" other="match"/>
                            <Show when={completeCount() > 0}>
                                {" ("}<Trans>{completeCount().toLocaleString(uiLocale())} of them already complete and only waiting to be collected</Trans>{")"}
                            </Show>.
                        </Trans>
                    }
                />
            </div>
        </MainLayout>
    );
}
