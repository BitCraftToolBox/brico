/**
 * A logged-in account's comment-notification setting: whether a reply to their comment shows a toast.
 * Not local-first: reads are the latest subscribed row and writes are immediate reducer calls.
 * Subscribed only while the consuming page is mounted.
 */
import {tables} from "@brico/bindings/brico-app";
import type {CommentNotifyTrigger} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {isServer} from "solid-js/web";
import {Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface CommentNotifySettings {
    lastError: Accessor<string | null>;
    /** Reply toasts are on unless the account has an explicit trigger row turning them off. */
    replyToast: Accessor<boolean>;
    setReplyToast: (checked: boolean) => void;
}

/** Call once per mounted consumer, shares a subscription. */
export function createCommentNotifySettings(): CommentNotifySettings {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const [lastError, setLastError] = createSignal<string | null>(null);
    const [trigger, setTrigger] = createSignal<CommentNotifyTrigger>();

    function refresh() {
        const active = conn.active();
        if (!active) return;
        setTrigger(active.db.myCommentNotifyTrigger.iter().find(r => r.deletedAt === undefined && r.sink.tag === "Toast"));
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing: see `discord-notify-settings.ts`.
        const request = untrack(() =>
            conn.requestResource({key: "comment-notify:self", tables: [bricoAppTable(tables.myCommentNotifyTrigger)]}, refresh)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setTrigger(undefined);
    }
    createEffect(() => {
        if (!isServer && acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    const replyToast = () => trigger()?.reply ?? true;

    function setReplyToast(checked: boolean) {
        const active = conn.active();
        if (!active) return;
        active.reducers.upsertCommentNotifyTrigger({
            id: trigger()?.id ?? crypto.randomUUID(),
            sink: {tag: "Toast", value: {}},
            reply: checked,
            updatedAt: Timestamp.fromDate(new Date()),
        }).catch(err => setLastError(describeServerError(err)));
    }

    return {lastError, replyToast, setReplyToast};
}
