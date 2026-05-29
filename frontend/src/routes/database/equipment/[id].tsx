import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ItemIcon} from "~/components/shared/GameIcon";
import {breadcrumb, SkillLinkById} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, splitCamelCase} from "~/lib/utils";

export default function EquipmentDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.EquipmentDesc);
    const eqIndex = BitCraftTables.EquipmentDesc.indexedBy("itemId");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");

    const equipment = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return eqIndex()?.get(id);
    });

    const item = createMemo(() => equipment() ? itemIndex()?.get(equipment()!.itemId) : undefined);

    const details = createMemo((): DetailGroup[] => {
        const eq = equipment();
        if (!eq) return [];
        const groups: DetailGroup[] = [
            {
                properties: [
                    {label: "Slots", value: eq.slots?.map(s => splitCamelCase(s.tag)).join(", ")},
                    {label: "Required Skill", value: eq.levelRequirement?.skillId ? <SkillLinkById skillId={eq.levelRequirement.skillId}/> : undefined},
                    {label: "Required Level", value: eq.levelRequirement?.level},
                    {label: "Show In Progression", value: eq.showInProgression ? "Yes" : undefined},
                ],
            },
        ];
        if (eq.stats?.length) {
            groups.push({
                heading: "Stats",
                properties: eq.stats.map(s => ({
                    label: splitCamelCase(s.id?.tag ?? ""),
                    value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                })),
            });
        }
        return groups;
    });

    return (
        <DetailPageLayout
            title={item()?.name ?? `Equipment #${params.id}`}
            breadcrumb={breadcrumb("/database/equipment")}
            loading={isLoading() && !equipment()}
            icon={<Show when={item()}>{(i) =>
                <ItemIcon item={i()} small={false} noInteract/>
            }</Show>}
            name={item()?.name ?? `Equipment #${params.id}`}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            details={details()}
            rawData={equipment()}
            spacetimeTable={BitCraftTables.EquipmentDesc.st_name}
            objectId={equipment()?.itemId}
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
            ]}
        />
    );
}
