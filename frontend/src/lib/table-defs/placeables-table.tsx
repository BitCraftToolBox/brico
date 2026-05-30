import {createMemo, For} from "solid-js";
import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import {PlaceableIcon} from "~/components/shared/GameIcon";
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
    uniqueValuesFilter,
} from "~/lib/table-utils/column-builders";

// ─── Group Lookup (for table column) ────────────────────────────

function useGroupMap() {
    return createMemo(() => {
        const groups = BitCraftTables.PlaceableGroupDesc.get() ?? [];
        const map = new Map<number, string[]>();
        for (const g of groups) {
            for (const pid of g.placeableIds) {
                const arr = map.get(pid);
                if (arr) arr.push(g.name);
                else map.set(pid, [g.name]);
            }
        }
        return map;
    });
}

let _groupMap: ReturnType<typeof useGroupMap> | undefined;
function getGroupMap() {
    if (!_groupMap) _groupMap = useGroupMap();
    return _groupMap;
}

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
            id: 'Group',
            accessorFn: (row: PlaceableDesc) => {
                return getGroupMap()()?.get(row.id) ?? [];
            },
            getUniqueValues: (row: PlaceableDesc) => {
                return getGroupMap()()?.get(row.id) ?? [];
            },
            cell: (props: any) => {
                const groups = props.getValue() as string[];
                if (!groups?.length) return <></>;
                const allGroups = BitCraftTables.PlaceableGroupDesc.get() ?? [];
                return (
                    <div class="flex flex-col gap-0.5">
                        <For each={groups}>
                            {(name) => {
                                const g = allGroups.find(gr => gr.name === name);
                                return (
                                    <span class="text-xs">
                                        {name}
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
            accessorKey: "maxHealth",
        },
        boolColumn("Visible to Others", {accessorKey: "visibleToOthers"}),
        rowActions(),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        uniqueValuesFilter("Group")
    ],
    searchColumns: ["Name", "Description"],
};
