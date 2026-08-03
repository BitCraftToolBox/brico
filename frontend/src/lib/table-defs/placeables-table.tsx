import {msg} from "@lingui/core/macro";
import {Column} from "@tanstack/solid-table";
import {For} from "solid-js";
import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import {PlaceableIcon} from "~/components/shared/GameIcon";
import {compareText} from "~/lib/i18n";
import {gameText} from "~/lib/labels";
import {groupsByPlaceable} from "~/lib/placeables";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    descriptionColumn,
    headerColumn,
    rarityColumn,
    rarityFilter,
    rowActions,
    tagColumn,
    tagFilter,
    tierColumn,
    tierFilter,
} from "~/lib/table-utils/column-builders";

// The group lookup is the shared accessor from ~/lib/placeables. It used to be a private
// `createMemo` cached in a module-level `let`, built lazily from inside whichever row's accessorFn
// ran first — which meant Solid owned it from that component and disposed it on unmount, freezing
// the map. See the doc comment on `derivedTableLookup` in ~/lib/spacetime.
const groupIdsFor = (placeableId: number): number[] =>
    groupsByPlaceable().get(placeableId)?.map(g => g.id) ?? [];

export const PlaceableDefs: BitCraftToDataDef<PlaceableDesc> = {
    columns: [
        headerColumn<PlaceableDesc, any>({
            route: buff => ["placeable", buff.id],
            prefixElement: plc => {
                const asset = plc.iconAssetName;
                if (!asset) return <></>;
                return <PlaceableIcon placeable={plc}/>;
            }
        }),
        descriptionColumn(),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        {
            // Group *ids*, not names. The name is translated game text, so identifying a group by
            // it meant two groups whose names collapse in some locale became indistinguishable —
            // the wrong `placementLimit` would show — and it put translated text in the filter's
            // query param. Ids are canonical and locale-stable; the cell resolves names for display.
            id: 'Group',
            meta: {label: msg`Group`},
            accessorFn: (row: PlaceableDesc) => groupIdsFor(row.id),
            getUniqueValues: (row: PlaceableDesc) => groupIdsFor(row.id),
            cell: (props: any) => {
                const ids = props.getValue() as number[];
                if (!ids?.length) return <></>;
                const groupIndex = BitCraftTables.PlaceableGroupDesc.indexedBy("id");
                return (
                    <div class="flex flex-col gap-0.5">
                        <For each={ids}>
                            {(id) => {
                                const g = groupIndex().get(id);
                                return (
                                    <span class="text-xs">
                                        {g?.name ?? `#${id}`}
                                        {g ? <span class="text-muted-foreground ml-1">(limit: {g.placementLimit})</span> : null}
                                    </span>
                                );
                            }}
                        </For>
                    </div>
                );
            },
            filterFn: 'arrIncludesSome',
        },
        {
            id: 'Max Health',
            meta: {label: gameText(msg`Max Health`)},
            accessorKey: "maxHealth",
        },
        boolColumn("Visible to Others", {accessorKey: "visibleToOthers"}, msg`Visible to Others`),
        rowActions(),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        {
            // Bespoke rather than `uniqueValuesFilter("Group")`: the column's values are group ids,
            // so the label has to be resolved through the group table (translated) while the value
            // stays the id.
            column: "Group",
            title: msg`Group`,
            type: "value",
            options: (col: Column<PlaceableDesc> | undefined) => {
                if (!col) return [];
                const groupIndex = BitCraftTables.PlaceableGroupDesc.indexedBy("id")();
                return col.getFacetedUniqueValues().keys()
                    .map((id: any) => ({label: groupIndex.get(id)?.name ?? `#${id}`, value: id}))
                    .toArray()
                    .sort((a, b) => compareText(a.label, b.label));
            },
        },
    ],
    searchColumns: ["Name", "Description"],
};
