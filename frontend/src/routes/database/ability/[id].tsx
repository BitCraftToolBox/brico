import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {BuffTable} from "~/components/shared/RelTablePresets";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {BuffLinkById, ItemStackLink, PlaceableLinkById, SkillLinkById} from "~/lib/game-links";
import {ogImageForAsset} from "~/lib/og-meta";
import {fixFloat, readableSeconds} from "~/lib/utils";

export default function AbilityDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.AbilityCustomDesc);
    const index = BitCraftTables.AbilityCustomDesc.indexedBy("id");
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");

    const ability = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const buffs = createMemo(() => {
        const a = ability();
        if (!a?.buffs?.length) return [];
        const idx = buffIndex();
        return a.buffs.map(be => {
            const buff = idx.get(be.buffId);
            return {
                ...be,
                duration: be.duration ?? buff?.duration,
                label: buff?.description ?? `Buff #${be.buffId}`,
            };
        });
    });

    const professionHitSkillId = () => {
        const a = ability();
        return a?.performProfessionHit && a.professionHitSkillId > 0 ? a.professionHitSkillId : undefined;
    };

    const details = createMemo((): DetailGroup[] => {
        const a = ability();
        if (!a) return [];
        const groups: DetailGroup[] = [{
            properties: [
                {label: msg`Stamina Cost`, value: a.staminaCost},
                {label: msg`Cooldown`, value: () => readableSeconds(a.cooldown)},
            ],
        }];
        const skillId = professionHitSkillId();
        if (skillId !== undefined) {
            groups.push({
                heading: msg`Profession Hit`,
                properties: [
                    {label: msg`Skill`, value: () => <SkillLinkById skillId={skillId}/>},
                    {label: msg`Bonus`, value: a.professionHitBonusDamage},
                ],
            });
        }
        return groups;
    });

    const requiredBuffs = () => ability()?.requiredBuffIds ?? [];
    const inputItems = () => ability()?.inputItemStacks ?? [];
    const outputItems = () => (ability()?.outputItemStacks ?? []).flatMap(o => o.itemStack ? [{stack: o.itemStack, probability: o.probability}] : []);
    const placeables = () => ability()?.spawnedPlaceables ?? [];

    return (
        <DetailPageLayout
            title={ability()?.abilityName ?? `Ability #${params.id}`}
            breadcrumbHref="/database/ability"
            breadcrumbTitle={msg`Ability`}
            loading={isLoading() && !ability()}
            name={ability()?.abilityName ?? "Ability not found"}
            icon={<Show when={ability()}>{a => <GameIcon name={a().abilityName} iconAsset={a().iconPath} shape="tall" small={false} noInteract/>}</Show>}
            metaKind="ability"
            metaImage={ogImageForAsset(ability()?.iconPath)}
            description={ability()?.description}
            chatLink={`(ability=${ability()?.id})`}
            details={details()}
            rawData={ability()}
            spacetimeTable={BitCraftTables.AbilityCustomDesc.spacetimeName}
            objectId={ability()?.id}
            tabs={[
                {id: "buffs", label: msg`Buffs`, count: buffs().length, content: () => <BuffTable data={buffs()}/>},
                {
                    id: "required-buffs", label: msg`Required Buffs`, count: requiredBuffs().length, showWhenEmpty: false,
                    content: () => <RelTable data={requiredBuffs()} columns={[
                        {header: msg`Buff`, cell: id => <BuffLinkById buffId={id}/>},
                        {header: msg`Consumed`, cell: () => <span>{ability()?.consumeRequiredBuff ? <Trans>Yes</Trans> : <Trans>No</Trans>}</span>},
                    ]}/>,
                },
                {
                    id: "required-items", label: msg`Required Items`, count: inputItems().length, showWhenEmpty: false,
                    content: () => <RelTable data={inputItems()} columns={[
                        {header: msg`Item`, cell: s => <ItemStackLink stack={s}/>},
                        {header: msg`Consumption Chance`, cell: s => <span>{fixFloat(s.consumptionChance * 100)}%</span>},
                    ]}/>,
                },
                {
                    id: "output-items", label: msg`Output Items`, count: outputItems().length, showWhenEmpty: false,
                    content: () => <RelTable data={outputItems()} columns={[
                        {header: msg`Item`, cell: o => <ItemStackLink stack={o.stack}/>},
                        {header: msg`Probability`, cell: o => <span>{fixFloat(o.probability * 100)}%</span>},
                    ]}/>,
                },
                {
                    id: "spawned-placeables", label: msg`Spawned Placeables`, count: placeables().length, showWhenEmpty: false,
                    content: () => <RelTable data={placeables()} columns={[
                        {header: msg`Placeable`, cell: sp => <PlaceableLinkById id={sp.placeableId}/>},
                        {header: msg`Chance`, cell: sp => <span>{fixFloat(sp.chance * 100)}%</span>},
                        {header: msg`Radius`, cell: sp => <span>{sp.radiusMin === sp.radiusMax ? sp.radiusMin : `${sp.radiusMin}-${sp.radiusMax}`}</span>},
                    ]}/>,
                },
            ]}
        />
    );
}
