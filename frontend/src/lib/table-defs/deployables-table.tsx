import {DeployableDesc, ItemDesc, ItemStack, ItemType, MovementType, SurfaceType} from "~/bindings/ts";
import {includedIn} from "~/lib/utils";
import {BitCraftToDataDef, rowActionRawOnly} from "~/lib/table-defs/base";
import {Column} from "@tanstack/solid-table";
import {BitCraftTables} from "~/lib/spacetime";
import {ItemStackArrayComponent, ItemStackIcon} from "~/components/bitcraft/items";
import {Show} from "solid-js";


const itemCache = new Map<number, { deed: ItemStack | undefined, training: ItemStack[] }>

function requiredItemsForDeployable(dep: DeployableDesc) {
    const existing = itemCache.get(dep.id);
    if (existing) return existing;

    const collTable = BitCraftTables.CollectibleDesc.indexedBy("id")!()!;
    const collId = dep.deployFromCollectibleId;
    if (!collId) return {deed: undefined, training: []};
    const collectible = collTable.get(collId);
    if (!collectible) return {deed: undefined, training: []};
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")!()!;
    const deed = collectible.itemDeedId;
    let deedItem: ItemDesc | undefined;
    if (deed) {
        deedItem = itemIndex.get(deed);
    }
    const knowledge = collectible.requiredKnowledgesToUse;
    let knowledgeItems = [] as ItemStack[];
    if (knowledge.length) {
        const knowledgeTable = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")!()!;
        knowledgeItems = knowledge
            .map(k => itemIndex.get(knowledgeTable.get(k)?.itemId))
            .filter(p => !!p)
            .map(i => {
                return {
                    itemId: i.id,
                    quantity: 1,
                    itemType: ItemType.Item
                } as ItemStack;
            });
    }
    const res = {
        deed: deedItem ? { itemId: deedItem.id, itemType: ItemType.Item as ItemType, quantity: 1, durability: undefined} : undefined,
        training: knowledgeItems
    };
    itemCache.set(dep.id, res)
    return res;
}

export const DeployableDescDefs: BitCraftToDataDef<DeployableDesc> = {
    columns: [
        {
            id: "Name",
            accessorKey: "name",
            enableHiding: false
        },
        {
            id: "Type",
            accessorKey: "deployableType.tag",
            filterFn: includedIn<DeployableDesc>(),
        },
        {
            id: "Item Slots",
            accessorKey: "storage",
        },
        {
            id: "Item Stack Size",
            accessorFn: (dep: DeployableDesc) => dep.itemSlotSize / 6000
        },
        {
            id: "Cargo Slots",
            accessorKey: "stockpile"
        },
        {
            id: "Cargo Stack Size",
            accessorFn: (dep: DeployableDesc) => dep.cargoSlotSize / 6000
        },
        {
            id: "Deed",
            accessorFn: (dep: DeployableDesc) => requiredItemsForDeployable(dep).deed,
            cell: props => {
                const stack = props.getValue() as ItemStack;
                return <Show when={stack}>
                    <ItemStackIcon
                        item={[stack.itemType.tag, stack.itemId]}
                        quantity={stack.quantity}
                        hideSingle={true}
                    />
                </Show>
            }
        },
        {
            id: "Training",
            accessorFn: (dep: DeployableDesc) => requiredItemsForDeployable(dep).training,
            cell: props => {
                const stacks = props.getValue() as ItemStack[];
                const stackProps = stacks.map(stack => {
                    return {
                        item: [stack.itemType.tag, stack.itemId] as [string, number],
                        quantity: stack.quantity,
                        hideSingle: true
                    }
                })
                return <Show when={stacks.length}>
                    <ItemStackArrayComponent
                        stackProps={() => stackProps}
                    />
                </Show>
            }
        },
        {
            id: "Occupants",
            accessorKey: "capacity",
            filterFn: "inNumberRange"
        },
        {
            id: "Movement",
            accessorKey: "movementType.tag"
        },
        {
            id: "Speed",
            accessorFn: (deployable: DeployableDesc) => {
                let speeds;
                switch (deployable.movementType.tag) {
                    case MovementType.None.tag:
                        return 0;
                    case MovementType.Ground.tag:
                        return deployable.speed
                            .filter(ms => ms.surfaceType.tag == SurfaceType.Ground.tag)
                            .find(() => true)?.speed || 0;
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
        rowActionRawOnly
    ],
    facetedFilters: [
        {
            column: "Type",
            title: "Type",
            options: (col: Column<DeployableDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray()
            }
        },
    ]
}