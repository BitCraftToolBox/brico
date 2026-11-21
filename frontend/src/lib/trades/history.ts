/**
 * history.ts — a sale feed that shows the last 24h and switches to the full history on demand.
 */
import type {TradeEvent} from "@brico/bindings/prism/types";
import {type Accessor, createEffect, createSignal, on} from "solid-js";
import {createTradeHistory, type HistoryScope} from "~/lib/trades/relay";

export interface EventFeed {
    events: Accessor<TradeEvent[]>;
    /** Full history is requested and has arrived. */
    loaded: Accessor<boolean>;
    loading: Accessor<boolean>;
    load: () => void;
}

/** `scope` must be stable per shop/claim (a memo): a new value drops any loaded history. */
export function createEventFeed(scope: Accessor<HistoryScope | null>, recent: Accessor<TradeEvent[]>): EventFeed {
    const [requested, setRequested] = createSignal<HistoryScope | null>(null);
    createEffect(on(scope, () => setRequested(null), {defer: true}));
    const history = createTradeHistory(requested);
    const loaded = () => requested() !== null && history.ready();
    return {
        events: () => (loaded() ? history.snapshot() : recent()),
        loaded,
        loading: () => requested() !== null && !history.ready(),
        load: () => setRequested(scope()),
    };
}
