import {type Accessor, createMemo, Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import type {ConnectionStatus} from "~/lib/spacetime/connection";

export interface ConnectionLike {
    status: Accessor<ConnectionStatus>;
    error: Accessor<string | null>;
}

type CombinedStatus = "error" | "syncing" | "live";

/**
 * One combined status pill for however many live connections a page depends on — the same
 * closed/error/pending/live reduction as `Nav.tsx`'s `overallConnectionStatus`, but scoped to this
 * page's own connections (not every connection the app holds) and surfacing the first connection's
 * error text rather than a hover list. `closed` is filtered out first, same reasoning as there: a
 * connection held but never opened, or explicitly closed, isn't "trying to connect" and must not
 * make the badge look permanently stuck; when every connection is closed the badge hides entirely.
 */
export function ConnectionStatusBadge(props: {connections: ConnectionLike[]}) {
    const relevant = createMemo(() => props.connections.filter(c => c.status() !== "closed"));
    const combined = createMemo<CombinedStatus | null>(() => {
        const conns = relevant();
        if (conns.length === 0) return null;
        if (conns.some(c => c.status() === "error")) return "error";
        if (conns.some(c => c.status() !== "live")) return "syncing";
        return "live";
    });
    const firstError = createMemo(() => relevant().find(c => c.error())?.error() ?? null);

    return (
        <Show when={combined()}>
            {status => (
                <>
                    <Show when={firstError()}>
                        {message => <span class="text-sm text-error">{message()}</span>}
                    </Show>
                    <Badge variant={status() === "live" ? "default" : status() === "error" ? "error" : "secondary"}>{status()}</Badge>
                </>
            )}
        </Show>
    );
}
