import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {PayoutRateButton} from "~/components/crafts/PayoutRateButton";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {useLinkedIntegrations} from "~/lib/account/links";
import type {CraftBountyFundingHandle} from "~/lib/crafts/bounty-funding";
import {fundingStatusView, type Ratio} from "~/lib/crafts/funding-status";
import {FUNDING_STATE_LABEL, fundingReasonText} from "~/lib/crafts/funding-vocab";
import {useLabel} from "~/lib/labels";

const rateOf = (ratio: Ratio) => Number(ratio.numerator) / Number(ratio.denominator);

/**
 * The payer's view of an escrowed bounty's funding on the craft detail page. Renders nothing for a
 * craft with no escrowed-currency intent.
 */
export function FundingStatus(props: {craftId: bigint; assigned: Ratio | null; funding: CraftBountyFundingHandle}) {
    const label = useLabel();
    const links = useLinkedIntegrations();

    const row = createMemo(() => props.funding.funding().get(props.craftId));
    const escrow = createMemo(() => props.funding.openEscrows().get(props.craftId));
    const view = createMemo(() => fundingStatusView(row(), props.assigned, escrow()));
    const wallet = createMemo(() => {
        const linkId = view()?.fundingLinkId;
        return linkId === undefined ? undefined : links.steloWallets().find(candidate => candidate.link.id === linkId);
    });
    const refundDue = createMemo(() => {
        const current = wallet();
        const currency = row()?.currency;
        if (!current || !currency) return undefined;
        return props.funding.escrowWallets().find(entry => entry.currency === currency && entry.fundingAccountId.toString() === current.link.externalId)?.refundDue;
    });
    const lastFailure = createMemo(() => props.funding.failedTransfers()
        .filter(transfer => (transfer.purpose.tag === "Hold" || transfer.purpose.tag === "TopUp") && transfer.purpose.value.craftId === props.craftId)
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0]);

    return (
        <Show when={view()}>
            {current => (
                <div class="flex flex-col gap-1 text-sm">
                    <div class="flex flex-wrap items-center gap-2">
                        <Badge variant={{waiting: "warning", funding: "secondary", failed: "error", funded: "success"}[current().state] as "warning"}>
                            {label(FUNDING_STATE_LABEL[current().state])}
                        </Badge>
                        <Show when={current().source === "rule"} fallback={<span class="text-muted-foreground"><Trans>from override</Trans></span>}>
                            <A href="/account/bounty-rules" class="text-muted-foreground underline hover:text-foreground"><Trans>from rule</Trans></A>
                        </Show>
                        <Show when={wallet()}>{found => <span class="text-muted-foreground">#{found().address}</span>}</Show>
                        <Popover>
                            <PopoverTrigger as={Button<"button">} variant="ghost" size="sm" class="h-6 px-2 text-xs"><Trans>Details</Trans></PopoverTrigger>
                            <PopoverContent class="w-64 space-y-1 p-3 text-xs">
                                <Show when={escrow()} fallback={<p class="text-muted-foreground"><Trans>No funds are held for this craft yet.</Trans></p>}>
                                    {held => (
                                        <>
                                            <p class="flex justify-between"><span><Trans>Held</Trans></span><span class="tabular-nums">{held().heldAmount.toString()}</span></p>
                                            <p class="flex justify-between"><span><Trans>Released</Trans></span><span class="tabular-nums">{held().releasedAmount.toString()}</span></p>
                                        </>
                                    )}
                                </Show>
                                <Show when={refundDue() !== undefined}>
                                    <p class="flex justify-between"><span><Trans>Refund due</Trans></span><span class="tabular-nums">{refundDue()!.toString()}</span></p>
                                </Show>
                                <Show when={lastFailure()?.failureReason}>
                                    {reason => (
                                        <p class="text-muted-foreground">
                                            <Trans>Last failure:</Trans>{" "}
                                            {fundingReasonText(reason(), label)}
                                        </p>
                                    )}
                                </Show>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <Show when={current().reason}>
                        {reason => (
                            <p class="text-xs text-muted-foreground">
                                {fundingReasonText(reason(), label)}
                                <Show when={current().state === "failed"}>{" "}<Trans>Retries automatically.</Trans></Show>
                            </p>
                        )}
                    </Show>
                    <Show when={current().raisingTo}>
                        {ratio => (
                            <p class="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Trans>Raising to</Trans>
                                <PayoutRateButton rate={rateOf(ratio())} currency={row()!.currency}/>
                            </p>
                        )}
                    </Show>
                    <Show when={current().state === "funded" && current().spendable !== undefined}>
                        <p class="text-xs text-muted-foreground"><Trans>Held for crafters:</Trans> {current().spendable!.toString()}</p>
                    </Show>
                    <Show when={current().intended.numerator != props.assigned?.numerator || current().intended.denominator != props.assigned?.denominator}>
                        <p class="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Trans>Intended rate</Trans>
                            <PayoutRateButton rate={rateOf(current().intended)} currency={row()!.currency}/>
                        </p>
                    </Show>
                </div>
            )}
        </Show>
    );
}
