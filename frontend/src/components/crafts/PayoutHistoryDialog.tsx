/**
 * PayoutHistoryDialog.tsx — the transaction-history modal shared by `/account/payees` (the payer
 * view) and `/account/payouts` (the payee view). Reads from `BountyPayoutLogRow`, the append-only
 * ledger behind `bounty_payout_record.paidTotal`.
 *
 * `filter === null` shows every row the caller can see (the toolbar's "History" button); a
 * non-null filter narrows to one table row's own (currency, player id set) — and, on the payee
 * side, one payer — matching the "row's own scope" the per-row history icon opens. A row that
 * represents a multi-player group already carries every one of its sub-rows' player ids, since the
 * transactions themselves are recorded per-player, not per-group.
 */
import type {BountyPayoutLogRow} from "@brico/bindings/brico-app/types";
import {Trans} from "@lingui/solid/macro";
import {createMemo, For, Show} from "solid-js";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {uiLocale} from "~/lib/i18n";

export interface PayoutHistoryFilter {
    currency: string;
    playerIds: readonly string[];
    /** Only set on the payee side, where one caller can have transactions with several payers —
     * narrows to one payer's rows alongside the (currency, playerIds) scope above. */
    payerAccountIdentity?: string;
}

export function PayoutHistoryDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rows: readonly BountyPayoutLogRow[];
    /** Whether `rows` reflects the caller's actual transaction log yet — distinguishes "no
     * transactions" from "still loading" the same way `LiveReport.ready` gates the tables behind
     * this dialog (see `~/lib/crafts/entitlement-reports.ts`). */
    ready: boolean;
    filter: PayoutHistoryFilter | null;
    playerName: (playerId: string) => string;
}) {
    const filtered = createMemo(() => {
        const filter = props.filter;
        const playerIds = filter ? new Set(filter.playerIds) : null;
        const rows = filter === null
            ? props.rows
            : props.rows.filter(row =>
                row.currency === filter.currency
                && playerIds!.has(row.payeePlayerId.toString())
                && (filter.payerAccountIdentity === undefined || row.payerAccountIdentity.toHexString() === filter.payerAccountIdentity)
            );
        return [...rows].sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch));
    });

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent class="max-w-xl">
                <DialogHeader>
                    <DialogTitle><Trans>Payment history</Trans></DialogTitle>
                </DialogHeader>
                <div class="max-h-96 overflow-y-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Trans>Payer</Trans></TableHead>
                                <TableHead><Trans>Player</Trans></TableHead>
                                <TableHead><Trans>Amount</Trans></TableHead>
                                <TableHead><Trans>Date</Trans></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <Show
                                when={filtered().length > 0}
                                fallback={
                                    <TableRow>
                                        <TableCell colSpan={4} class="h-16 text-center text-muted-foreground">
                                            <Show when={props.ready} fallback={<Trans>Loading…</Trans>}>
                                                <Trans>No transactions yet.</Trans>
                                            </Show>
                                        </TableCell>
                                    </TableRow>
                                }
                            >
                                <For each={filtered()}>
                                    {row => (
                                        <TableRow>
                                            <TableCell>{row.payerName}</TableCell>
                                            <TableCell>{props.playerName(row.payeePlayerId.toString())}</TableCell>
                                            <TableCell class="tabular-nums">
                                                <span class="inline-flex items-center gap-1">
                                                    <CurrencyLabel currency={row.currency} iconOnly/>
                                                    {row.amount > 0n ? "+" : ""}{row.amount.toString()}
                                                </span>
                                            </TableCell>
                                            <TableCell class="whitespace-nowrap text-sm text-muted-foreground">
                                                {new Date(Number(row.createdAt.toMillis())).toLocaleString(uiLocale())}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </For>
                            </Show>
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
}
