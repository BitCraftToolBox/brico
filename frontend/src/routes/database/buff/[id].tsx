import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {breadcrumb, IconLink, pageIcon} from "~/lib/game-links";
import {SidebarPages} from "~/lib/sidebar-items";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, readableSeconds, splitCamelCase} from "~/lib/utils";

export default function BuffDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.BuffDesc);
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");

    const buff = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return buffIndex()?.get(id);
    });

    const buffType = createMemo(() => {
        const b = buff();
        if (!b) return undefined;
        return BitCraftTables.BuffTypeDesc.indexedBy("id")?.()?.get(b.buffTypeId);
    });

    const details = createMemo((): DetailGroup[] => {
        const b = buff();
        if (!b) return [];
        const groups: DetailGroup[] = [{
            properties: [
                {label: "Buff Type", value: buffType()?.name},
                {label: "Duration", value: b.duration ? readableSeconds(b.duration) : "Unspecified"},
                {label: "Priority", value: b.priority},
                {label: "Beneficial", value: b.beneficial},
                {label: "Warn Time", value: b.warnTime ? `${fixFloat(b.warnTime)}s` : undefined},
                {
                    label: "Online Timestamp",
                    value: <Tooltip openOnTouchStart>
                        <TooltipTrigger class="decoration-dotted underline">{b.onlineTimestamp ? "Yes" : "No"}</TooltipTrigger>
                        <TooltipContent class="max-w-[90svw]">If No, buff ticks down while offline.</TooltipContent>
                    </Tooltip>
                },
            ],
        }];
        if (b.stats?.length) {
            groups.push({
                heading: "Stats",
                properties: b.stats.map(s => ({
                    label: splitCamelCase(s.id?.tag ?? ""),
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
                const item = itemIdx?.get(food.itemId);
                entries.push({
                    href: `/database/food/${food.itemId}`,
                    iconPage: "Food",
                    name: item?.name ?? `Food #${food.itemId}`,
                });
            }
        }
        const buildingIdx = BitCraftTables.BuildingDesc.indexedBy("id")();
        for (const bb of BitCraftTables.BuildingBuffDesc.get() ?? []) {
            if (bb.buffs.some(e => e.buffId === b.id)) {
                const building = buildingIdx?.get(bb.buildingId);
                entries.push({
                    href: `/database/building/${bb.buildingId}`,
                    iconPage: "Structures",
                    name: building?.name ?? `Building #${bb.buildingId}`,
                });
            }
        }
        return entries;
    });

    return (
        <DetailPageLayout
            title={buff()?.description ?? `Buff #${params.id}`}
            breadcrumb={breadcrumb("/database/buff")}
            loading={isLoading() && !buff()}
            name={buff()?.description ?? `Buff #${params.id}`}
            icon={<Show when={buff()?.iconAssetName}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            tag={buffType()?.name}
            details={details()}
            rawData={buff()}
            spacetimeTable={BitCraftTables.BuffDesc.st_name}
            objectId={buff()?.id}
            tabs={[
                {
                    id: "sources",
                    label: "Sources",
                    count: sources().length,
                    showWhenEmpty: false,
                    content: () => <RelTable
                        data={sources()}
                        columns={[{
                            header: "Source",
                            cell: row => <IconLink href={row.href} icon={pageIcon(row.iconPage)}>{row.name}</IconLink>,
                        }]}
                    />,
                },
            ]}
        />
    );
}

