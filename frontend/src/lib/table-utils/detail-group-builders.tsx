import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {DetailGroup} from "~/components/shared/DetailPageLayout";
import {BuffLink} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {fixFloat, readableSeconds, splitCamelCase} from "~/lib/utils";

export function buffsGroups(buffs: BuffEffect[]): DetailGroup[] {
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");
    const buffTypeIndex = BitCraftTables.BuffTypeDesc.indexedBy("id");
    return buffs.map(buffEffect => {
        const buff = buffIndex().get(buffEffect.buffId);
        const category = buffTypeIndex().get(buff?.buffTypeId);
        const label = buff ? category ? `${buff.description} (${category.name})` : buff.description : `Buff #${buffEffect.buffId}`;
        const props = [{
            label: "Duration",
            value: readableSeconds(fixFloat(buffEffect.duration ?? buff?.duration)) ?? "Infinite"
        }];
        props.push(...buff?.stats?.map(s => ({
            label: splitCamelCase(s.id?.tag ?? ""),
            value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
        })) ?? []);
        return {
            heading: <BuffLink buffId={buffEffect.buffId} label={label}/>,
            properties: props,
        };
    });
}