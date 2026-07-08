/**
 * Reusable RelTable presets for common relationship patterns.
 * Each preset defines typed columns that can be shared across detail pages.
 */

import {useNavigate} from "@solidjs/router";
import {Component} from "solid-js";
import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {RelTable, RelTableColumn} from "~/components/shared/DetailPageLayout";
import {AchievementLink, BuffLink, CombatActionLink, KnowledgeLink} from "~/lib/game-links";
import {fixFloat, splitCamelCase} from "~/lib/utils";

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

export const CombatActionTable: Component<{ data: CombatActionDesc[] }> = (props) => {
    const navigate = useNavigate();
    return (
        <RelTable<CombatActionDesc>
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
