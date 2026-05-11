import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {AchievementLink, LinkedList} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rangeFilter, rowActions} from "~/lib/table-utils/column-builders";

export const AchievementDefs: BitCraftToDataDef<AchievementDesc> = {
    columns: [
        headerColumn({
            route: ach => ["achievement", ach.id],
        }),
        descriptionColumn(),
        {
            id: "Prerequisites",
            accessorFn: (row) => {
                const idx = BitCraftTables.AchievementDesc.indexedBy("id");
                return row.requisites?.map(id => idx?.()?.get(id)?.name ?? `#${id}`).join(", ") || "";
            },
            cell: (props) => {
                const row = props.row.original;
                if (!row.requisites?.length) return <></>;
                const idx = BitCraftTables.AchievementDesc.indexedBy("id");
                return (
                    <LinkedList>
                        {row.requisites.map(id => {
                            const ach = idx?.()?.get(id);
                            return <AchievementLink id={id} name={ach?.name}/>;
                        })}
                    </LinkedList>
                );
            },
        },
        {id: "Points", accessorKey: "pointsReward", filterFn: "inNumberRange"},
        rowActions(),
    ],
    facetedFilters: [
        rangeFilter("Points")
    ],
    searchColumns: ["Name", "Description", "Prerequisites"],
};
