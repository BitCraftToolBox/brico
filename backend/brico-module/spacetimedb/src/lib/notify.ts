import {CraftError} from '@brico/crafts/errors';
import type {Identity} from 'spacetimedb';
import type {Infer} from 'spacetimedb/server';
import {SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';
import type {NotifySinkRef} from '../tables/notify';

type Sink = Infer<typeof NotifySinkRef>;

/** Throws unless a Discord `sink` is one of `account`'s live notification sinks; a toast sink always passes. */
export function requireOwnDiscordSink(ctx: Ctx, account: Identity, sink: Sink): void {
    if (sink.tag !== 'discord') return;
    const discordSink = ctx.db.discord_notify_sink.id.find(sink.value.sinkId);
    if (discordSink === null || !discordSink.accountIdentity.isEqual(account) || discordSink.deletedAt !== undefined) {
        throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
    }
}

/** `account`'s live funding trigger for `sink`, if any. */
export function findFundingTrigger(ctx: Ctx, account: Identity, sink: Sink) {
    for (const row of ctx.db.funding_notify_trigger.accountIdentity.filter(account)) {
        if (row.deletedAt !== undefined || row.sink.tag !== sink.tag) continue;
        if (row.sink.tag === 'discord' && sink.tag === 'discord' && row.sink.value.sinkId !== sink.value.sinkId) continue;
        return row;
    }
    return null;
}
