/**
 * A logged-in account's Discord notification settings: linked sinks, per-filter trigger checkboxes and
 * per-sink wording templates. Not local-first (unlike `filter-sync.tsx`): reads are the latest subscribed
 * rows and writes are immediate reducer calls. Subscribed only while the consuming page is mounted.
 */
import {tables} from "@brico/bindings/brico-app";
import type {CraftFilterNotifyTrigger, DiscordNotifySink, DiscordNotifyTarget} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {isServer} from "solid-js/web";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {type CraftWatchTriggers} from "~/lib/settings";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const NO_TRIGGERS: CraftWatchTriggers = {added: false, finished: false, removed: false};

/** Per-event template overrides for one (filter, Discord sink) pair; a missing key means the bot's default wording. */
export type DiscordNotifyTemplates = {
    addedTemplate?: string;
    finishedTemplate?: string;
    removedTemplate?: string;
};

export interface DiscordNotifySettings {
    /** Message from the most recent failed write, if any. */
    lastError: Accessor<string | null>;
    /** The caller's own linked Discord notification sinks. */
    discordNotifySinks: Accessor<DiscordNotifySink[]>;
    /** The bot-set mention for one (filter, sink) pair (pair override, else the sink default); read-only. */
    discordMentionFor: (filterId: string, sinkId: string) => {name: string} | null;
    /** Current trigger state for one (filter, Discord sink) pair. */
    discordTriggersFor: (filterId: string, sinkId: string) => CraftWatchTriggers;
    /** Calls `upsertCraftFilterNotifyTrigger`/`detachCraftFilterNotifyTrigger` directly. */
    setDiscordTrigger: (filterId: string, sinkId: string, next: CraftWatchTriggers) => void;
    /** Current wording overrides for one (filter, Discord sink) pair. */
    discordTemplatesFor: (filterId: string, sinkId: string) => DiscordNotifyTemplates;
    /** Calls `upsertDiscordNotifyTargetTemplate`/`detachDiscordNotifyTarget` directly. */
    setDiscordTemplate: (filterId: string, sinkId: string, next: DiscordNotifyTemplates) => void;
    /** Calls `detachDiscordNotifySink`, tombstoning the sink for every filter. Rejects on a failed reducer call instead of setting `lastError`. */
    unlinkDiscordSink: (sinkId: string) => Promise<void>;
}

/** Call once per mounted consumer (not once per filter row) — it owns one subscription. */
export function createDiscordNotifySettings(): DiscordNotifySettings {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const [lastError, setLastError] = createSignal<string | null>(null);
    const [sinks, setSinks] = createSignal<DiscordNotifySink[]>([]);
    const [targetRows, setTargetRows] = createSignal<DiscordNotifyTarget[]>([]);
    const [triggerRows, setTriggerRows] = createSignal<CraftFilterNotifyTrigger[]>([]);

    function refresh() {
        const active = conn.active();
        if (!active) return;
        setSinks(active.db.myDiscordNotifySink.iter().filter(s => s.deletedAt === undefined).toArray());
        setTargetRows(active.db.myDiscordNotifyTarget.iter().filter(t => t.deletedAt === undefined).toArray());
        setTriggerRows(active.db.myCraftFilterNotifyTrigger.iter().filter(r => r.deletedAt === undefined && r.sink.tag === "Discord").toArray());
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing: `conn.requestResource` reads the resource's own `ready` signal,
        // which would otherwise become a dependency of the calling effect and re-run it.
        const request = untrack(() =>
            conn.requestResource(
                {
                    key: "discord-notify:self",
                    tables: [
                        bricoAppTable(tables.myDiscordNotifySink),
                        bricoAppTable(tables.myDiscordNotifyTarget),
                        bricoAppTable(tables.myCraftFilterNotifyTrigger),
                    ],
                },
                refresh,
            )
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setSinks([]);
        setTargetRows([]);
        setTriggerRows([]);
    }

    createEffect(() => {
        if (!isServer && acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    const discordMentionFor = (filterId: string, sinkId: string): {name: string} | null => {
        const target = targetRows().find(t => t.filterId === filterId && t.sinkId === sinkId);
        const sink = sinks().find(s => s.id === sinkId);
        const name = target?.mentionName ?? sink?.defaultMentionName;
        return name ? {name} : null;
    };

    const findTriggerRow = (filterId: string, sinkId: string): CraftFilterNotifyTrigger | undefined =>
        triggerRows().find(row => row.filterId === filterId && (row.sink as {tag: "Discord"; value: {sinkId: string}}).value.sinkId === sinkId);

    const discordTriggersFor = (filterId: string, sinkId: string): CraftWatchTriggers => {
        const row = findTriggerRow(filterId, sinkId);
        return row ? {added: row.added, finished: row.finished, removed: row.removed} : NO_TRIGGERS;
    };

    const setDiscordTrigger = (filterId: string, sinkId: string, next: CraftWatchTriggers) => {
        const active = conn.active();
        if (!active) return;
        const existing = findTriggerRow(filterId, sinkId);
        const updatedAt = Timestamp.fromDate(new Date());
        const call = (next.added || next.finished || next.removed)
            ? active.reducers.upsertCraftFilterNotifyTrigger({
                id: existing?.id ?? crypto.randomUUID(),
                filterId,
                sink: {tag: "Discord", value: {sinkId}},
                added: next.added,
                finished: next.finished,
                removed: next.removed,
                updatedAt,
            })
            : existing
                ? active.reducers.detachCraftFilterNotifyTrigger({id: existing.id, deletedAt: updatedAt})
                : null;
        call?.catch(err => setLastError(describeServerError(err)));
    };

    const discordTemplatesFor = (filterId: string, sinkId: string): DiscordNotifyTemplates => {
        const row = targetRows().find(t => t.filterId === filterId && t.sinkId === sinkId);
        return row ? {addedTemplate: row.addedTemplate, finishedTemplate: row.finishedTemplate, removedTemplate: row.removedTemplate} : {};
    };

    const setDiscordTemplate = (filterId: string, sinkId: string, next: DiscordNotifyTemplates) => {
        const active = conn.active();
        if (!active) return;
        const existing = targetRows().find(t => t.filterId === filterId && t.sinkId === sinkId);
        const updatedAt = Timestamp.fromDate(new Date());
        const hasAny = !!(next.addedTemplate || next.finishedTemplate || next.removedTemplate);
        const call = hasAny
            ? active.reducers.upsertDiscordNotifyTargetTemplate({
                id: existing?.id ?? crypto.randomUUID(),
                filterId,
                discordSinkId: sinkId,
                addedTemplate: next.addedTemplate ?? "",
                finishedTemplate: next.finishedTemplate ?? "",
                removedTemplate: next.removedTemplate ?? "",
                updatedAt,
            })
            : existing
                ? active.reducers.detachDiscordNotifyTarget({id: existing.id, deletedAt: updatedAt})
                : null;
        call?.catch(err => setLastError(describeServerError(err)));
    };

    async function unlinkDiscordSink(sinkId: string): Promise<void> {
        const active = conn.active();
        if (!active) return;
        await active.reducers.detachDiscordNotifySink({id: sinkId});
    }

    return {
        lastError, discordNotifySinks: sinks, discordMentionFor,
        discordTriggersFor, setDiscordTrigger,
        discordTemplatesFor, setDiscordTemplate,
        unlinkDiscordSink,
    };
}
