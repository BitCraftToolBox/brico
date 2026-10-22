/**
 * A logged-in account's funding-alert settings: per-sink event flags and per-Discord-sink wording.
 * Not local-first: reads are the latest subscribed rows and writes are immediate reducer calls.
 * Subscribed only while the consuming page is mounted.
 */
import {tables} from "@brico/bindings/brico-app";
import type {DiscordFundingNotifyTarget, DiscordNotifySink, FundingNotifyTrigger} from "@brico/bindings/brico-app/types";
import type {FundingNotifyEvent} from "@brico/crafts/stelo";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {isServer} from "solid-js/web";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {type FundingFlags, resolveFundingFlags} from "~/lib/crafts/funding-notify-defaults";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/** `null` is the in-site toast sink; a string is a `discord_notify_sink.id`. */
export type FundingSinkId = string | null;

/** Per-event wording overrides for one Discord sink; a missing key means the default wording. */
export type FundingTemplates = Partial<Record<FundingNotifyEvent, string>>;

export interface FundingNotifySettings {
    lastError: Accessor<string | null>;
    /** The caller's own linked Discord sinks. */
    sinks: Accessor<DiscordNotifySink[]>;
    flagsFor: (sink: FundingSinkId) => FundingFlags;
    /** Writes an explicit trigger row for the sink with `event` set to `checked`. */
    setFlag: (sink: FundingSinkId, event: FundingNotifyEvent, checked: boolean) => void;
    templatesFor: (sinkId: string) => FundingTemplates;
    /** Stores one event's wording for a Discord sink; an empty value resets it to the default and turns the event off. */
    setTemplate: (sinkId: string, event: FundingNotifyEvent, value: string) => void;
    /** The bot-set mention for a Discord sink (the funding override, else the sink default); read-only. */
    mentionFor: (sinkId: string) => {name: string} | null;
}

/** Call once per mounted consumer — it owns one subscription. */
export function createFundingNotifySettings(): FundingNotifySettings {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const [lastError, setLastError] = createSignal<string | null>(null);
    const [sinks, setSinks] = createSignal<DiscordNotifySink[]>([]);
    const [triggers, setTriggers] = createSignal<FundingNotifyTrigger[]>([]);
    const [targets, setTargets] = createSignal<DiscordFundingNotifyTarget[]>([]);

    function refresh() {
        const active = conn.active();
        if (!active) return;
        setSinks(active.db.myDiscordNotifySink.iter().filter(s => s.deletedAt === undefined).toArray());
        setTriggers(active.db.myFundingNotifyTrigger.iter().filter(r => r.deletedAt === undefined).toArray());
        setTargets(active.db.myDiscordFundingNotifyTarget.iter().filter(r => r.deletedAt === undefined).toArray());
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing: see `discord-notify-settings.ts`.
        const request = untrack(() =>
            conn.requestResource(
                {
                    key: "funding-notify:self",
                    tables: [
                        bricoAppTable(tables.myDiscordNotifySink),
                        bricoAppTable(tables.myFundingNotifyTrigger),
                        bricoAppTable(tables.myDiscordFundingNotifyTarget),
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
        setTriggers([]);
        setTargets([]);
    }
    createEffect(() => {
        if (!isServer && acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    const triggerFor = (sink: FundingSinkId) => triggers().find(row =>
        sink === null ? row.sink.tag === "Toast" : row.sink.tag === "Discord" && row.sink.value.sinkId === sink);
    const targetFor = (sinkId: string) => targets().find(row => row.sinkId === sinkId);

    const flagsFor = (sink: FundingSinkId) => resolveFundingFlags(triggerFor(sink), sink === null ? "toast" : "discord");

    function setFlag(sink: FundingSinkId, event: FundingNotifyEvent, checked: boolean) {
        const active = conn.active();
        if (!active) return;
        active.reducers.upsertFundingNotifyTrigger({
            id: triggerFor(sink)?.id ?? crypto.randomUUID(),
            sink: sink === null ? {tag: "Toast", value: {}} : {tag: "Discord", value: {sinkId: sink}},
            ...flagsFor(sink),
            [event]: checked,
            updatedAt: Timestamp.fromDate(new Date()),
        }).catch(err => setLastError(describeServerError(err)));
    }

    const templatesFor = (sinkId: string): FundingTemplates => {
        const row = targetFor(sinkId);
        return row
            ? {fundingFailed: row.fundingFailedTemplate, payoutShortfall: row.payoutShortfallTemplate, unclaimed: row.unclaimedTemplate}
            : {};
    };

    function setTemplate(sinkId: string, event: FundingNotifyEvent, value: string) {
        const active = conn.active();
        if (!active) return;
        const trimmed = value.trim();
        const next: FundingTemplates = {...templatesFor(sinkId), [event]: trimmed.length > 0 ? trimmed : undefined};
        active.reducers.upsertDiscordFundingTargetTemplate({
            id: targetFor(sinkId)?.id ?? crypto.randomUUID(),
            discordSinkId: sinkId,
            fundingFailedTemplate: next.fundingFailed ?? "",
            payoutShortfallTemplate: next.payoutShortfall ?? "",
            unclaimedTemplate: next.unclaimed ?? "",
            updatedAt: Timestamp.fromDate(new Date()),
        }).catch(err => setLastError(describeServerError(err)));
        // An empty wording can't fire, so the event is turned off.
        if (trimmed.length === 0 && flagsFor(sinkId)[event]) setFlag(sinkId, event, false);
    }

    const mentionFor = (sinkId: string): {name: string} | null => {
        const name = targetFor(sinkId)?.mentionName ?? sinks().find(s => s.id === sinkId)?.defaultMentionName;
        return name ? {name} : null;
    };

    return {lastError, sinks, flagsFor, setFlag, templatesFor, setTemplate, mentionFor};
}
