/**
 * Reusable RelTable presets for common relationship patterns.
 * Each preset defines typed columns that can be shared across detail pages.
 */

import {BuffEffect, CombatActionDesc, CsvStatEntry, SecondaryKnowledgeDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useNavigate} from "@solidjs/router";
import {Component} from "solid-js";
import {RelTable, RelTableColumn} from "~/components/shared/DetailPageLayout";
import {BitCraftTables} from "~/lib/bitcraft-data.ts";
import {BuffLink, CombatActionLink, KnowledgeLink} from "~/lib/game-links";
import {statLabel} from "~/lib/game-strings";
import {StatPillList} from "~/lib/table-utils/stats-column-builder.tsx";
import {fixFloat, readableSeconds} from "~/lib/utils";

// ─── Stat Entry Table ───────────────────────────────────────────

const statColumns: RelTableColumn<CsvStatEntry>[] = [
    {header: msg`Stat`, cell: (row) => <span>{statLabel(row.id?.tag)}</span>},
    {header: msg`Value`, cell: (row) => <span>{fixFloat(row.value * (row.isPct ? 100 : 1))}{row.isPct ? "%" : ""}</span>},
];

export const StatTable: Component<{ data: CsvStatEntry[] }> = (props) => (
    <RelTable<CsvStatEntry> data={props.data} columns={statColumns}/>
);

// ─── Knowledge Table ────────────────────────────────────────────

const knowledgeColumns: RelTableColumn<SecondaryKnowledgeDesc>[] = [
    {header: msg`Knowledge`, cell: (row) => <KnowledgeLink id={row.id} name={row.name}/>},
];

export const KnowledgeTable: Component<{ data: SecondaryKnowledgeDesc[] }> = (props) => (
    <RelTable<SecondaryKnowledgeDesc> data={props.data} columns={knowledgeColumns}/>
);

// ─── Buff Effect Table ──────────────────────────────────────────

interface BuffEffectWithLabel extends BuffEffect {
    label: string;
}

const buffColumns: RelTableColumn<BuffEffectWithLabel>[] = [
    {header: msg`Buff`, cell: (row) => <BuffLink buffId={row.buffId} label={row.label ?? `Buff #${row.buffId}`}/>},
    {header: msg`Duration`, cell: (row) => <span>{row.duration != null ? readableSeconds(fixFloat(row.duration)) : "∞"}</span>},
    {header: msg`Stats`, cell: (row) => {
        const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
        const stats = buffIdx.get(row.buffId)?.stats ?? [];
        if (!stats?.length) return;
        return <StatPillList stats={stats}/>;
    }}
];

export const BuffTable: Component<{ data: BuffEffectWithLabel[] }> = (props) => (
    <RelTable<BuffEffectWithLabel> data={props.data} columns={buffColumns}/>
);

// ─── Combat Action Table ────────────────────────────────────────

export const CombatActionTable: Component<{ data: CombatActionDesc[] }> = (props) => {
    const navigate = useNavigate();
    return (
        <RelTable<CombatActionDesc>
            data={props.data}
            columns={[
                {header: msg`Name`, cell: (row) => <CombatActionLink id={row.id} name={row.name} iconAssetName={row.iconAssetName}/>},
                {header: msg`Range`, cell: (row) => <span>{row.maxRange}</span>},
                {header: msg`Cooldown`, cell: (row) => <span>{fixFloat(row.cooldown)}</span>},
                {header: msg`Strength`, cell: (row) => <span>{fixFloat(row.strengthMultiplier)}x</span>},
                {header: msg`Stamina`, cell: (row) => <span>{fixFloat(row.staminaUse)}</span>},
            ]}
            onRowClick={(row) => navigate(`/database/combat/${row.id}`)}
        />
    );
};
