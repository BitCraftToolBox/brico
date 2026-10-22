/**
 * payout-source.ts — labels for `bounty_payout_record_log.source` values other than a manually
 * recorded payment.
 */
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";

const PAYOUT_SOURCE_LABELS: Record<string, MessageDescriptor> = {
    transfer: msg`Stelo payout`,
    rollover: msg`Unclaimed: rolled over`,
    forfeit: msg`Unclaimed: returned to payer`,
};

/** The badge text for a log row's `source`; `null` for a manual `recorded` row, the raw string for an unknown source. */
export function payoutSourceLabel(source: string, translate: (descriptor: MessageDescriptor) => string): string | null {
    if (source === "recorded") return null;
    const descriptor = PAYOUT_SOURCE_LABELS[source];
    return descriptor ? translate(descriptor) : source;
}
