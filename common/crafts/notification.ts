/**
 * Notification payload shapes stored as JSON in `notification_v2.payloadJson` (`{tag, value}`),
 * and the tolerant reader the frontend uses. `u64`/`i64` fields travel as decimal strings.
 */

/** A craft-sourced notification (`tag: "craft"`). */
export interface CraftNotificationPayload {
    /** `craft_filter_watch.filterId` at fire time — a loose join key, not an FK. */
    watchId: string;
    filterName: string;
    /** 'added' | 'finished' | 'removed'. */
    eventKind: string;
    craftId: string;
    recipeId: number;
    regionName: string;
    claimName?: string;
    ownerName?: string;
}

/** A funding alert (`tag: "funding"`): ids and machine codes only, never display text. */
export interface FundingNotificationPayload {
    /** One of `FUNDING_NOTIFICATION_KINDS`. */
    kind: string;
    /** 'payer' | 'payee'. */
    role: string;
    currency: string;
    craftId?: string;
    amount?: string;
    reason?: string;
    /** Display names of the parties of unclaimed money, as of when it was moved. */
    payerName?: string;
    payeeName?: string;
}

export type NotificationPayload =
    | {tag: "craft"; value: CraftNotificationPayload}
    | {tag: "funding"; value: FundingNotificationPayload};

export function encodeNotificationPayload(payload: NotificationPayload): string {
    return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(v: unknown): v is string {
    return typeof v === "string";
}

function optStr(v: unknown): v is string | undefined {
    return v === undefined || typeof v === "string";
}

/**
 * Parses a stored payload. Returns `null` for malformed JSON, an unrecognized tag, or a recognized
 * tag whose value has the wrong shape, so callers can skip what they don't understand.
 */
export function parseNotificationPayload(json: string): NotificationPayload | null {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    if (!isRecord(raw) || !isRecord(raw.value)) return null;
    const v = raw.value;
    switch (raw.tag) {
        case "craft":
            if (str(v.watchId) && str(v.filterName) && str(v.eventKind) && str(v.craftId) && typeof v.recipeId === "number"
                && str(v.regionName) && optStr(v.claimName) && optStr(v.ownerName)) {
                return {tag: "craft", value: v as unknown as CraftNotificationPayload};
            }
            return null;
        case "funding":
            if (str(v.kind) && str(v.role) && str(v.currency) && optStr(v.craftId) && optStr(v.amount) && optStr(v.reason)
                && optStr(v.payerName) && optStr(v.payeeName)) {
                return {tag: "funding", value: v as unknown as FundingNotificationPayload};
            }
            return null;
        default:
            return null;
    }
}
