/**
 * funding.tsx — wording, severity and link target of a `funding` notification, shared by the toast
 * (`state.tsx`) and the inbox row (`routes/account/notifications.tsx`) so the two always agree.
 */
import type {FundingNotificationPayload} from "@brico/crafts/notification";
import {MY_BOUNTIES_PATH} from "@brico/crafts/stelo";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {Show} from "solid-js";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {fundingReasonText} from "~/lib/crafts/funding-vocab";
import {uiLocale} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";

/** `error` for what the payer has to fix, `warning` for money that was moved without their action. */
export function fundingSeverity(kind: string): "error" | "warning" {
    return kind === "funding-failed" || kind === "payout-shortfall" ? "error" : "warning";
}

/** Where the notification's link goes: the craft when it names one, else the page the event concerns. */
export function fundingActionHref(value: Pick<FundingNotificationPayload, "kind" | "role" | "craftId">): string {
    if (value.craftId !== undefined) return `/tools/crafts/${value.craftId}`;
    if (value.kind === "funding-failed") return MY_BOUNTIES_PATH;
    return value.role === "payee" ? "/account/payouts" : "/account/payees";
}

/** One-line wording for a funding notification. */
export function fundingHeadline(value: Pick<FundingNotificationPayload, "kind" | "role">): MessageDescriptor {
    switch (value.kind) {
        case "funding-failed":
            return msg`Bounties could not be funded`;
        case "payout-shortfall":
            return msg`A payout could not be pulled from your wallet`;
        case "unclaimed-rolled-over":
            return value.role === "payee" ? msg`Money owed to you went unclaimed and was rolled over` : msg`Unclaimed money was rolled over`;
        case "unclaimed-returned":
            return value.role === "payee" ? msg`Money owed to you went unclaimed and was returned to the payer` : msg`Unclaimed money was returned to you`;
        default:
            return msg`Funding needs attention`;
    }
}

/** The currency (linked to the action page), the amount when there is one, the other party, and the reason. */
export function FundingNotificationDetail(props: {value: FundingNotificationPayload}) {
    const label = useLabel();
    return (
        <>
            <CurrencyLabel currency={props.value.currency}/>
            <Show when={props.value.amount}>{amount => <>{" · "}{BigInt(amount()).toLocaleString(uiLocale())}</>}</Show>
            <Show when={props.value.role === "payee" ? props.value.payerName : props.value.payeeName}>
                {name => <>{" · "}{props.value.role === "payee" ? <Trans>from {name()}</Trans> : <Trans>to {name()}</Trans>}</>}
            </Show>
            <Show when={props.value.reason}>{reason => <>{" · "}{fundingReasonText(reason(), label)}</>}</Show>
            <br/>
            <A href={fundingActionHref(props.value)} class="text-muted-foreground underline hover:text-foreground"><Trans>View details</Trans></A>
        </>
    );
}
