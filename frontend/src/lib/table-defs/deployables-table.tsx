import {Show} from "solid-js";
import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {MovementType} from "~/bindings/src/movement_type_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {SurfaceType} from "~/bindings/src/surface_type_type";
import {TableColumnHeader} from "~/components/data-table/table-column-header";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {ItemLink} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolFilter, headerColumn, knowledgeColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, includedIn} from "~/lib/utils";


function requiredItemsForDeployable(dep: DeployableDesc): {
    deed: ItemDesc | undefined;
    training: SecondaryKnowledgeDesc[];
} {
    const collTable = BitCraftTables.CollectibleDesc.indexedBy("id")!()!;
    const collId = dep.deployFromCollectibleId;
    if (!collId) return {deed: undefined, training: []};
    const collectible = collTable.get(collId);
    if (!collectible) return {deed: undefined, training: []};

    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")!()!;
    const deedItem = collectible.itemDeedId ? itemIndex.get(collectible.itemDeedId) : undefined;

    const knowledgeIds = collectible.requiredKnowledgesToUse ?? [];
    let knowledgeDescs: SecondaryKnowledgeDesc[] = [];
    if (knowledgeIds.length) {
        const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")!()!;
        knowledgeDescs = knowledgeIds
            .map(k => knowledgeIndex.get(k))
            .filter((k): k is SecondaryKnowledgeDesc => !!k);
    }
    return {deed: deedItem, training: knowledgeDescs};
}

function getStepHeight(deployable: DeployableDesc): number | null {
    const pathfinding = BitCraftTables.PathfindingDesc.indexedBy("id")!()!;
    if (deployable.movementType.tag === MovementType.Water.tag) {
        return pathfinding.get(deployable.pathfindingId)?.maxSwimHeightDelta || null;
    }

    if (deployable.movementType.tag === MovementType.Ground.tag) {
        const pf = pathfinding.get(deployable.pathfindingId);
        if (!pf) return null;
        return Math.max(
            // theoretically should be the same
            ...pf.climbDownOptions.map(o => o.maxElevationDifference),
            ...pf.climbUpOptions.map(o => o.maxElevationDifference)
        );
    }

    return null;
}


export const DeployableDescDefs: BitCraftToDataDef<DeployableDesc> = {
    columns: [
        headerColumn({
            route: dep => ["deployable", dep.id],
            prefixElement: dep => {
                const collTable = BitCraftTables.CollectibleDesc.indexedBy("id");
                const collectible = collTable?.()?.get(dep.deployFromCollectibleId);
                // this should be noInteract because it links to the collectible rather than the deployable itself
                return collectible?.iconAssetName ? <CollectibleIcon collectible={collectible} small noInteract/> : <></>;
            },

        }),
        {
            id: "Type",
            accessorKey: "deployableType.tag",
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Item Slots",
            accessorKey: "storage",
            filterFn: "inNumberRange",
        },
        {
            id: "Item Stack Size",
            accessorFn: (dep: DeployableDesc) => dep.itemSlotSize / 6000,
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Total Item Size",
            header: (props) => {
                return (
                    <TableColumnHeader column={props.column} title={props.column.id}>
                        <Tooltip>
                            <TooltipTrigger>
                                Total Item Size
                            </TooltipTrigger>
                            <TooltipContent>
                                Equivalent "player inventory" slots.
                            </TooltipContent>
                        </Tooltip>
                    </TableColumnHeader>
                );
            },
            accessorFn: (dep: DeployableDesc) => dep.storage * dep.itemSlotSize / 6000,
            filterFn: "inNumberRange",
        },
        {
            id: "Cargo Slots",
            accessorKey: "stockpile",
            filterFn: "inNumberRange",
        },
        {
            id: "Cargo Stack Size",
            accessorFn: (dep: DeployableDesc) => dep.cargoSlotSize / 6000,
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Total Cargo Size",
            accessorFn: (dep: DeployableDesc) => dep.stockpile * dep.cargoSlotSize / 6000,
            filterFn: "inNumberRange",
        },
        {
            id: "Deed",
            accessorFn: (dep: DeployableDesc) => requiredItemsForDeployable(dep).deed?.name ?? "",
            cell: props => {
                const deed = () => requiredItemsForDeployable(props.row.original).deed;
                return <Show when={deed()}>
                    {d => <ItemLink id={d().id} name={d().name}/>}
                </Show>;
            }
        },
        knowledgeColumn<DeployableDesc, number[]>("Training",
            { accessorFn: dep => requiredItemsForDeployable(dep).training.map(k => k.id)}
        ),
        {
            id: "Occupants",
            accessorKey: "capacity",
            filterFn: "inNumberRange"
        },
        {
            id: "Movement",
            accessorKey: "movementType.tag",
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Speed",
            accessorFn: (deployable: DeployableDesc) => {
                let speeds;
                switch (deployable.movementType.tag) {
                    case MovementType.None.tag:
                        return 0;
                    case MovementType.Ground.tag:
                        speeds = new Set(deployable.speed
                            .filter(ms => ms.surfaceType.tag == SurfaceType.Ground.tag)
                            .map(ms => ms.surfaceType.tag + ": " + ms.speed)).values().toArray()
                        return speeds.length == 1 ? speeds[0] : speeds.join(', ');
                    case MovementType.Water.tag:
                        speeds = new Set(deployable.speed
                            .filter(ms => ms.surfaceType.tag != SurfaceType.Ground.tag)
                            .map(ms => ms.surfaceType.tag + ": " + ms.speed)).values().toArray()
                        return speeds.length == 1 ? speeds[0] : speeds.join(', ');
                    case MovementType.Amphibious.tag:
                        speeds = new Set(deployable.speed
                            .map(ms => ms.speed)).values().toArray();
                        return speeds.length == 1 ? speeds[0] : speeds;
                }
            }
        },
        {
            id: "Step Height",
            accessorFn: getStepHeight,
            filterFn: "inNumberRange",
        },
        {
            id: "Can Auto-Follow",
            accessorKey: "canAutoFollow",
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Affected By Wind",
            accessorKey: "affectedByWind",
            filterFn: includedIn<DeployableDesc>(),
        },
        statsColumn(),
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Type"),
        rangeFilter("Item Slots"),
        uniqueValuesFilter("Item Stack Size", undefined, compareOptions),
        rangeFilter("Total Item Size"),
        rangeFilter("Cargo Slots"),
        uniqueValuesFilter("Cargo Stack Size", undefined, compareOptions),
        rangeFilter("Total Cargo Size"),
        uniqueValuesFilter("Training", undefined, compareOptions),
        rangeFilter("Occupants"),
        uniqueValuesFilter("Movement"),
        rangeFilter("Step Height"),
        boolFilter("Can Auto-Follow"),
        uniqueValuesFilter("Affected By Wind", undefined, compareOptions),
        statsFilter(),
    ],
    searchColumns: ["Name"],
}