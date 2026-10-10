/**
 * funding-vocab.ts — display text for funding states and the machine reason codes that
 * `craft_bounty_funding` and funding notifications carry (`@brico/crafts/stelo`). The reason text is
 * `FUNDING_REASON_TEXT` capitalized with a trailing period, which the Discord messages share.
 */
import type {FundingReason} from "@brico/crafts/stelo";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";

export const FUNDING_STATE_LABEL: Record<string, MessageDescriptor> = {
    waiting: msg`Awaiting funding`,
    funding: msg`Funding…`,
    failed: msg`Funding failed`,
    funded: msg`Funded`,
};

const FUNDING_REASON_LABEL: Record<FundingReason, MessageDescriptor> = {
    "no-wallet": msg`No funding wallet is chosen.`,
    "wallet-inactive": msg`The funding wallet is no longer linked.`,
    "cannot-pull": msg`Brico.app needs Write access on the funding wallet.`,
    "not-authorized": msg`The account that linked the funding wallet is no longer an Admin or Owner of it.`,
    "stelo-unavailable": msg`Stelo is unavailable right now.`,
    "insufficient-funds": msg`The funding wallet doesn't have enough funds.`,
    "no-permission": msg`Brico.app lost permission on the funding wallet.`,
    "invalid-account": msg`The funding wallet account is invalid.`,
};

/** The text for a funding reason code, or a generic line for an unknown or missing one. */
export function fundingReasonText(reason: string | undefined, translate: (descriptor: MessageDescriptor) => string): string {
    const descriptor = reason === undefined ? undefined : (FUNDING_REASON_LABEL as Record<string, MessageDescriptor | undefined>)[reason];
    return translate(descriptor ?? msg`Funding is not complete.`);
}
