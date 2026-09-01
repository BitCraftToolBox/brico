/**
 * notification-sink.ts — turns a fired watch into a `notification` row on `brico-app`.
 */
import {Identity} from "spacetimedb";
import type {MatchSink} from "../bridge.ts";
import type {Logger} from "../log.ts";
import {timeReducerCall} from "../metrics.ts";
import type {BricoAppConnection} from "./connection.ts";

export function createNotificationSink(app: BricoAppConnection, log: Logger): MatchSink {
    const scoped = log.child("notify");
    return event => {
        // File/default watches have no account — nothing to notify.
        if (event.watch.owner === null || event.watch.filterId === null) return;
        // The user didn't ask to be notified about this transition kind for this watch — the
        // bridge still matched and logged it (useful for debugging what the filter matches), but
        // it must not become a `notification` row. Same gate the frontend's own local watch
        // runner (`~/lib/crafts/watches.ts`) applies before calling `onNotify`.
        if (!event.watch.triggers[event.kind]) return;

        const conn = app.connection?.connection;
        if (!conn?.isActive) {
            scoped.warn("dropping notification: brico-app not live", {watch: event.watch.id, kind: event.kind});
            return;
        }

        const craft = event.craft;
        timeReducerCall("post_craft_notification", conn.reducers.postCraftNotification({
            accountIdentity: Identity.fromString(event.watch.owner),
            payload: {
                watchId: event.watch.filterId,
                filterName: event.watch.name,
                eventKind: event.kind,
                craftId: event.craftId,
                recipeId: craft?.recipeId ?? -1,
                regionName: craft?.regionName ?? "Unknown region",
                claimName: craft?.claimName ?? undefined,
                ownerName: craft?.ownerName ?? undefined,
            },
        })).catch(cause => {
            scoped.error("post_craft_notification failed", {
                watch: event.watch.id,
                kind: event.kind,
                error: cause instanceof Error ? cause.message : String(cause),
            });
        });
    };
}
