/**
 * notification-sink.ts — turns a fired watch into a `notification` row on `brico-app`, for the Toast
 * sink. `event.watch.triggers` is the OR across all sinks, so this re-checks the filter's own
 * toast-sink trigger row.
 */
import {Identity} from "spacetimedb";
import type {MatchSink} from "../bridge.ts";
import type {Logger} from "../log.ts";
import {notificationsTotal, timeReducerCall} from "../metrics.ts";
import type {BricoAppConnection} from "./connection.ts";
import {findNotifyTrigger} from "./watch-source.ts";

export function createNotificationSink(app: BricoAppConnection, log: Logger): MatchSink {
    const scoped = log.child("notify");
    return event => {
        // File/default watches have no account — nothing to notify.
        if (event.watch.owner === null || event.watch.filterId === null) return;

        const conn = app.connection?.connection;
        if (!conn?.isActive) {
            scoped.warn("dropping notification: brico-app not live", {watch: event.watch.id, kind: event.kind});
            notificationsTotal.inc({sink: "toast", kind: event.kind, outcome: "dropped"});
            return;
        }

        const accountIdentity = Identity.fromString(event.watch.owner);
        const trigger = findNotifyTrigger(conn, accountIdentity, event.watch.filterId, sink => sink.tag === "Toast");
        // Not enabled for this transition kind on the toast sink: matched and logged, but no notification row.
        if (!trigger || !trigger[event.kind]) return;

        const craft = event.craft;
        timeReducerCall("post_craft_notification", conn.reducers.postCraftNotification({
            accountIdentity,
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
        })).then(() => {
            notificationsTotal.inc({sink: "toast", kind: event.kind, outcome: "ok"});
        }).catch(cause => {
            notificationsTotal.inc({sink: "toast", kind: event.kind, outcome: "failed"});
            scoped.error("post_craft_notification failed", {
                watch: event.watch.id,
                kind: event.kind,
                error: cause instanceof Error ? cause.message : String(cause),
            });
        });
    };
}
