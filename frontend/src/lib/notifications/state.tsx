/**
 * state.tsx — the `brico-app`-specific consumer of the generic connection layer, for notifications.
 *
 * **Avoiding double notification.** The craft browser's own local watch runner
 * (`~/lib/crafts/watches.ts`) already toasts a transition the instant it sees it, entirely
 * client-side. The same transition also reaches this provider a little later, as a real
 * `my_notification` row inserted by `brico-bot` via the server round trip. Without help, that would
 * count as a second, unread notification for something the user was just shown. `browse.tsx`'s
 * `notifyWatch` calls `suppressLocal` at the exact moment it shows its own toast; this provider
 * then recognizes the matching row when it arrives and immediately marks it read instead of
 * counting it as unread. This only works because `craft_filter_watch.filterId` is the same string
 * the frontend's local `SavedCraftFilter.id` uses — `payload.watchId` on a `craft` notification is
 * exactly that id.
 */
import {tables} from "@brico/bindings/brico-app";
import type {Notification} from "@brico/bindings/brico-app/types";
import {A, useLocation} from "@solidjs/router";
import {createContext, createEffect, createMemo, createSignal, type JSX, untrack, useContext,} from "solid-js";
import {showToast} from "~/components/ui/toast";
import {useAccount} from "~/lib/account/state";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {getCraftingRecipeName} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/**
 * Comfortably longer than the bridge's snapshot interval + round trip (a watch match to a
 * `notification` row landing here), so a suppression set right when the local toast fires is still
 * live by the time the server-side notification for the same transition arrives.
 */
const SUPPRESS_LOCAL_TTL_MS = 15_000;

/**
 * The de-dup key a `Craft` notification and `browse.tsx`'s local watch runner agree on.
 */
function suppressKeyFor(row: Notification): string | null {
    if (row.payload.tag !== "Craft") return null;
    const {watchId, craftId, eventKind} = row.payload.value;
    return `${watchId}:${craftId}:${eventKind}`;
}

/** Pages that already run their own local watch runner and toast a match the instant it fires —
 * a same-transition server notification always toasts here too, regardless of the site-wide
 * "toast everywhere" setting, so the craft pages never look like they're missing a beat. */
function isAlwaysToastPath(pathname: string): boolean {
    return pathname.startsWith("/tools/crafts");
}

/** Same wording `browse.tsx`'s `TRIGGER_VERB` uses, for the inbox's server-delivered toast. */
const EVENT_VERB: Record<string, string> = {
    added: "now matches",
    finished: "finished crafting",
    removed: "no longer matches",
};

function recipeNameFor(recipeId: number): string {
    const recipe = BitCraftTables.CraftingRecipeDesc.indexedBy("id")().get(recipeId);
    return recipe ? getCraftingRecipeName(recipe) : `Recipe #${recipeId}`;
}

/** Toasts one `Craft` notification, styled like `browse.tsx`'s own `notifyWatch`. */
function toastForCraftNotification(row: Notification, onDismiss: () => void) {
    if (row.payload.tag !== "Craft") return;
    const value = row.payload.value;
    showToast({
        title: () => value.filterName,
        description: () => (
            <>
                <A href={`/tools/crafts/${value.craftId}`} class="underline">{recipeNameFor(value.recipeId)}</A>
                {" "}{EVENT_VERB[value.eventKind] ?? value.eventKind}
            </>
        ),
        variant: value.eventKind === "removed" ? "default" : "success",
        // Arrives passively, not from something the user just did — see `ShowToastOptions.priority`.
        priority: "low",
        onDismiss,
    });
}

export interface NotificationsContextValue {
    /** The caller's own notifications, read and unread, newest first. */
    notifications: () => Notification[];
    unreadCount: () => number;
    markRead: (id: bigint) => void;
    markAllRead: () => void;
    remove: (id: bigint | bigint[]) => void;
    /**
     * Call when a local (client-side-only) watch transition is already shown to the user.
     */
    suppressLocal: (key: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue>();

export function NotificationsProvider(props: {children: JSX.Element}) {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const {notifyToastEverywhere} = useSettings();
    const location = useLocation();

    const [notifications, setNotifications] = createSignal<Notification[]>([]);

    // Local-only bookkeeping — never persisted, never read outside this provider.
    const suppressed = new Map<string, number>();
    let previousIds = new Set<string>();

    function markRead(id: bigint) {
        const active = conn.active();
        if (!active) return;
        active.reducers.markNotificationRead({id}).catch(() => {});
    }

    function readRows() {
        const active = conn.active();
        if (!active) {
            setNotifications([]);
            previousIds = new Set();
            return;
        }
        const rows = [...active.db.myNotification.iter()] as Notification[];
        const currentIds = new Set(rows.map(row => row.id.toString()));

        // Only rows that are genuinely new since the last snapshot can be a local watch's
        // just-shown transition arriving late — an already-known row was already accounted for,
        // and toasting it again (or re-evaluating suppression against it) would be wrong.
        const alwaysToast = isAlwaysToastPath(location.pathname);
        for (const row of rows) {
            const idKey = row.id.toString();
            if (previousIds.has(idKey) || row.readAt !== undefined) continue;

            const key = suppressKeyFor(row);
            const expiry = key !== null ? suppressed.get(key) : undefined;
            if (key !== null && expiry !== undefined) {
                suppressed.delete(key);
                if (expiry >= Date.now()) {
                    markRead(row.id);
                    continue;
                }
            }

            if (alwaysToast || notifyToastEverywhere()) {
                toastForCraftNotification(row, () => markRead(row.id));
            }
        }

        previousIds = currentIds;
        setNotifications([...rows].sort((a, b) => Number(b.createdAt.toMillis() - a.createdAt.toMillis())));
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing here — see `filter-sync.tsx`'s `subscribe()` doc comment for
        // the exact failure mode (an early-applied subscription's `ready` flip re-scheduling this
        // effect and releasing the very resource just requested) that not doing this causes.
        const request = untrack(() =>
            conn.requestResource(
                {key: "notifications:self", tables: [bricoAppTable(tables.myNotification)]},
                readRows,
            )
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setNotifications([]);
        previousIds = new Set();
    }

    // Login transition — `acc.isLoggedIn()` is a `createMemo` at the source, so this only re-runs
    // on the actual boolean flip (see `account/state.tsx`'s doc comment on `account`).
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    const unreadCount = createMemo(() => notifications().filter(n => n.readAt === undefined).length);

    function markAllRead() {
        const active = conn.active();
        if (!active) return;
        active.reducers.markAllNotificationsRead({}).catch(() => {});
    }

    function remove(id: bigint | bigint[]) {
        const active = conn.active();
        if (!active) return;
        active.reducers.deleteNotification({ids: Array.isArray(id) ? id : [id]}).catch(() => {});
    }

    function suppressLocal(key: string) {
        suppressed.set(key, Date.now() + SUPPRESS_LOCAL_TTL_MS);
    }

    const value: NotificationsContextValue = {
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        remove,
        suppressLocal,
    };

    return <NotificationsContext.Provider value={value}>{props.children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
    const value = useContext(NotificationsContext);
    if (!value) throw new Error("useNotifications: no NotificationsProvider above this component.");
    return value;
}
