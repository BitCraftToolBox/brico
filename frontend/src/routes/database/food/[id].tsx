import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {BuffTable} from "~/components/shared/RelTablePresets";
import {breadcrumb, BuffLink} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, splitCamelCase, undefinedIfZero} from "~/lib/utils";

export default function FoodDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.FoodDesc);
    const foodIndex = BitCraftTables.FoodDesc.indexedBy("itemId");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");

    const food = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return foodIndex()?.get(id);
    });

    const item = createMemo(() => food() ? itemIndex()?.get(food()!.itemId) : undefined);

    const buffs = createMemo(() => {
        const f = food();
        if (!f?.buffs?.length) return [];
        const buffIdx = BitCraftTables.BuffDesc.indexedBy("id");
        return f.buffs.map(b => {
            const buff = buffIdx()?.get(b.buffId);
            return {
                ...b,
                buff,
                label: buff?.description ?? `Buff #${b.buffId}`,
            };
        });
    });

    const statGroups = createMemo(() => {
        let groups: DetailGroup[] = [];
        buffs().forEach(b => {
            groups.push({
                heading: <BuffLink buffId={b.buffId} label={b.label}/>,
                properties: b.buff?.stats.map(s => ({
                    label: splitCamelCase(s.id?.tag ?? ""),
                    value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                })) || [],
            })
        })
        return groups;
    });

    return (
        <DetailPageLayout
            title={item()?.name ?? `Food #${params.id}`}
            breadcrumb={breadcrumb("/database/food")}
            loading={isLoading() && !food()}
            icon={<Show when={item()}>{(i) =>
                <GameIcon name={i().name} iconAsset={i().iconAssetName} shape="tall"
                          small={false} tier={i().tier} rarity={i().rarity} noInteract/>
            }</Show>}
            name={item()?.name ?? `Food #${params.id}`}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            details={[
                {
                    properties: [
                        {label: "Satiation", value: food() ? undefinedIfZero(fixFloat(food()!.hunger)) : undefined},
                        {label: "HP", value: food() ? undefinedIfZero(fixFloat(food()!.hp)) : undefined},
                        {label: "Up To HP", value: food() ? undefinedIfZero(fixFloat(food()!.upToHp)) : undefined},
                        {label: "Stamina", value: food() ? undefinedIfZero(fixFloat(food()!.stamina)) : undefined},
                        {label: "Up To Stamina", value: food() ? undefinedIfZero(fixFloat(food()!.upToStamina)) : undefined},
                        {label: "Teleportation Energy", value: food() ? undefinedIfZero(fixFloat(food()!.teleportationEnergy)) : undefined},
                        {label: "Consumable In Combat", value: food()?.consumableWhileInCombat},
                    ]
                },
                ...statGroups()
            ]}
            rawData={food()}
            spacetimeTable={BitCraftTables.FoodDesc.st_name}
            objectId={food()?.itemId}
            chatLink={`(item=${item()?.id})`}
            tabs={[
                {
                    id: "item", label: "Item", count: item() ? 1 : 0,
                    content: () => <Show when={item()}>
                        <RelTable data={[item()!]} columns={[
                            {header: "Item", cell: row => <A href={`/database/item/${row.id}`}>{row.name}</A>},
                        ]}/>
                    </Show>,
                },
                {
                    id: "buffs", label: "Buffs", count: buffs().length,
                    content: () => <BuffTable data={buffs()}/>,
                },
            ]}
        />
    );
}
