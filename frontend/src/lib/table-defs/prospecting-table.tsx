import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {BiomeLink, LinkedList} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rowActions} from "~/lib/table-utils/column-builders";
import {fixFloat} from "~/lib/utils";

export const ProspectingDefs: BitCraftToDataDef<ProspectingDesc> = {
    columns: [
        headerColumn({
            route: pros => ["prospecting", pros.id],
            prefixElement: pros => (
                <FontIcon codepoint={pros.iconAssetPath}/>
            )
        }),
        descriptionColumn(),
        {
            id: "Biomes",
            accessorFn: (row) => {
                const idx = BitCraftTables.BiomeDesc.indexedBy("biomeType");
                return row.biomeRequirements?.map((id) => idx?.()?.get(id)?.name ?? `#${id}`) || [];
            },
            cell: (props) => {
                const row = props.row.original;
                if (!row.biomeRequirements?.length) return <></>;
                const idx = BitCraftTables.BiomeDesc.indexedBy("biomeType");
                return (
                    <LinkedList>
                        {row.biomeRequirements.map(biomeType => {
                            const biome = idx?.()?.get(biomeType);
                            return <BiomeLink biomeType={biomeType} name={biome?.name}/>;
                        })}
                    </LinkedList>
                );
            },
            filterFn: "arrIncludesSome",
            sortUndefined: "last"
        },
        {
            id: "Breadcrumb Count",
            accessorFn: (row) => {
                const arr = row.breadCrumbCount;
                if (!arr || arr.length === 0) return undefined;
                if (arr.length >= 2 && arr[0] !== arr[arr.length - 1])
                    return `${row.breadCrumbCount[0]} - ${row.breadCrumbCount[row.breadCrumbCount.length - 1]}`;
                return arr[0];
            },
        },
        {
            id: "Contribution",
            accessorKey: "contributionPerVisitedBreadCrumb",
            cell: (props) => <span>{fixFloat(props.row.original.contributionPerVisitedBreadCrumb)}</span>,
        },
        /*
        {
            id: "Experience Per Breadcrumb",
            accessorFn: (row) => {
                if (!row.experiencePerNode) return undefined;
                if (row.experiencePerNode.skillId <= 1) return undefined;
                return [row.experiencePerNode.skillId, row.experiencePerNode.quantity];
            },
            cell: (props) => {
                const expStack = props.getValue();
                if (!expStack) return <></>;
                const skillId = expStack[0];
                return (
                    <SkillLinkById skillId={skillId} level={String(fixFloat(expStack[1]))}/>
                );
            },
        },
        */
        rowActions(),
    ],
    searchColumns: ["Name", "Description"],
};
