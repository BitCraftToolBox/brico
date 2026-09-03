import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, For, JSX, Show} from "solid-js";
import {AbilityCustomDesc} from "~/bindings/src/ability_custom_desc_type";
import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {SkillBanner} from "~/components/shared/GameIcon";
import {NumberField, NumberFieldDecrementTrigger, NumberFieldGroup, NumberFieldIncrementTrigger, NumberFieldInput} from "~/components/ui/number-field";
import {AbilityLink, AchievementLink, EnemyLink, IconLink, ItemLink, ItemStackLink, LinkedList, pageIcon, QuestChainLink, ResourceLink} from "~/lib/game-links";
import {skillCategoryLabel} from "~/lib/game-strings";
import {gameText, Label, useLabel} from "~/lib/labels";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {ProgressionUnlock, progressionUnlocksForSkill} from "~/lib/progression";
import {getTravelerNpcName, isHexCoin, prospectingSpawn} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {consolidateStats, formatStatLabel, formatStatValue} from "~/lib/table-utils/stats-column-builder";

// ─── Unlock line renderers ───────────────────────────────────────
//
// Each of these mirrors the equivalent name-building helper in relations.ts (e.g.
// `getCraftingRecipeName`, `getExtractionRecipeName`), but keeps the item/resource/enemy placeholder
// as a clickable link instead of flattening it to plain text. The surrounding sentence is app-authored
// UI text (Lingui `<Trans>`), while every placeholder still resolves through the game data layer.

function craftingUnlockLine(recipe: CraftingRecipeDesc): JSX.Element {
    const mainOutput = recipe.craftedItemStacks.at(0);
    if (!mainOutput) return <>{recipe.name}</>;
    const mainInput = recipe.consumedItemStacks.at(0);
    const parts = recipe.name.split(/(\{[01]})/g).filter(p => p !== "");
    return <>{parts.map(part => {
        if (part === "{0}") return <ItemStackLink stack={{...mainOutput, quantity: 1}}/>;
        if (part === "{1}" && mainInput) return <ItemStackLink stack={{...mainInput, quantity: 1}}/>;
        return part;
    })}</>;
}

function equipmentUnlockLine(equipment: EquipmentDesc): JSX.Element {
    const item = BitCraftTables.ItemDesc.indexedBy("id")().get(equipment.itemId);
    return <Trans>Equip <ItemLink id={equipment.itemId} name={item?.name}/></Trans>;
}

function resourceUnlockLine(recipe: ExtractionRecipeDesc): JSX.Element {
    const resource = recipe.resourceId ? BitCraftTables.ResourceDesc.indexedBy("id")().get(recipe.resourceId) : undefined;
    const targetName = resource
        ? <ResourceLink id={resource.id} name={resource.name}/>
        : <Trans>Unknown</Trans>;
    const verbPhrase = recipe.verbPhrase;
    return <Trans>{verbPhrase} {targetName}</Trans>;
}

function prospectingUnlockLine(prospecting: ProspectingDesc): JSX.Element {
    const spawn = prospectingSpawn(prospecting);
    const target: JSX.Element = spawn?.type === "resource" && spawn.resources.length
        ? <LinkedList>{spawn.resources.map(r => <ResourceLink id={r.id} name={r.name}/>)}</LinkedList>
        : spawn?.type === "enemy" && spawn.enemy
            ? <EnemyLink id={spawn.enemy.enemyType} name={spawn.enemy.name}/>
            : <>{prospecting.name}</>;
    return <Trans>Prospect for {target}</Trans>;
}

function abilityUnlockLine(ability: AbilityCustomDesc): JSX.Element {
    return <Trans context="ability">Use <AbilityLink id={ability.id} name={ability.abilityName} iconPath={ability.iconPath}/></Trans>;
}

function statUnlockLine(stat: CsvStatEntry): JSX.Element {
    return <Trans>Permanently Gain {formatStatLabel(stat)} +{formatStatValue(stat)}</Trans>;
}

function questUnlockLine(quest: QuestChainDesc): JSX.Element {
    return <Trans>Unlock quest <QuestChainLink id={quest.id} name={quest.name}/></Trans>;
}

function achievementUnlockLine(achievement: AchievementDesc): JSX.Element {
    return <Trans>Unlock achievement <AchievementLink id={achievement.id} name={achievement.name}/></Trans>;
}

function travelerTradeUnlockLine(trade: TravelerTradeOrderDesc): JSX.Element {
    const npcName = getTravelerNpcName(trade.traveler.tag);

    const hasHexInRequired = trade.requiredItems.some(isHexCoin);
    const hasHexInOffer = trade.offerItems.some(isHexCoin);

    return (<>
        <Trans>Unlock trade</Trans>
        <IconLink href={`/database/traveler-trade/${trade.id}`} icon={pageIcon("Traveler Trades")}>
            <Show when={hasHexInRequired}>
                <Trans>Buy <ItemStackLink stack={{...trade.offerItems[0], quantity: 1}}/> from {npcName}</Trans>
            </Show>
            <Show when={!hasHexInRequired && hasHexInOffer}>
                <Trans>Sell <ItemStackLink stack={{...trade.requiredItems[0], quantity: 1}}/> to {npcName}</Trans>
            </Show>
            <Show when={!hasHexInRequired && !hasHexInOffer}>
                <Trans>Trade <ItemStackLink stack={trade.requiredItems[0]}/> for <ItemStackLink stack={trade.offerItems[0]}/> to {npcName}</Trans>
            </Show>
        </IconLink>
    </>);
}

function renderUnlock(u: ProgressionUnlock): JSX.Element {
    switch (u.kind) {
        case "crafting":
            return craftingUnlockLine(u.recipe);
        case "equipment":
            return equipmentUnlockLine(u.equipment);
        case "resource":
            return resourceUnlockLine(u.recipe);
        case "prospecting":
            return prospectingUnlockLine(u.prospecting);
        case "ability":
            return abilityUnlockLine(u.ability);
        case "stat":
            return statUnlockLine(u.stat);
        case "quest":
            return questUnlockLine(u.quest);
        case "achievement":
            return achievementUnlockLine(u.achievement);
        case "travelerTrade":
            return travelerTradeUnlockLine(u.trade);
    }
}

// ─── Progression tab ─────────────────────────────────────────────

const PROGRESSION_CATEGORIES: { kind: ProgressionUnlock["kind"]; label: Label }[] = [
    {kind: "crafting", label: gameText(msg`Crafting`)},
    {kind: "equipment", label: gameText(msg`Equipment`)},
    {kind: "resource", label: gameText(msg`Resources`)},
    {kind: "prospecting", label: gameText(msg`Prospecting`)},
    {kind: "ability", label: gameText(msg`Abilities`)},
    {kind: "stat", label: gameText(msg`Stats`)},
    {kind: "quest", label: gameText(msg`Quests`)},
    {kind: "achievement", label: gameText(msg`Achievements`)},
    {kind: "travelerTrade", label: gameText(msg`Traveler Trades`)},
];

const ALL_PROGRESSION_KINDS: ProgressionUnlock["kind"][] = PROGRESSION_CATEGORIES.map(c => c.kind);

function ProgressionPanel(props: { skillId: number; unlocks: ProgressionUnlock[] }) {
    const label = useLabel();
    const {
        progressionHiddenTypes, setProgressionHiddenTypes,
        progressionTargetLevels, setProgressionTargetLevels
    } = useSettings();

    const enabled = createMemo(() => {
        const hidden = new Set(progressionHiddenTypes());
        return Object.fromEntries(ALL_PROGRESSION_KINDS.map(k => [k, !hidden.has(k)])) as Record<ProgressionUnlock["kind"], boolean>;
    });
    const setEnabled = (kind: ProgressionUnlock["kind"], checked: boolean) => {
        const hidden = new Set(progressionHiddenTypes());
        if (checked) hidden.delete(kind); else hidden.add(kind);
        setProgressionHiddenTypes(Array.from(hidden));
    };

    const totalLevel = createMemo(() => progressionTargetLevels()[props.skillId] ?? 100);
    const setTotalLevel = (v: number) => {
        setProgressionTargetLevels({...progressionTargetLevels(), [props.skillId]: v});
    };

    const rows = createMemo(() => {
        const byLevel = new Map<number, ProgressionUnlock[]>();
        for (const u of props.unlocks) {
            if (!enabled()[u.kind]) continue;
            const list = byLevel.get(u.level);
            if (list) list.push(u); else byLevel.set(u.level, [u]);
        }
        return Array.from(byLevel.entries()).sort((a, b) => a[0] - b[0]);
    });

    const hasStats = createMemo(() => props.unlocks.some(u => u.kind === "stat"));
    const totalStats = createMemo(() => consolidateStats(
        props.unlocks
            .filter((u): u is Extract<ProgressionUnlock, { kind: "stat" }> => u.kind === "stat" && u.level <= totalLevel())
            .map(u => u.stat)
    ));

    return (
        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-x-4 gap-y-1">
                <For each={PROGRESSION_CATEGORIES}>
                    {cat => (
                        <label class="flex items-center gap-1.5 text-sm">
                            <input
                                type="checkbox"
                                class="size-4 accent-primary"
                                checked={enabled()[cat.kind]}
                                onChange={e => setEnabled(cat.kind, e.currentTarget.checked)}
                            />
                            {label(cat.label)}
                        </label>
                    )}
                </For>
            </div>
            <Show when={enabled().stat && hasStats()}>
                <div class="overflow-auto rounded border">
                    <table class="w-full text-sm">
                        <thead class="bg-background border-b">
                            <tr>
                                <th class="text-left px-3 py-2 font-medium text-muted-foreground w-32">{label(gameText(msg`Level`))}</th>
                                <th class="text-left px-3 py-2 font-medium text-muted-foreground">{label(gameText(msg`Total`))}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="align-top">
                                <td class="px-3 py-2">
                                    <NumberField
                                        class="w-24"
                                        rawValue={totalLevel()}
                                        onRawValueChange={setTotalLevel}
                                        minValue={1}
                                    >
                                        <NumberFieldGroup>
                                            <NumberFieldInput class="h-8"/>
                                            <NumberFieldIncrementTrigger/>
                                            <NumberFieldDecrementTrigger/>
                                        </NumberFieldGroup>
                                    </NumberField>
                                </td>
                                <td class="px-3 py-2">
                                    <div class="flex flex-col gap-1">
                                        <For each={totalStats()}>{stat => <span class="inline-flex items-center gap-1">{statUnlockLine(stat)}</span>}</For>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Show>
            <div class="overflow-auto max-h-[90svh] rounded border">
                <table class="w-full text-sm">
                    <thead class="sticky top-0 z-10 bg-background border-b">
                        <tr>
                            <th class="text-left px-3 py-2 font-medium text-muted-foreground w-20">{label(gameText(msg`Level`))}</th>
                            <th class="text-left px-3 py-2 font-medium text-muted-foreground">{label(gameText(msg`Unlocks`))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={rows()} fallback={
                            <tr>
                                <td colspan={2} class="text-center py-4 text-muted-foreground"><Trans>No data</Trans></td>
                            </tr>
                        }>
                            {([level, unlocks]) => (
                                <tr class="border-b align-top">
                                    <td class="px-3 py-4 font-medium">{level}</td>
                                    <td class="px-3 py-4">
                                        <div class="flex flex-col gap-2">
                                            <For each={unlocks}>{u => <span class="inline-flex items-center gap-1">{renderUnlock(u)}</span>}</For>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function SkillDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SkillDesc);
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");

    const skill = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return skillIndex().get(id);
    });
    const skillTag = createMemo(() => {
        const s = skill();
        if (!s) return "Unknown";
        return skillCategoryLabel(s.skillCategory.tag);
    });
    const progressionUnlocks = createMemo(() => {
        const s = skill();
        return s ? progressionUnlocksForSkill(s.id) : [];
    });

    return (
        <DetailPageLayout
            title={skill()?.name ?? `Skill #${params.id}`}
            breadcrumbHref="/database/skill"
            breadcrumbTitle={skillTag()}
            loading={isLoading() && !skill()}
            name={skill()?.name ?? `Skill #${params.id}`}
            icon={<Show when={skill()?.iconAssetName}><SkillBanner skill={skill()!} class="size-16"/></Show>}
            description={skill()?.description}
            tag={skillTag()}
            metaKind="skill"
            metaImage={ogImageForCodepoint(skill()?.iconAssetName)}
            details={[
                {label: msg`Title`, value: skill()?.title},
                {label: msg`Max Level`, value: skill()?.maxLevel},
            ]}
            rawData={skill()}
            spacetimeTable={BitCraftTables.SkillDesc.spacetimeName}
            objectId={skill()?.id}
            chatLink={`(prof=${skill()?.id})`}
            tabs={[
                {
                    id: "progression",
                    label: gameText(msg`Progression`),
                    content: () => <ProgressionPanel skillId={skill()?.id ?? -1} unlocks={progressionUnlocks()}/>,
                },
            ]}
        />
    );
}
