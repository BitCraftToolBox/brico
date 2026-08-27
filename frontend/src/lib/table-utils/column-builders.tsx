/**
 * Reusable Table Column & Filter Builders
 *
 * Provides factory functions for common column/filter patterns
 * shared across multiple table definitions.
 */

import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {CellContext, Column, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineClipboardCopy as IconClipboardCopy, TbOutlineExternalLink as IconExternal, TbOutlineLink as IconLink} from "solid-icons/tb";
import {For, JSX, Show} from "solid-js";
import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {FilterSetupProps} from "~/components/data-table/data-table";
import {RangedBasedOption, ValueBasedOption} from "~/components/data-table/table-faceted-filter";
import {TableRowActions} from "~/components/data-table/table-row-actions";
import {TierIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {Rarities, Tiers} from "~/lib/bitcraft-utils";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {BuffLink, KnowledgeLinkById, LinkedList} from "~/lib/game-links";
import {rarityLabel} from "~/lib/game-strings";
import {compareText, i18n, trackUILocale} from "~/lib/i18n";
import {gameText, Label} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {AccessorKey, AccessorProp, resolveAccessor} from "~/lib/table-utils/base";
import {consolidateStats, statsColumn} from "~/lib/table-utils/stats-column-builder";
import {cn, compareBasic, includedIn, readableSeconds} from "~/lib/utils";

/**
 * Game-text columns keep the **English** value and translate only for display.
 *
 * A column's value is its identity everywhere it matters outside the screen: it is the filter
 * state, the faceted-value key, and — via `saveFilters()` in table-toolbar.tsx — a query parameter
 * in a link the user shares or bookmarks. Storing translated text there meant a filter URL created
 * under one data locale silently failed to apply under another: no error, the filter just didn't
 * stick. Column *ids* are already load-bearing English (they key `settings.tableHiddenColumns` and
 * name the query params), so the values matching them is also the more consistent design.
 *
 * So: `accessorFn` reads through `sourceRow()`, and the cell plus the filter-option label run the
 * value back through `translateGameText()`. Round-tripping like that works because the game
 * catalogs are keyed by the English source — going forward is exact, going backward would not be.
 */

/**
 * Resolves an accessor against the row's untranslated form, for columns whose value must stay
 * canonical English.
 *
 * Note this un-translates the row being accessed, not rows an `accessorFn` looks up in *other*
 * tables — an accessor that reaches through an index has to wrap that lookup in `sourceRow()`
 * itself. Grep the table-defs for `indexedBy(...)().get(...)?.name` when adding one.
 */
function sourceValue<T, V>(accessor: AccessorProp<T, V>, row: T): V | undefined {
    return resolveAccessor(accessor, sourceRow(row));
}

/**
 * Resolves a `msg` descriptor outside a component, for filter options — which are built by plain
 * factory functions but evaluated inside a memo in `TableFacetedFilter`. `trackUILocale()` is what
 * makes that memo re-run on a locale change; see the note on `uiLocale` in ~/lib/i18n.
 */
function uiText(descriptor: MessageDescriptor): string {
    trackUILocale();
    return i18n._(descriptor);
}

// ─── Common Column Builders ─────────────────────────────────────

/**
 * Where a table's name column links. `[slug, id]` builds `/database/{slug}/{id}`; the optional
 * third element appends `?detail={tab}` to open a specific relationship tab on arrival.
 *
 * The slug does *not* have to be the table's own route. Several tables deliberately point at a
 * different entity's detail page — the tool/food/weapon/equipment tables all resolve to
 * `/database/item/{itemId}`, because the item page renders a superset of what a dedicated page
 * would (see the note in sitemap.xml.ts), and item lists resolve to whichever item or creature owns
 * them. Sending the row-click to the page that actually holds the content beats maintaining a
 * thinner near-duplicate of it.
 */
export type DetailRoute = readonly [slug: string, id: string | number, tab?: string];

/** Builds the URL for a `DetailRoute`. */
export function detailHref(route: DetailRoute): string {
    const [slug, id, tab] = route;
    return `/database/${slug}/${id}${tab ? `?detail=${tab}` : ""}`;
}

interface HeaderColumnParams<T, V extends JSX.Element> {
    title?: string;
    label?: Label | string;
    accessor?: AccessorProp<T, V>;
    route: (row: T) => DetailRoute;
    prefixElement?: (row: T) => JSX.Element;
    customRender?: (row: V) => JSX.Element;
}

export function headerColumn<T, V extends JSX.Element>({
   title = "Name",
   label = title === "Name" ? gameText(msg`Name`) : title,
   accessor = {accessorKey: "name" as AccessorKey<T>},
   route,
   prefixElement = () => <></>,
   customRender = (row: V) => row,
}: HeaderColumnParams<T, V>): ColumnDef<T, V> {
    return {
        id: title,
        meta: {label},
        ...accessor,
        cell: (props) => (
            <Button
                variant="ghost" class="w-full h-full justify-start" as={A}
                href={detailHref(route(props.row.original))}
            >
                {/* Re-resolved from the row, not `props.getValue()`: tanstack caches the accessor
                        result on the row object for as long as `data` keeps its identity, which is
                        forever for tables like FoodDesc/ToolDesc whose own rows never change on a
                        data-locale switch — only the cross-table lookup (ItemDesc) they read through
                        does. Reading it fresh here keeps this JSX child subscribed to that lookup. */}
                {prefixElement(props.row.original)} {customRender(resolveAccessor(accessor, props.row.original) as V)}
            </Button>
        ),
        enableHiding: false
    }
}

export function boolColumn<T, V extends boolean | undefined>(
    title: string,
    accessor: AccessorProp<T, V>,
    label: Label | string = title,
) {
    return {
        id: title,
        meta: {label},
        ...accessor,
        cell: (props: CellContext<T, boolean | undefined>): JSX.Element => {
            const v = props.getValue();
            if (typeof v === "undefined") return <></>;
            // Wrapped in a JSX child so the translated text stays reactive — a bare returned
            // string is inserted once and never revisited on a data-locale change.
            return <>{v ? translateGameText("Yes") : translateGameText("No")}</>;
        },
        filterFn: includedIn<T>(),
    }
}

export function knowledgeColumn<T, V extends number[] | undefined>(
    title?: string,
    accessor: AccessorProp<T, V> = { accessorKey: "requiredKnowledges" as AccessorKey<T> },
    label: Label | string = title ?? msg`Required Knowledge`,
): ColumnDef<T, string[]> {
    // English names — this column is filterable, so its values end up in shareable URLs.
    // The cell renders KnowledgeLinkById, which resolves the translated name for display.
    const getNames = (row: T): string[] => {
        const ids = resolveAccessor(accessor, row);
        if (!ids?.length) return [];
        const idx = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")();
        return ids.map(id => sourceRow(idx.get(id))?.name ?? `#${id}`);
    };
    return {
        id: title ?? "Required Knowledge",
        meta: {label},
        accessorFn: getNames,
        getUniqueValues: getNames,
        cell: (props) => {
            const ids = () => resolveAccessor(accessor, props.row.original) ?? [];
            return (
                <Show when={ids().length}>
                    <LinkedList>
                        {ids().map(id => <KnowledgeLinkById id={id}/>)}
                    </LinkedList>
                </Show>
            );
        },
        filterFn: "arrIncludesSome",
        sortUndefined: "last",
    };
}

/**
 * A `BuffEffect[]` field rendered as a row of linked buff pills, each with its effective duration
 * (the effect's own override, else the buff's default). Shared by every table that grants buffs —
 * food, custom abilities — so the cell markup and the sort/filter semantics stay identical.
 *
 * Pair with `uniqueValuesFilter(title, label, compareOptions)` for the matching faceted filter.
 */
export function buffsColumn<T>(
    accessor: AccessorProp<T, BuffEffect[] | undefined>,
    title: string = "Buffs",
    label: Label | string = msg`Buffs`,
): ColumnDef<T, string[] | undefined> {
    // English buff descriptions: this backs a faceted filter, so the values end up in shared URLs.
    // The cell renders BuffLink, which localizes for display. See the note at the top of this file.
    const names = (row: T, def: string[] | undefined) => {
        const buffs = resolveAccessor(accessor, row);
        if (!buffs?.length) return def;
        const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
        return buffs.map(b => sourceRow(buffIdx.get(b.buffId))?.description ?? `Buff #${b.buffId}`);
    };
    return {
        id: title,
        meta: {label},
        accessorFn: row => names(row, undefined),
        getUniqueValues: row => names(row, []) as string[],
        cell: (props) => {
            const buffs = resolveAccessor(accessor, props.row.original);
            if (!buffs?.length) return undefined;
            // `each` is computed inline (rather than from a local `const` above) so the
            // `indexedBy("id")()` read happens inside For's own tracked scope and the list
            // re-resolves on a data-locale switch instead of freezing at first render.
            return (
                <div class="flex flex-wrap gap-1">
                    <For each={buffs.map(b => [b, BitCraftTables.BuffDesc.indexedBy("id")().get(b.buffId)] as [BuffEffect, BuffDesc | undefined]).filter((b): b is [BuffEffect, BuffDesc] => !!b[1])}>
                        {buff => <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">
                            <BuffLink buffId={buff[0].buffId} label={buff[1].description} class="font-medium" showIcon={false}/>
                            <span class="opacity-70">{readableSeconds(buff[0].duration ?? buff[1].duration)}</span>
                        </span>}
                    </For>
                </div>
            );
        },
        sortingFn: (a, b) => {
            const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
            const maxDuration = (row: T) => Math.max(
                ...(resolveAccessor(accessor, row) ?? []).map(be => be.duration ?? buffIdx.get(be.buffId)?.duration ?? 0)
            );
            return maxDuration(a.original) - maxDuration(b.original);
        },
        sortUndefined: "last",
        filterFn: "arrIncludesSome",
    };
}

/**
 * The consolidated stat totals of a `BuffEffect[]` field — the same `statsColumn` a buff's own
 * `stats` gets, summed across every buff the row grants. Pair with `statsFilter(title, label)`.
 */
export function buffStatsColumn<T>(
    accessor: AccessorProp<T, BuffEffect[] | undefined>,
    title: string = "Buff Stats",
    label: Label | string = msg`Buff Stats`,
): ColumnDef<T, CsvStatEntry[]> {
    return statsColumn<T>(title, {
        accessorFn: row => {
            const buffs = resolveAccessor(accessor, row);
            if (!buffs?.length) return undefined;
            const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
            return consolidateStats(buffs.flatMap(be => buffIdx.get(be.buffId)?.stats ?? []));
        }
    }, label);
}

export function descriptionColumn<T>(
    title: string = "Description",
    accessor: AccessorProp<T, string> = {accessorKey: "description" as AccessorKey<T>},
    label: Label | string = title === "Description" ? gameText(msg`Description`) : title,
) {
    return {
        id: title,
        meta: {label},
        ...accessor,
        cell: (props: CellContext<T, string | undefined>): JSX.Element => {
            const v = props.getValue();
            if (typeof v === "undefined") return <></>;
            return <span class="text-xs text-muted-foreground line-clamp-2">{v}</span>;
        },
    }
}

export function tagColumn<T>(
    title: string = "Tag",
    accessor: AccessorProp<T, string> = {accessorKey: title.toLowerCase() as AccessorKey<T>},
    label: Label | string = title === "Tag" ? gameText(msg`Tags`) : title,
): ColumnDef<T, string | undefined> {
    return {
        id: title,
        meta: {label},
        // English value, translated cell — see the note at the top of this file.
        accessorFn: row => sourceValue(accessor, row),
        cell: (props: CellContext<T, string | undefined>): JSX.Element => translateGameText(props.getValue() ?? ""),
        filterFn: includedIn<T>(),
    };
}

/**
 * Creates a "Rarity" column with custom sort
 */
export function rarityColumn<T, V extends Rarity["tag"]>(
    accessor: AccessorProp<T, V> = {accessorKey: "rarity.tag" as AccessorKey<T, V>},
): ColumnDef<T, V> {
    return {
        id: "Rarity",
        meta: {label: gameText(msg`Rarity`)},
        ...accessor,
        // The value stays the `Rarity` tag: it drives the frame/border colors, the rarity sort
        // order below, and the query param. Only the displayed text is localized. Wrapped in a
        // JSX child (rather than returned bare) so that translation stays reactive.
        cell: (props: CellContext<T, V>): JSX.Element => <>{rarityLabel(props.getValue())}</>,
        filterFn: includedIn<T>(),
        sortingFn: (rowA, rowB, columnId) => {
            const rA = rowA.getValue<V>(columnId);
            const rB = rowB.getValue<V>(columnId);
            if (rA === rB) return 0;
            const a = Rarities.toValue(rA);
            const b = Rarities.toValue(rB);
            return compareBasic(a, b);
        },
    };
}

/**
 * Creates a "Tier" column with includedIn filter
 */
export function tierColumn<T>(
    accessor: AccessorProp<T, number> = {accessorKey: "tier" as AccessorKey<T, number>},
): ColumnDef<T, number> {
    return {
        id: "Tier",
        meta: {label: gameText(msg`Tier`)},
        ...accessor,
        filterFn: includedIn<T>(),
    };
}

/**
 * Creates row actions
 */
export function rowActions<T, V extends string | number>(
    accessor: AccessorProp<T, V> = {accessorKey: "id" as AccessorKey<T, V>},
    chatLinkPrefix?: string,
    mapUrlPrefix?: string,
    chatLinkIdAccessor?: AccessorProp<T, V | undefined>,
): ColumnDef<T, V> {
    return {
        id: "actions",
        ...accessor,
        header: () => <></>,
        enableHiding: false,
        enableSorting: false,
        cell: (props: CellContext<T, V>) => {
            const rowId = props.getValue();
            const chatLinkId = chatLinkIdAccessor ? resolveAccessor(chatLinkIdAccessor, props.row.original) : rowId;
            return (
                <TableRowActions row={props.row}>
                    <DropdownMenuItem>
                        <Button
                            class="w-full" variant="ghost"
                            onclick={() => navigator.clipboard.writeText(String(rowId))}
                        >
                            <Trans>Copy ID</Trans> <IconClipboardCopy/>
                        </Button>
                    </DropdownMenuItem>
                    <Show when={chatLinkPrefix && chatLinkId}>
                        <DropdownMenuItem>
                            <Button
                                class="w-full" variant="ghost"
                                onclick={() => navigator.clipboard.writeText(`(${chatLinkPrefix}=${chatLinkId})`)}
                            >
                                <Trans>Copy Chat Link</Trans> <IconLink/>
                            </Button>
                        </DropdownMenuItem>
                    </Show>
                    <Show when={mapUrlPrefix}>
                        <DropdownMenuItem>
                            <Button
                                class="w-full" variant="ghost" as={A} target={"_blank"}
                                href={`https://bitcraftmap.com/?${mapUrlPrefix}=${rowId}`}
                            >
                                <Trans>View Map</Trans> <IconExternal/>
                            </Button>
                        </DropdownMenuItem>
                    </Show>
                </TableRowActions>
            );
        },
    };
}

// ─── Common Filter Builders ─────────────────────────────────────

/**
 * Creates a Tag faceted filter that reads unique values from the column
 */
export function tagFilter<T>(): FilterSetupProps<T, ValueBasedOption<string>[]> {
    return {
        column: "Tag",
        title: gameText(msg`Tags`),
        type: "value",
        // `value` is the English tag (stable in URLs and filter state), `label` its translation.
        // Sorted by the translated label so the list reads alphabetically in the user's language.
        options: (col: Column<T> | undefined) => {
            if (!col) return [];
            return col.getFacetedUniqueValues().keys().map((v) => ({
                label: translateGameText(v), value: v,
            })).toArray().sort((a, b) => compareText(a.label, b.label));
        },
    };
}

/**
 * Creates a Rarity faceted filter with predefined options
 */
export function rarityFilter<T>(): FilterSetupProps<T, ValueBasedOption<Rarity["tag"]>[]> {
    return {
        column: "Rarity",
        title: gameText(msg`Rarity`),
        type: "value",
        // A function, not a baked array: the labels are translated, so they have to be resolved
        // inside TableFacetedFilter's memo rather than frozen at module-eval time. Order stays
        // Rarities.rarities (Common → Mythic), which is meaningful and not alphabetical.
        options: () => Rarities.rarities.map(r => ({label: rarityLabel(r), value: r})),
    };
}

/**
 * Creates a Tier faceted filter with icons
 */
export function tierFilter<T>(): FilterSetupProps<T, ValueBasedOption<number>[]> {
    return {
        column: "Tier",
        title: gameText(msg`Tier`),
        type: "value",
        options: Tiers.tiers.map(t => ({
            label: String(t.value),
            value: t.value,
            icon: (props: any) => <TierIcon tier={t.value} class={cn("mr-1", props.class)}/>
        })),
    };
}

/**
 * Creates a numeric range filter
 */
export function rangeFilter<T>(column: string, title?: Label | string): FilterSetupProps<T, RangedBasedOption> {
    return {
        column,
        title: title ?? column,
        type: "range",
        options: (col: Column<T> | undefined) => {
            const minMax = col ? col.getFacetedMinMaxValues() : null;
            return {label: typeof title === "string" ? title : column, minMax: minMax || [0, 0]};
        },
    };
}

/**
 * Creates a faceted filter from unique column values
 */
type OptionType = { label: string, value: any };

export function uniqueValuesFilter<T>(
    column: string,
    title?: Label | string,
    sortFn?: (a: OptionType, b: OptionType) => number,
    iconFn?: (props: any) => JSX.Element,
    labelFn?: (label: string) => string,
): FilterSetupProps<T, ValueBasedOption[]> {
    return {
        column,
        title: title ?? column,
        type: "value",
        options: (col: Column<T> | undefined) => {
            if (!col) return [];
            const opts = col.getFacetedUniqueValues().keys().map((v: any) => {
                if (v === null || v === "" || typeof v === "undefined") return {label: uiText(msg`<empty>`), value: undefined};
                // `translateGameText` on the stringified value: a hit localizes a game-text column
                // (Type, Skill, Traveler, …), a miss leaves numbers and app values untouched.
                return {label: labelFn ? labelFn(String(v)) : translateGameText(String(v)), value: v, icon: iconFn};
            }).toArray();
            // No default sort — facet order follows row order, which several numeric columns rely
            // on. Pass `compareOptions` to sort (numerically by value, else by translated label).
            if (!sortFn) return opts;
            return opts.sort(sortFn);
        },
    };
}

export function boolFilter<T>(
    column: string,
    title?: Label | string,
    trueLabel?: MessageDescriptor,
    falseLabel?: MessageDescriptor,
): FilterSetupProps<T, ValueBasedOption<boolean>[]> {
    return {
        column,
        title: title ?? column,
        type: "bool",
        // Descriptors rather than strings, resolved lazily: a default of `"Yes"` computed here
        // would be frozen at module-eval time, since filter arrays are built at table-def scope.
        options: () => [
            {label: trueLabel ? uiText(msg`Yes`) : translateGameText("Yes"), value: true},
            {label: falseLabel ? uiText(msg`No`) : translateGameText("No"), value: false},
        ],
    }
}