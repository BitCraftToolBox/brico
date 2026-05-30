/**
 * Reusable Table Column & Filter Builders
 *
 * Provides factory functions for common column/filter patterns
 * shared across multiple table definitions.
 */

import {A} from "@solidjs/router";
import {CellContext, Column, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineClipboardCopy as IconClipboardCopy, TbOutlineExternalLink as IconExternal, TbOutlineLink as IconLink} from "solid-icons/tb";
import {JSX, Show} from "solid-js";
import {Rarity} from "~/bindings/src/rarity_type";
import {FilterSetupProps} from "~/components/data-table/data-table";
import {RangedBasedOption, ValueBasedOption} from "~/components/data-table/table-faceted-filter";
import {TableRowActions} from "~/components/data-table/table-row-actions";
import {TierIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {Rarities, Tiers} from "~/lib/bitcraft-utils";
import {KnowledgeLinkById, LinkedList} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {AccessorKey, AccessorProp, resolveAccessor} from "~/lib/table-utils/base";
import {cn, compareBasic, includedIn} from "~/lib/utils";

// ─── Common Column Builders ─────────────────────────────────────

interface HeaderColumnParams<T, V extends JSX.Element> {
    title?: string;
    accessor?: AccessorProp<T, V>;
    route: (row: T) => [string, string | number];
    prefixElement?: (row: T) => JSX.Element;
    customRender?: (row: V) => JSX.Element;
}

export function headerColumn<T, V extends JSX.Element>({
   title = "Name",
   accessor = {accessorKey: "name" as AccessorKey<T>},
   route,
   prefixElement = () => <></>,
   customRender = (row: V) => row,
}: HeaderColumnParams<T, V>): ColumnDef<T, V> {
    return {
        id: title,
        ...accessor,
        cell: (props) => {
            const r = route(props.row.original);
            return (
                <Button variant="ghost" class="w-full h-full justify-start" as={A}
                        href={`/database/${r[0]}/${r[1]}`}>
                    {prefixElement(props.row.original)} {customRender(props.getValue())}
                </Button>
            );
        },
        enableHiding: false
    }
}

export function boolColumn<T, V extends boolean | undefined>(
    title: string,
    accessor: AccessorProp<T, V>
) {
    return {
        id: title,
        ...accessor,
        cell: (props: CellContext<T, boolean | undefined>): JSX.Element => {
            const v = props.getValue();
            if (typeof v === "undefined") return <></>;
            return v ? "Yes" : "No";
        },
        filterFn: includedIn<T>(),
    }
}

export function knowledgeColumn<T, V extends number[] | undefined>(
    title?: string,
    accessor: AccessorProp<T, V> = { accessorKey: "requiredKnowledges" as AccessorKey<T> }
): ColumnDef<T, string[]> {
    const getNames = (row: T): string[] => {
        const ids = resolveAccessor(accessor, row);
        if (!ids?.length) return [];
        const idx = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")();
        return ids.map(id => idx?.get(id)?.name ?? `#${id}`);
    };
    return {
        id: title ?? "Required Knowledge",
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

export function descriptionColumn<T>(
    title: string = "Description",
    accessor: AccessorProp<T, string> = {accessorKey: "description" as AccessorKey<T>},
) {
    return {
        id: title,
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
    accessor: AccessorProp<T, string | undefined> = {accessorKey: title.toLowerCase() as AccessorKey<T>}
): ColumnDef<T> {
    return {
        id: title,
        ...accessor,
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
        ...accessor,
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
        cell: (props: CellContext<T, V>) => {
            const rowId = props.getValue();
            const chatLinkId = chatLinkIdAccessor ? resolveAccessor(chatLinkIdAccessor, props.row.original) : rowId;
            return (
                <TableRowActions row={props.row}>
                    <DropdownMenuItem>
                        <Button class="w-full" variant="ghost"
                                onclick={() => navigator.clipboard.writeText(String(rowId))}
                        >
                            Copy ID <IconClipboardCopy/>
                        </Button>
                    </DropdownMenuItem>
                    <Show when={chatLinkPrefix && chatLinkId}>
                        <DropdownMenuItem>
                            <Button class="w-full" variant="ghost"
                                    onclick={() => navigator.clipboard.writeText(`(${chatLinkPrefix}=${chatLinkId})`)}
                            >
                                Copy Chat Link <IconLink/>
                            </Button>
                        </DropdownMenuItem>
                    </Show>
                    <Show when={mapUrlPrefix}>
                        <DropdownMenuItem>
                            <Button class="w-full" variant="ghost" as={A}
                                    href={`https://bitcraftmap.com/?${mapUrlPrefix}=${rowId}`}
                                    target={"_blank"}
                            >
                                View Map <IconExternal/>
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
        title: "Tag",
        type: "value",
        options: (col: Column<T> | undefined) => {
            if (!col) return [];
            return col.getFacetedUniqueValues().keys().map((v) => ({
                label: v, value: v,
            })).toArray().sort((a, b) => a.label.localeCompare(b.label));
        },
    };
}

/**
 * Creates a Rarity faceted filter with predefined options
 */
export function rarityFilter<T>(): FilterSetupProps<T, ValueBasedOption<Rarity["tag"]>[]> {
    return {
        column: "Rarity",
        title: "Rarity",
        type: "value",
        options: Rarities.rarities.map(r => ({label: r, value: r})),
    };
}

/**
 * Creates a Tier faceted filter with icons
 */
export function tierFilter<T>(): FilterSetupProps<T, ValueBasedOption<number>[]> {
    return {
        column: "Tier",
        title: "Tier",
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
export function rangeFilter<T>(column: string, title?: string): FilterSetupProps<T, RangedBasedOption> {
    return {
        column,
        title: title ?? column,
        type: "range",
        options: (col: Column<T> | undefined) => {
            const minMax = col ? col.getFacetedMinMaxValues() : null;
            return {label: title ?? column, minMax: minMax || [0, 0]};
        },
    };
}

/**
 * Creates a faceted filter from unique column values
 */
type OptionType = { label: string, value: any };

export function uniqueValuesFilter<T>(
    column: string,
    title?: string,
    sortFn?: (a: OptionType, b: OptionType) => number,
    iconFn?: (props: any) => JSX.Element,
): FilterSetupProps<T, ValueBasedOption[]> {
    return {
        column,
        title: title ?? column,
        type: "value",
        options: (col: Column<T> | undefined) => {
            if (!col) return [];
            const opts = col.getFacetedUniqueValues().keys().map((v: any) => {
                if (v === null || v === "" || typeof v === "undefined") return {label: "<empty>", value: undefined};
                return {label: String(v), value: v, icon: iconFn};
            }).toArray();
            if (!sortFn) return opts;
            return opts.sort(sortFn);
        },
    };
}

export function boolFilter<T>(
    column: string,
    title?: string,
    trueLabel = "Yes",
    falseLabel = "No",
): FilterSetupProps<T, ValueBasedOption<boolean>[]> {
    return {
        column,
        title: title ?? column,
        type: "bool",
        options: [{label: trueLabel, value: true}, {label: falseLabel, value: false}],
    }
}