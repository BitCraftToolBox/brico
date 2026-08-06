import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {CellContext} from "@tanstack/solid-table";
import {JSX, Show} from "solid-js";
import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import DeployableType from "~/bindings/src/deployable_type_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {MovementType} from "~/bindings/src/movement_type_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {SurfaceType} from "~/bindings/src/surface_type_type";
import {TableColumnHeader} from "~/components/data-table/table-column-header";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {translateGameText} from "~/lib/data-translation";
import {ItemLink} from "~/lib/game-links";
import {deployableTypeLabel, surfaceTypeLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolFilter, headerColumn, knowledgeColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, includedIn} from "~/lib/utils";


function requiredItemsForDeployable(dep: DeployableDesc): {
    deed: ItemDesc | undefined;
    training: SecondaryKnowledgeDesc[];
} {
    const collTable = BitCraftTables.CollectibleDesc.indexedBy("id")();
    const collId = dep.deployFromCollectibleId;
    if (!collId) return {deed: undefined, training: []};
    const collectible = collTable.get(collId);
    if (!collectible) return {deed: undefined, training: []};

    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")();
    const deedItem = collectible.itemDeedId ? itemIndex.get(collectible.itemDeedId) : undefined;

    const knowledgeIds = collectible.requiredKnowledgesToUse ?? [];
    let knowledgeDescs: SecondaryKnowledgeDesc[] = [];
    if (knowledgeIds.length) {
        const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")();
        knowledgeDescs = knowledgeIds
            .map(k => knowledgeIndex.get(k))
            .filter((k): k is SecondaryKnowledgeDesc => !!k);
    }
    return {deed: deedItem, training: knowledgeDescs};
}

function getStepHeight(deployable: DeployableDesc): number | null {
    const pathfinding = BitCraftTables.PathfindingDesc.indexedBy("id")();
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
                const collectible = collTable().get(dep.deployFromCollectibleId);
                // this should be noInteract because it links to the collectible rather than the deployable itself
                return collectible?.iconAssetName ? <CollectibleIcon collectible={collectible} small noInteract/> : <></>;
            },

        }),
        {
            id: "Type",
            meta: {label: msg`Type`},
            accessorKey: "deployableType.tag",
            cell: (props: CellContext<any, DeployableType["tag"]>): JSX.Element => deployableTypeLabel(props.getValue()),
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Item Slots",
            meta: {label: msg`Item Slots`},
            accessorKey: "storage",
            filterFn: "inNumberRange",
        },
        {
            id: "Item Stack Size",
            meta: {label: msg`Item Stack Size`},
            accessorFn: (dep: DeployableDesc) => dep.itemSlotSize / 6000,
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Total Item Size",
            meta: {label: msg`Total Item Size`},
            header: (props) => {
                return (
                    <TableColumnHeader column={props.column} title={props.column.id} table={props.table}>
                        <Tooltip openOnTouchStart>
                            <TooltipTrigger class="decoration-dotted underline">
                                <Trans>Total Item Size</Trans>
                            </TooltipTrigger>
                            <TooltipContent class="max-w-[90svw]">
                                <Trans>Equivalent "player inventory" slots.</Trans>
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
            meta: {label: msg`Cargo Slots`},
            accessorKey: "stockpile",
            filterFn: "inNumberRange",
        },
        {
            id: "Cargo Stack Size",
            meta: {label: msg`Cargo Stack Size`},
            accessorFn: (dep: DeployableDesc) => dep.cargoSlotSize / 6000,
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Total Cargo Size",
            meta: {label: msg`Total Cargo Size`},
            accessorFn: (dep: DeployableDesc) => dep.stockpile * dep.cargoSlotSize / 6000,
            filterFn: "inNumberRange",
        },
        {
            id: "Deed",
            meta: {label: gameText(msg`Deed`)},
            accessorFn: (dep: DeployableDesc) => requiredItemsForDeployable(dep).deed?.name ?? "",
            cell: props => {
                const deed = () => requiredItemsForDeployable(props.row.original).deed;
                return <Show when={deed()}>
                    {d => <ItemLink id={d().id} name={d().name}/>}
                </Show>;
            }
        },
        knowledgeColumn<DeployableDesc, number[]>("Training",
            { accessorFn: dep => requiredItemsForDeployable(dep).training.map(k => k.id)},
            msg`Training`,
        ),
        {
            id: "Occupants",
            meta: {label: msg`Occupants`},
            accessorKey: "capacity",
            filterFn: "inNumberRange"
        },
        {
            id: "Movement",
            meta: {label: gameText(msg`Movement`)},
            accessorKey: "movementType.tag",
            cell: (props: CellContext<any, MovementType["tag"]>): JSX.Element => translateGameText(props.getValue()),
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Speed",
            meta: {label: gameText(msg`Speed`)},
            accessorFn: (deployable: DeployableDesc) => {
                let speeds: any[];
                switch (deployable.movementType.tag) {
                    case MovementType.None.tag:
                        return 0;
                    case MovementType.Ground.tag:
                        speeds = new Set(deployable.speed
                            .filter(ms => ms.surfaceType.tag == SurfaceType.Ground.tag)
                            .map(ms => surfaceTypeLabel(ms.surfaceType.tag) + ": " + ms.speed)).values().toArray()
                        return speeds.length == 1 ? speeds[0] : speeds.join(', ');
                    case MovementType.Water.tag:
                        speeds = new Set(deployable.speed
                            .filter(ms => ms.surfaceType.tag != SurfaceType.Ground.tag)
                            .map(ms => surfaceTypeLabel(ms.surfaceType.tag) + ": " + ms.speed)).values().toArray()
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
            meta: {label: msg`Step Height`},
            accessorFn: getStepHeight,
            filterFn: "inNumberRange",
        },
        {
            id: "Can Auto-Follow",
            meta: {label: msg`Can Auto-Follow`},
            accessorKey: "canAutoFollow",
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Affected By Wind",
            meta: {label: msg`Affected By Wind`},
            accessorKey: "affectedByWind",
            filterFn: includedIn<DeployableDesc>(),
        },
        statsColumn(),
        rowActions({accessorKey: "id"}, "col", undefined,
            { accessorFn: (dep) => {
                return BitCraftTables.CollectibleDesc.indexedBy("id")().get(dep.deployFromCollectibleId)?.id;
            }
        }),
    ],
    facetedFilters: [
        uniqueValuesFilter("Type", msg`Type`),
        rangeFilter("Item Slots", msg`Item Slots`),
        uniqueValuesFilter("Item Stack Size", msg`Item Stack Size`, compareOptions),
        rangeFilter("Total Item Size", msg`Total Item Size`),
        rangeFilter("Cargo Slots", msg`Cargo Slots`),
        uniqueValuesFilter("Cargo Stack Size", msg`Cargo Stack Size`, compareOptions),
        rangeFilter("Total Cargo Size", msg`Total Cargo Size`),
        uniqueValuesFilter("Training", msg`Training`, compareOptions),
        rangeFilter("Occupants", msg`Occupants`),
        uniqueValuesFilter("Movement", gameText(msg`Movement`)),
        rangeFilter("Step Height", msg`Step Height`),
        boolFilter("Can Auto-Follow", msg`Can Auto-Follow`),
        uniqueValuesFilter("Affected By Wind", msg`Affected By Wind`, compareOptions),
        statsFilter(),
    ],
    searchColumns: ["Name"],
}