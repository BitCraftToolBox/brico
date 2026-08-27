import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {IconLink, pageIcon} from "~/lib/game-links";
import {statLabel} from "~/lib/game-strings";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {SidebarPages} from "~/lib/sidebar-items";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, readableSeconds} from "~/lib/utils";

export default function BuffDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.BuffDesc);
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");

    const buff = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return buffIndex().get(id);
    });

    const buffType = createMemo(() => {
        const b = buff();
        if (!b) return undefined;
        return BitCraftTables.BuffTypeDesc.indexedBy("id")().get(b.buffTypeId);
    });

    const details = createMemo((): DetailGroup[] => {
        const b = buff();
        if (!b) return [];
        const groups: DetailGroup[] = [{
            properties: [
                {label: msg`Buff Type`, value: buffType()?.name},
                {label: msg`Duration`, value: b.duration ? readableSeconds(b.duration) : () => <Trans>Unspecified</Trans>},
                {label: msg`Priority`, value: b.priority},
                {label: msg`Beneficial`, value: b.beneficial},
                {label: msg`Warn Time`, value: b.warnTime ? `${fixFloat(b.warnTime)}s` : undefined},
                {
                    label: msg`Online Timestamp`,
                    value: () => <Tooltip openOnTouchStart>
                        <TooltipTrigger class="decoration-dotted underline">{b.onlineTimestamp ? <Trans>Yes</Trans> : <Trans>No</Trans>}</TooltipTrigger>
                        <TooltipContent class="max-w-[90svw]"><Trans>If No, buff ticks down while offline.</Trans></TooltipContent>
                    </Tooltip>
                },
            ],
        }];
        if (b.stats?.length) {
            groups.push({
                heading: msg`Stats`,
                properties: b.stats.map(s => ({
                    label: statLabel(s.id?.tag),
                    value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                })),
            });
        }
        return groups;
    });

    type SourceEntry = { href: string; iconPage: SidebarPages; name: string };

    const sources = createMemo((): SourceEntry[] => {
        const b = buff();
        if (!b) return [];
        const entries: SourceEntry[] = [];
        const itemIdx = BitCraftTables.ItemDesc.indexedBy("id")();
        for (const food of BitCraftTables.FoodDesc.get() ?? []) {
            if (food.buffs.some(e => e.buffId === b.id)) {
                const item = itemIdx.get(food.itemId);
                entries.push({
                    href: `/database/item/${food.itemId}`,
                    iconPage: "Food",
                    name: item?.name ?? `Food #${food.itemId}`,
                });
            }
        }
        const buildingIdx = BitCraftTables.BuildingDesc.indexedBy("id")();
        for (const bb of BitCraftTables.BuildingBuffDesc.get() ?? []) {
            if (bb.buffs.some(e => e.buffId === b.id)) {
                const building = buildingIdx.get(bb.buildingId);
                entries.push({
                    href: `/database/building/${bb.buildingId}`,
                    iconPage: "Structures",
                    name: building?.name ?? `Building #${bb.buildingId}`,
                });
            }
        }
        for (const ability of BitCraftTables.AbilityCustomDesc.get() ?? []) {
            if (ability.buffs.some(e => e.buffId === b.id)) {
                entries.push({
                    href: `/database/ability/${ability.id}`,
                    iconPage: "Abilities",
                    name: ability.abilityName || `Ability #${ability.id}`,
                });
            }
        }
        const placeableIdx = BitCraftTables.PlaceableDesc.indexedBy("id")();
        for (const interaction of BitCraftTables.PlaceableInteractionDesc.get() ?? []) {
            if (interaction.selfBuffs?.some(e => e.buffId === b.id)) {
                const placeable = placeableIdx.get(interaction.placeableId);
                entries.push({
                    href: `/database/placeable/${interaction.placeableId}`,
                    iconPage: "Placeables",
                    name: placeable?.name ?? `Placeable #${interaction.placeableId}`,
                })
            }
        }
        for (const placement of BitCraftTables.PlaceablePlacementDesc.get() ?? []) {
            if (placement.selfBuffs?.some(e => e.buffId === b.id)) {
                const placeable = placeableIdx.get(placement.placedPlaceableId);
                entries.push({
                    href: `/database/placeable/${placement.placedPlaceableId}`,
                    iconPage: "Placeables",
                    name: placeable?.name ?? `Placeable #${placement.placedPlaceableId}`,
                })
            }
        }
        const equips = BitCraftTables.EquipmentDesc.indexedByMulti("equipmentBuffId")().get(b.id);
        if (equips?.length) {
            entries.push(...equips.map(eq => {
                return {
                    href: `/database/item/${eq.itemId}`,
                    iconPage: "Equipment",
                    name: itemIdx.get(eq.itemId)?.name ?? `Equipment #${eq.itemId}`,
                } satisfies SourceEntry
            }));
        }
        return entries;
    });

    return (
        <DetailPageLayout
            title={buff()?.description ?? `Buff #${params.id}`}
            breadcrumbHref="/database/buff"
            loading={isLoading() && !buff()}
            name={buff()?.description ?? `Buff #${params.id}`}
            icon={<Show when={buff()?.iconAssetName}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            tag={buffType()?.name}
            metaKind="buff"
            metaImage={ogImageForCodepoint(buff()?.iconAssetName)}
            details={details()}
            rawData={buff()}
            spacetimeTable={BitCraftTables.BuffDesc.spacetimeName}
            objectId={buff()?.id}
            tabs={[
                {
                    id: "sources",
                    label: msg`Sources`,
                    count: sources().length,
                    showWhenEmpty: false,
                    content: () => <RelTable
                        data={sources()}
                        columns={[{
                            header: msg`Source`,
                            cell: row => <IconLink href={row.href} icon={pageIcon(row.iconPage)}>{row.name}</IconLink>,
                        }]}
                    />,
                },
            ]}
        />
    );
}

