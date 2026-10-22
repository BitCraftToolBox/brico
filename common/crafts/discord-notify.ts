/** Default notification wording, used by the bot when a `discord_notify_target` has no custom template for an event. */
import type {TriggerKind} from './watch';

/** Default per-event templates; `{mention}` is notification-only, the rest are `renderDiscordTemplate` tokens. */
export const DEFAULT_NOTIFY_TEMPLATE: Record<TriggerKind, string> = {
    added: '{mention} {filterName}: **{craft:name}** now matches. {link}',
    finished: '{mention} {filterName}: **{craft:name}** finished. {link}',
    removed: '{mention} {filterName}: **{craft:name}** no longer matches. {link}',
};
