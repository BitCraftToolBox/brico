import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {ItemType} from "~/bindings/src/item_type_type";

import {DetailGroup, DetailPageLayout, DetailProperty, RelTable} from "~/components/shared/DetailPageLayout";
import {BuildingIcon} from "~/components/shared/GameIcon";
import {ItemStackIcon} from "~/components/shared/ItemStacks";
import {getBuildingTier} from "~/lib/bitcraft-utils";
import {breadcrumb, BuffLinkById, LinkedList} from "~/lib/game-links";
import {constructionRecipeForBuilding, deconstructionRecipeForBuilding,} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {constructionCombinedSingleTab} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat} from "~/lib/utils";

export default function BuildingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.BuildingDesc);
    const buildingIndex = BitCraftTables.BuildingDesc.indexedBy("id");
    const buildingTypeIndex = BitCraftTables.BuildingTypeDesc.indexedBy("id");

    const building = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return buildingIndex()?.get(id);
    });

    const tier = createMemo(() => building() ? getBuildingTier(building()!) : undefined);

    const constructionRecipe = createMemo(() => {
        const b = building();
        if (!b) return undefined;
        return constructionRecipeForBuilding(b.id);
    });

    const deconstructionRecipe = createMemo(() => {
        const b = building();
        if (!b) return undefined;
        return deconstructionRecipeForBuilding(b.id);
    });

    const buildingBuffDescs = createMemo(() =>
        BitCraftTables.BuildingBuffDesc.get()?.filter(b => b.buildingId === building()?.id) ?? []
    );

    const buffCount = createMemo(() =>
        buildingBuffDescs().reduce((sum, b) => sum + b.buffs.length, 0)
    );

    const empireCurrencyId = createMemo(() =>
        BitCraftTables.ItemDesc.get()?.find(i => i.tag === "Empire Currency")?.id
    );

    const functionNames = createMemo(() => {
        const b = building();
        if (!b) return [];
        const idx = buildingTypeIndex();
        return b.functions.map(f => {
            const bt = idx?.get(f.functionType);
            return bt ? `${bt.name} Lvl ${f.level}` : `#${f.functionType} Lvl ${f.level}`;
        });
    });

    const detailGroups = createMemo((): DetailGroup[] => {
        const b = building();
        if (!b) return [];
        const groups: DetailGroup[] = [];

        const lightRadius = b.lightRadius > 0 ? fixFloat(b.lightRadius) : undefined;
        const restedBuff = b.restedBuffDuration > 0 ? `${fixFloat(b.restedBuffDuration)}s` : undefined;
        if (lightRadius || restedBuff || b.wilderness || b.unenterable || b.notDeconstructible || b.destroyOnUnclaim) {
            groups.push({
                properties: [
                    {label: "Max Health", value: b.maxHealth},
                    {label: "Ignore Damage", value: b.ignoreDamage ? true : undefined},
                    {label: "Defense Level", value: b.defenseLevel},
                    {label: "Decay", value: b.decay > 0 ? fixFloat(b.decay) : undefined},
                    {label: "Maintenance", value: b.maintenance > 0 ? fixFloat(b.maintenance) : undefined},
                    {label: "Light Radius", value: lightRadius},
                    {label: "Rested Buff Duration", value: restedBuff},
                    {label: "Wilderness", value: b.wilderness ? true : undefined},
                    {label: "Unenterable", value: b.unenterable ? true : undefined},
                    {label: "Not Deconstructible", value: b.notDeconstructible ? true : undefined},
                    {label: "Destroy On Unclaim", value: b.destroyOnUnclaim ? true : undefined},
                ],
            });
        }

        b.functions.forEach(f => {
            const bt = buildingTypeIndex()?.get(f.functionType);
            const funcName = bt?.name ?? `Function #${f.functionType}`;
            const funcProps: DetailProperty[] = [];
            if (f.craftingSlots > 0) funcProps.push({label: "Crafting Slots", value: f.craftingSlots});
            if (f.refiningSlots > 0) funcProps.push({label: "Total Passive Slots", value: f.refiningSlots});
            if ((f.craftingSlots > 0 && f.concurrentCraftsPerPlayer > 1) || f.refiningSlots > 0)
                funcProps.push({label: "Crafts per Player", value: f.concurrentCraftsPerPlayer});
            if (f.storageSlots > 0) funcProps.push({label: "Storage Slots", value: `${f.storageSlots} × ${f.itemSlotSize / 6000}`});
            if (f.cargoSlots > 0) funcProps.push({label: "Cargo Slots", value: `${f.cargoSlots} × ${f.cargoSlotSize / 6000}`});
            if (f.tradeOrders > 0) funcProps.push({label: "Trade Orders", value: f.tradeOrders});
            if (f.housingSlots > 0) funcProps.push({label: "Housing Slots", value: f.housingSlots});
            if (f.housingIncome > 0) funcProps.push({label: "Housing Income", value: <span title={"hex coin per day per occupied slot"}>{f.housingIncome}</span>});
            if (f.terraform) funcProps.push({label: "Terraform", value: true});

            if (funcProps.length > 0) {
                groups.push({heading: `${funcName} Lvl ${f.level}`, properties: funcProps});
            }
        });

        return groups;
    });

    return (
        <DetailPageLayout
            title={building()?.name ?? `Building #${params.id}`}
            breadcrumb={breadcrumb("/database/building", "Structure")}
            loading={isLoading() && !building()}
            icon={<Show when={building()}>{(b) =>
                <BuildingIcon building={b()} small={false} noInteract/>
            }</Show>}
            name={building()?.name ?? "Building not found"}
            tier={tier()}
            tag={functionNames().length > 0 ? functionNames().join(", ") : undefined}
            description={building()?.description}
            details={detailGroups()}
            rawData={building()}
            spacetimeTable={BitCraftTables.BuildingDesc.st_name}
            objectId={building()?.id}
            chatLink={`(build=${building()?.id})`}
            tabs={[
                constructionCombinedSingleTab(constructionRecipe(), deconstructionRecipe()),
                {
                    id: "buffs",
                    label: "Buffs",
                    count: buffCount(),
                    showWhenEmpty: false,
                    content: () => {
                        return <RelTable
                            data={buildingBuffDescs()}
                            columns={[
                                {
                                    header: "Cost",
                                    cell: row => (
                                        <Show when={row.empireCurrencyCost} fallback={"None"}>
                                            <Show when={empireCurrencyId()}>{id => (
                                                <ItemStackIcon
                                                    stack={{itemId: id(), quantity: row.empireCurrencyCost, itemType: ItemType.Item as any, durability: undefined}}
                                                    small showName
                                                />
                                            )}</Show>
                                        </Show>
                                    ),
                                },
                                {
                                    header: "Buffs",
                                    cell: row => <LinkedList>
                                        {row.buffs.map(e => (
                                            <BuffLinkById buffId={e.buffId} duration={e.duration}/>
                                        ))}
                                    </LinkedList>,
                                },
                            ]}
                        />;
                    },
                },
            ]}
        />
    );
}

