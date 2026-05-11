import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailGroup, DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
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
                    value: <Tooltip>
                        <TooltipTrigger>{b.onlineTimestamp ? "Yes" : "No"}</TooltipTrigger>
                        <TooltipContent>If No, buff ticks down while offline.</TooltipContent>
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

    return (
        <DetailPageLayout
            title={buff()?.description ?? `Buff #${params.id}`}
            loading={isLoading() && !buff()}
            name={buff()?.description ?? `Buff #${params.id}`}
            icon={<Show when={buff()?.iconAssetName}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            tag={buffType()?.name}
            details={details()}
            rawData={buff()}
            spacetimeTable={BitCraftTables.BuffDesc.st_name}
            objectId={buff()?.id}
            tabs={[]}
        />
    );
}

