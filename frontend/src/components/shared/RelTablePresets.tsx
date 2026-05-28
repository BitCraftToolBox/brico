/**
 * Reusable RelTable presets for common relationship patterns.
 * Each preset defines typed columns that can be shared across detail pages.
 */

import {useNavigate} from "@solidjs/router";
import {Component} from "solid-js";
import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {CombatActionDescV2} from "~/bindings/src/combat_action_desc_v_2_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {InputItemStack} from "~/bindings/src/input_item_stack_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ProbabilisticItemStack} from "~/bindings/src/probabilistic_item_stack_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {RelTable, RelTableColumn} from "~/components/shared/DetailPageLayout";
import {ItemStackIcon, ProbItemStackIcon} from "~/components/shared/ItemStacks";
import {AchievementLink, BuffLink, CombatActionLink, KnowledgeLink} from "~/lib/game-links";
import {fixFloat, splitCamelCase} from "~/lib/utils";

// ─── Item Stack Table ───────────────────────────────────────────

const itemStackColumns: RelTableColumn<ItemStack>[] = [
    {header: "Item", cell: (row) => <ItemStackIcon stack={row} small/>},
    {header: "Qty", cell: (row) => <span>{row.quantity}</span>},
];

export const ItemStackTable: Component<{ data: ItemStack[] }> = (props) => (
    <RelTable<ItemStack> data={props.data} columns={itemStackColumns}/>
);

// ─── Input Item Stack Table (includes consumption chance) ───────

const inputItemStackColumns: RelTableColumn<InputItemStack>[] = [
    {header: "Item", cell: (row) => <ItemStackIcon stack={row} small/>},
    {header: "Qty", cell: (row) => <span>{row.quantity}</span>},
    {header: "Consumption", cell: (row) => <span>{fixFloat(row.consumptionChance * 100)}%</span>},
];

export const InputItemStackTable: Component<{ data: InputItemStack[] }> = (props) => (
    <RelTable<InputItemStack> data={props.data} columns={inputItemStackColumns}/>
);

// ─── Probabilistic Item Stack Table ─────────────────────────────

const probItemStackColumns: RelTableColumn<ProbabilisticItemStack>[] = [
    {header: "Item", cell: (row) => row.itemStack ? <ProbItemStackIcon probStack={row} small/> : <span>—</span>},
    {header: "Qty", cell: (row) => <span>{row.itemStack?.quantity ?? "—"}</span>},
    {header: "Probability", cell: (row) => <span>{fixFloat(row.probability * 100)}%</span>},
];

export const ProbItemStackTable: Component<{ data: ProbabilisticItemStack[] }> = (props) => (
    <RelTable<ProbabilisticItemStack> data={props.data} columns={probItemStackColumns}/>
);

// ─── Stat Entry Table ───────────────────────────────────────────

const statColumns: RelTableColumn<CsvStatEntry>[] = [
    {header: "Stat", cell: (row) => <span>{splitCamelCase(row.id?.tag ?? "")}</span>},
    {header: "Value", cell: (row) => <span>{fixFloat(row.value * (row.isPct ? 100 : 1))}{row.isPct ? "%" : ""}</span>},
];

export const StatTable: Component<{ data: CsvStatEntry[] }> = (props) => (
    <RelTable<CsvStatEntry> data={props.data} columns={statColumns}/>
);

// ─── Knowledge Table ────────────────────────────────────────────

const knowledgeColumns: RelTableColumn<SecondaryKnowledgeDesc>[] = [
    {header: "Knowledge", cell: (row) => <KnowledgeLink id={row.id} name={row.name}/>},
];

export const KnowledgeTable: Component<{ data: SecondaryKnowledgeDesc[] }> = (props) => (
    <RelTable<SecondaryKnowledgeDesc> data={props.data} columns={knowledgeColumns}/>
);

// ─── Buff Effect Table ──────────────────────────────────────────

interface BuffEffectWithLabel extends BuffEffect {
    label: string;
}

const buffColumns: RelTableColumn<BuffEffectWithLabel>[] = [
    {header: "Buff", cell: (row) => <BuffLink buffId={row.buffId} label={row.label ?? `Buff #${row.buffId}`}/>},
    {header: "Duration", cell: (row) => <span>{row.duration != null ? `${fixFloat(row.duration)}s` : "∞"}</span>},
];

export const BuffTable: Component<{ data: BuffEffectWithLabel[] }> = (props) => (
    <RelTable<BuffEffectWithLabel> data={props.data} columns={buffColumns}/>
);

// ─── Achievement Table ──────────────────────────────────────────

export const AchievementTable: Component<{ data: AchievementDesc[] }> = (props) => {
    const navigate = useNavigate();
    return (
        <RelTable<AchievementDesc>
            data={props.data}
            columns={[
                {header: "Achievement", cell: (row) => <AchievementLink id={row.id} name={row.name}/>},
                {header: "Points", cell: (row) => <span>{row.pointsReward}</span>},
            ]}
            onRowClick={(row) => navigate(`/database/achievement/${row.id}`)}
        />
    );
};

// ─── Combat Action Table ────────────────────────────────────────

export const CombatActionTable: Component<{ data: CombatActionDescV2[] }> = (props) => {
    const navigate = useNavigate();
    return (
        <RelTable<CombatActionDescV2>
            data={props.data}
            columns={[
                {header: "Name", cell: (row) => <CombatActionLink id={row.id} name={row.name} codepoint={row.iconAssetName}/>},
                {header: "Range", cell: (row) => <span>{row.maxRange}</span>},
                {header: "Cooldown", cell: (row) => <span>{fixFloat(row.cooldown)}</span>},
                {header: "Strength", cell: (row) => <span>{fixFloat(row.strengthMultiplier)}x</span>},
                {header: "Stamina", cell: (row) => <span>{fixFloat(row.staminaUse)}</span>},
            ]}
            onRowClick={(row) => navigate(`/database/combat/${row.id}`)}
        />
    );
};
