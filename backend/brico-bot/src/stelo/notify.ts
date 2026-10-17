/**
 * notify.ts — funding alerts: a toast notification row and a Discord message per sink, for the events
 * a payer or payee can act on (a funding failure, a payout shortfall, unclaimed money moved).
 */
import type {DiscordNotifySink, FundingNotifyTrigger} from "@brico/bindings/brico-app/types";
import {CURRENCY_LABELS} from "@brico/crafts/currencies";
import {
    DEFAULT_FUNDING_NOTIFY_TEMPLATE,
    fundingEventOf,
    type FundingNotificationKind,
    type FundingNotifyEvent,
    MY_BOUNTIES_PATH,
    renderFundingTemplate,
} from "@brico/crafts/stelo";
import {DiscordAPIError, type REST} from "@discordjs/rest";
import {type RESTPostAPIChannelMessageJSONBody, Routes} from "discord-api-types/v10";
import type {Identity} from "spacetimedb";

import type {BricoAppConnection} from "../app/connection.ts";
import type {EscrowCache} from "../app/escrow-cache.ts";
import type {Logger} from "../log.ts";
import {notificationsTotal, timeReducerCall} from "../metrics.ts";
import {accountName, type PlayerNames} from "./names.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {FundingAlert, SteloWrites} from "./writes.ts";

/** What one alert is about; fields an event doesn't have stay unset. */
export interface FundingEvent {
    kind: FundingNotificationKind;
    role: "payer" | "payee";
    account: Identity;
    currency: string;
    craftId?: bigint;
    /** Whole units. */
    amount?: bigint;
    reason?: string;
    /** The Stelo account of the wallet the event concerns, shown as its `#ADDRESS`. */
    walletAccountId?: bigint;
    /** Unclaimed-money events: who owed the money and who it was owed to. */
    payer?: Identity;
    payeePlayerId?: bigint;
}

/** Kinds that report an ongoing problem; they post once per (account, currency, wallet) until the reason changes or `resolve` runs. */
const STANDING_KINDS: readonly FundingNotificationKind[] = ["funding-failed", "payout-shortfall"];

export interface FundingNotifier {
    /** Posts the alert, except a standing-problem kind whose reason is unchanged since it last posted. */
    notify(event: FundingEvent): void;
    /** The wallet is working again: the next failure of `kind` posts even with the same reason. */
    resolve(kind: FundingNotificationKind, account: Identity, currency: string, walletAccountId: bigint | undefined): void;
}

export interface FundingNotifierDeps {
    app: BricoAppConnection;
    escrow: EscrowCache;
    stelo: SteloReadModel;
    writes: SteloWrites;
    /** Absent when the Discord bot is not configured; only the toast sink is served then. */
    discord?: {rest: REST; frontendOrigin: string};
    /** Resolves party names; without it alerts carry none. */
    names?: PlayerNames;
    log: Logger;
}

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const isGone = (cause: unknown) => cause instanceof DiscordAPIError && (cause.status === 403 || cause.status === 404);

export function createFundingNotifier(deps: FundingNotifierDeps): FundingNotifier {
    const {app, escrow, stelo, writes, discord} = deps;
    const log = deps.log.child("funding-notify");
    // The reason each standing problem last posted with. In memory: a restart can post an unresolved problem once more.
    const standing = new Map<string, string>();
    const standingKey = (kind: FundingNotificationKind, account: Identity, currency: string, wallet: bigint | undefined) =>
        `${kind}:${account.toHexString()}:${currency}:${wallet ?? ""}`;

    function triggersOf(account: Identity): FundingNotifyTrigger[] {
        return [...escrow.state.fundingTriggers.values()].filter(trigger => trigger.accountIdentity.isEqual(account));
    }

    /** With no toast trigger row the toast sink is on for every event. */
    function toastEnabled(triggers: FundingNotifyTrigger[], event: FundingNotifyEvent): boolean {
        const explicit = triggers.find(trigger => trigger.sink.tag === "Toast");
        return explicit ? explicit[event] : true;
    }

    function partiesOf(event: FundingEvent): {payerName?: string; payeeName?: string} {
        return {
            payerName: event.payer ? accountName(app, deps.names, event.payer) : undefined,
            payeeName: event.payeePlayerId === undefined ? undefined : deps.names?.player(event.payeePlayerId),
        };
    }

    function toast(event: FundingEvent): void {
        const payload: FundingAlert = {
            kind: event.kind, role: event.role, currency: event.currency,
            craftId: event.craftId, amount: event.amount, reason: event.reason,
            payerName: undefined, payeeName: undefined, ...partiesOf(event),
        };
        writes.postFundingNotification(event.account, payload)
            .then(() => notificationsTotal.inc({sink: "toast", kind: event.kind, outcome: "ok"}))
            .catch(cause => {
                notificationsTotal.inc({sink: "toast", kind: event.kind, outcome: "failed"});
                log.error("post_funding_notification failed", {kind: event.kind, error: describe(cause)});
            });
    }

    function sinkOf(id: string, account: Identity): DiscordNotifySink | undefined {
        const conn = app.connection?.connection;
        if (!conn?.isActive) return undefined;
        for (const sink of conn.db.allDiscordNotifySink.iter()) {
            if (sink.id === id && sink.deletedAt === undefined && sink.accountIdentity.isEqual(account)) return sink;
        }
        return undefined;
    }

    async function sendDiscord(event: FundingEvent, trigger: FundingNotifyTrigger): Promise<void> {
        if (!discord || trigger.sink.tag !== "Discord") return;
        const sink = sinkOf(trigger.sink.value.sinkId, event.account);
        if (!sink) return;
        const target = [...escrow.state.fundingTargets.values()]
            .find(row => row.sinkId === sink.id && row.accountIdentity.isEqual(event.account));
        const key = fundingEventOf(event.kind);
        const stored = key === "fundingFailed" ? target?.fundingFailedTemplate
            : key === "payoutShortfall" ? target?.payoutShortfallTemplate : target?.unclaimedTemplate;

        const mentionType = target?.mentionType ?? sink.defaultMentionType;
        const mentionId = target?.mentionId ?? sink.defaultMentionId;
        const mentionText = mentionType && mentionId ? (mentionType === "user" ? `<@${mentionId}>` : `<@&${mentionId}>`) : null;
        const wallet = event.walletAccountId === undefined ? null : `#${stelo.account(event.walletAccountId)?.address ?? event.walletAccountId}`;
        const reason = event.kind === "unclaimed-rolled-over" ? "rolled-over" : event.kind === "unclaimed-returned" ? "returned" : (event.reason ?? null);
        const parties = partiesOf(event);
        const content = renderFundingTemplate(stored ?? DEFAULT_FUNDING_NOTIFY_TEMPLATE[key], {
            payer: parties.payerName ?? null,
            payee: parties.payeeName ?? null,
            currency: CURRENCY_LABELS[event.currency] ?? event.currency,
            amount: event.amount === undefined ? null : event.amount.toString(),
            craft: event.craftId === undefined ? null : `[Craft #${event.craftId}](<${discord.frontendOrigin}/tools/crafts/${event.craftId}>)`,
            bounties: `[My bounties](<${discord.frontendOrigin}${MY_BOUNTIES_PATH}>)`,
            wallet,
            reason,
            mentionText,
        });

        const body = {
            content,
            allowed_mentions: {
                parse: [],
                users: mentionType === "user" && mentionId ? [mentionId] : [],
                roles: mentionType === "role" && mentionId ? [mentionId] : [],
            },
        } satisfies RESTPostAPIChannelMessageJSONBody;

        try {
            await discord.rest.post(Routes.channelMessages(sink.channelId), {body});
            notificationsTotal.inc({sink: "discord", kind: event.kind, outcome: "ok"});
        } catch (cause) {
            notificationsTotal.inc({sink: "discord", kind: event.kind, outcome: isGone(cause) ? "detached" : "failed"});
            if (!isGone(cause)) {
                log.error("failed to post funding message", {sink: sink.id, error: describe(cause)});
                return;
            }
            log.warn("funding sink channel no longer accessible; removing sink", {sink: sink.id, channel: sink.channelId});
            const conn = app.connection?.connection;
            if (conn?.isActive) {
                await timeReducerCall("detach_discord_notify_sink", conn.reducers.detachDiscordNotifySink({id: sink.id}))
                    .catch(detachCause => log.error("detach_discord_notify_sink failed", {sink: sink.id, error: describe(detachCause)}));
            }
        }
    }

    return {
        resolve(kind, account, currency, walletAccountId) {
            standing.delete(standingKey(kind, account, currency, walletAccountId));
        },
        notify(event) {
            if (STANDING_KINDS.includes(event.kind)) {
                const id = standingKey(event.kind, event.account, event.currency, event.walletAccountId);
                if (standing.get(id) === (event.reason ?? "")) return;
                standing.set(id, event.reason ?? "");
            }
            const key = fundingEventOf(event.kind);
            const triggers = triggersOf(event.account);
            if (toastEnabled(triggers, key)) toast(event);
            for (const trigger of triggers) {
                if (trigger.sink.tag !== "Discord" || !trigger[key]) continue;
                sendDiscord(event, trigger).catch(cause => log.error("funding notification failed", {error: describe(cause)}));
            }
        },
    };
}
