/**
 * `/account/payees` — the payer view: a per-payee breakdown of bounties the caller has assigned,
 * and a place to record payments.
 *
 * Player names come from prism as `myEntitlementsAsPayer` only ever hands back a bare `payeePlayerId`.
 * A group only gets a proper account name when the payee's account has itself set a display name.
 * Rows group by the payer's local groupings first, then by payee account; each group's subrows are
 * its (player, currency) lines, and the parent sums across currencies.
 *
 * The payment editor is a single page-level `Dialog` rather than a per-row popover as that would get torn
 * down and reset mid-keystroke as the report updates underneath it.
 */
import type {LoyaltyBonusTotal, LoyaltyReward} from "@brico/bindings/brico-app/types";
import {ESCROWED_BOUNTY_CURRENCIES} from "@brico/crafts/currencies";
import {addRatio, bonusFromMultiplier} from "@brico/crafts/entitlement";
import {normalizePayoutNote, PAYOUT_NOTE_MAX_BYTES} from "@brico/crafts/note";
import {msg, t} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineChevronRight as IconChevronRight, TbOutlineHistory as IconHistory} from "solid-icons/tb";
import {type Accessor, createEffect, createMemo, createSignal, For, Show} from "solid-js";
import {CurrencyFilterButton} from "~/components/crafts/CurrencyFilterButton";
import {PayoutHistoryDialog, type PayoutHistoryFilter} from "~/components/crafts/PayoutHistoryDialog";
import {PayoutScheduleLine} from "~/components/crafts/PayoutScheduleLine";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {createCraftBountyFunding} from "~/lib/crafts/bounty-funding";
import {createPayerEntitlements, createPayoutLogAsPayer, groupPayerRows, type PayeeGroup, type PayeePlayerLedger} from "~/lib/crafts/entitlement-reports";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {currencyData} from "~/lib/crafts/filter-vocab";
import {createLoyaltyRewards} from "~/lib/crafts/loyalty-rewards.ts";
import {createLoyaltyBonusTotals} from "~/lib/crafts/loyalty-rules";
import {createPlayerNames} from "~/lib/crafts/relay";
import {escrowSummary, filterByCurrency} from "~/lib/crafts/report-math";
import {useShownCurrencies} from "~/lib/crafts/shown-currencies";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {type LabelResolver, useLabel} from "~/lib/labels";
import {useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";
import {cn} from "~/lib/utils";
import {formatBonusPercent} from "~/routes/account/loyalty.tsx";

const TABLE_NAME = "account-payees";

interface PayeeRow {
    id: string;
    name: string;
    /** Muted text after the name: the original account name(s) of players pulled into a local
     * group. */
    note?: string;
    /** Set only on a row that represents exactly one (player, currency) line — a payment always
     * targets one player and currency, never a whole group. `null` on a parent row. */
    playerId: string | null;
    /** Every (player, currency) pair this row covers — one for a single-line row, or the union of
     * every sub-row's pair for a group's parent row. Scopes the history icon's filter, since
     * transactions are recorded per-player and currency, not per-group. */
    entries: {playerId: string; currency: string}[];
    /** `null` on a parent row spanning several currencies. */
    currency: string | null;
    loyalty?: [bigint, bigint];
    effortTotal: bigint;
    earnedTotal: bigint;
    /** The escrow-backed part of `earnedTotal`, over escrowed currencies only; `null` when the row
     * has none. */
    securedTotal: bigint | null;
    paidTotal: bigint;
    subRows?: PayeeRow[];
}

/** One row per group; a group with more than one (player, currency) line expands into one subrow
 * per line. The parent shows a currency only when all its lines share one. */
function toRows(
    groups: readonly PayeeGroup[],
    playerNames: ReadonlyMap<string, string>,
    loyaltyRewards: readonly LoyaltyReward[],
    loyaltyBonuses: readonly LoyaltyBonusTotal[],
): PayeeRow[] {
    // Effective multiplier per (player, currency): the manual reward's bonus plus the automatic
    // bonus, added as exact fractions (they never compound).
    const bonuses = new Map<string, {numerator: bigint; denominator: bigint}>();
    const addBonus = (playerId: bigint, currency: string, bonus: {numerator: bigint; denominator: bigint}) => {
        const key = `${playerId}:${currency}`;
        bonuses.set(key, addRatio(bonuses.get(key) ?? {numerator: 0n, denominator: 1n}, bonus));
    };
    for (const r of loyaltyRewards) addBonus(r.payeePlayerId, r.currency, bonusFromMultiplier(r.ratioNumerator, r.ratioDenominator));
    for (const b of loyaltyBonuses) addBonus(b.payeePlayerId, b.currency, {numerator: b.bonusRatioNumerator, denominator: b.bonusRatioDenominator});
    const loyaltyMap = new Map<string, [bigint, bigint]>();
    for (const [key, bonus] of bonuses) {
        if (bonus.numerator === 0n) continue;
        loyaltyMap.set(key, [bonus.numerator, bonus.denominator]);
    }
    const securedOf = (lines: readonly PayeePlayerLedger[]) => {
        const escrowed = lines.filter(line => ESCROWED_BOUNTY_CURRENCIES.includes(line.currency));
        return escrowed.length === 0 ? null : escrowed.reduce((sum, line) => sum + line.guaranteedTotal, 0n);
    };
    return groups.map(group => {
        const soloId = group.lines[0]?.playerId ?? null;
        const name = group.payeeName ?? (soloId ? playerNames.get(soloId) ?? soloId : "?");
        const accountNames = group.isLocal ? [...new Set(group.lines.flatMap(line => line.accountName ?? []))] : [];
        const currencies = new Set(group.lines.map(line => line.currency));
        const single = group.lines.length === 1 ? group.lines[0] : null;
        const base = {
            id: group.groupKey,
            name,
            note: accountNames.length > 0 ? `(${accountNames.join(", ")})` : undefined,
            currency: currencies.size === 1 ? [...currencies][0] : null,
            entries: group.lines.map(line => ({playerId: line.playerId, currency: line.currency})),
            effortTotal: group.effortTotal,
            earnedTotal: group.earnedTotal,
            securedTotal: securedOf(group.lines),
            paidTotal: group.paidTotal,
        };
        if (single) return {...base, playerId: single.playerId, loyalty: loyaltyMap.get(`${single.playerId}:${single.currency}`)};
        return {
            ...base,
            playerId: null,
            subRows: group.lines.map(line => ({
                id: `${group.groupKey}:${line.playerId}:${line.currency}`,
                name: playerNames.get(line.playerId) ?? line.playerId,
                note: group.isLocal && line.accountName ? `(${line.accountName})` : undefined,
                playerId: line.playerId,
                entries: [{playerId: line.playerId, currency: line.currency}],
                currency: line.currency,
                loyalty: loyaltyMap.get(`${line.playerId}:${line.currency}`),
                effortTotal: line.effortTotal,
                earnedTotal: line.earnedTotal,
                securedTotal: securedOf([line]),
                paidTotal: line.paidTotal,
            })),
        };
    });
}

interface EditTarget {
    playerId: string;
    currency: string;
    label: string;
}

/** The payment editor. One instance, mounted once at the page level — see this file's doc comment
 * for why that's load-bearing. */
function PaymentDialog(props: {target: Accessor<EditTarget | null>; onClose: () => void}) {
    const {_} = useLingui();
    const conn = useConnection(BRICO_APP_SERVER);
    const [amount, setAmount] = createSignal("");
    const [note, setNote] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    // Clears the typed amount and note whenever the *target* changes (a new row opened the dialog, or it
    // closed) — but never on its own, so a re-render of whatever row is currently being edited
    // can't touch them. See the file doc comment.
    createEffect<string | null>(previousKey => {
        const target = props.target();
        const key = target ? `${target.playerId}:${target.currency}` : null;
        if (key !== previousKey) {
            setAmount("");
            setNote("");
        }
        return key;
    }, null);

    const record = async (sign: bigint) => {
        const target = props.target();
        if (!target) return;
        const trimmed = amount().trim();
        if (!/^\d+$/.test(trimmed)) {
            showToast({title: () => _(msg`Could not record payment`), description: () => _(msg`Enter a whole number.`), variant: "destructive"});
            return;
        }
        const trimmedNote = note().trim();
        if (trimmedNote !== "" && normalizePayoutNote(trimmedNote) === null) {
            showToast({
                title: () => _(msg`Could not record payment`),
                description: () => _(msg`The note is too long or contains line breaks.`),
                variant: "destructive",
            });
            return;
        }
        setBusy(true);
        try {
            const active = conn.active();
            if (!active) throw new Error(_(msg`Not connected.`));
            await active.reducers.recordBountyPayment({
                payeePlayerId: BigInt(target.playerId),
                currency: target.currency,
                delta: sign * BigInt(trimmed),
                note: trimmedNote === "" ? undefined : trimmedNote,
            });
            props.onClose();
        } catch (cause) {
            showToast({
                title: () => _(msg`Could not record payment`),
                description: () => describeServerError(cause),
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={props.target() !== null} onOpenChange={open => { if (!open) props.onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle><Trans>Record payment</Trans></DialogTitle>
                    <Show when={props.target()}>{target => <DialogDescription>{target().label}</DialogDescription>}</Show>
                </DialogHeader>
                <TextField value={amount()} onChange={setAmount}>
                    <TextFieldInput type="number" class="h-9" placeholder={_(msg`Amount`)}/>
                </TextField>
                <TextField value={note()} onChange={setNote}>
                    <TextFieldInput class="h-9" placeholder={_(msg`Note (optional)`)} maxLength={PAYOUT_NOTE_MAX_BYTES}/>
                </TextField>
                <DialogFooter>
                    <Button variant="outline" disabled={busy() || !amount().trim()} onClick={() => record(-1n)}>−</Button>
                    <Button disabled={busy() || !amount().trim()} onClick={() => record(1n)}>+</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type Cell<TValue> = CellContext<PayeeRow, TValue>;

function buildColumns(onEdit: (target: EditTarget) => void, onHistory: (row: PayeeRow) => void, label: LabelResolver): ColumnDef<PayeeRow, any>[] {
    return [
        {
            id: "name",
            meta: {label: msg`Payee`},
            enableHiding: false,
            accessorFn: row => row.name,
            cell: (props: Cell<string>) => (
                <div class="flex items-center gap-1" style={{"padding-left": `${props.row.depth * 1.25}rem`}}>
                    <Show when={props.row.getCanExpand()} fallback={<span class="inline-block size-4"/>}>
                        <button type="button" class="text-muted-foreground hover:text-foreground" onClick={props.row.getToggleExpandedHandler()}>
                            <IconChevronRight class={cn("size-4 transition-transform", props.row.getIsExpanded() && "rotate-90")}/>
                        </button>
                    </Show>
                    <span class={props.row.depth > 0 ? "text-sm" : "font-medium"}>{props.getValue()}</span>
                    <Show when={props.row.original.note}>
                        {note => <span class="text-sm text-muted-foreground">{note()}</span>}
                    </Show>
                    <Show when={props.row.original.loyalty}>
                        {multiplier => {
                            const ratio = formatBonusPercent(...multiplier());
                            return <Badge variant="outline">{ratio}</Badge>
                        }}
                    </Show>
                    <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground"
                        aria-label={t`Payment history`}
                        title={t`Payment history`}
                        onClick={() => onHistory(props.row.original)}
                    >
                        <IconHistory class="size-3.5"/>
                    </button>
                </div>
            ),
        },
        {
            id: "currency",
            meta: {label: msg`Currency`},
            accessorFn: row => row.currency,
            cell: (props: Cell<string | null>) => <Show when={props.getValue()}>{currency => <CurrencyLabel currency={currency()}/>}</Show>,
        },
        {
            id: "effort",
            meta: {label: msg`Effort`, align: "right"},
            accessorFn: row => row.effortTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "entitled",
            meta: {label: msg`Entitled`, align: "right"},
            accessorFn: row => row.earnedTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "secured",
            meta: {label: msg`Secured`, align: "right"},
            accessorFn: row => row.securedTotal,
            cell: (props: Cell<bigint | null>) => (
                <Show when={props.getValue() !== null} fallback={<span class="text-muted-foreground">—</span>}>
                    <span class="tabular-nums" title={t`Backed by escrow. The rest is paid from your wallet at payout.`}>
                        {props.getValue()!.toLocaleString(uiLocale())}
                    </span>
                </Show>
            ),
        },
        {
            id: "paid",
            meta: {label: msg`Paid`, align: "right"},
            accessorFn: row => row.paidTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "difference",
            meta: {label: msg`Difference`, align: "right"},
            accessorFn: row => row.earnedTotal - row.paidTotal,
            cell: (props: Cell<bigint>) => {
                const diff = props.getValue();
                return <Badge variant={diff > 0n ? "outline" : "secondary"} class="tabular-nums">{diff > 0n ? "+" : ""}{diff.toLocaleString(uiLocale())}</Badge>;
            },
        },
        {
            id: "action",
            meta: {label: msg`Payment`},
            enableHiding: false,
            enableSorting: false,
            cell: (props: Cell<undefined>) => (
                <Show
                    when={props.row.original.currency && !ESCROWED_BOUNTY_CURRENCIES.includes(props.row.original.currency) && props.row.original.playerId
                        ? {playerId: props.row.original.playerId, currency: props.row.original.currency}
                        : null}
                    fallback={<div class="h-9"></div>}
                >
                    {target => (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                const data = currencyData(target().currency);
                                const currencyText = data ? label(data.label) : target().currency;
                                onEdit({
                                    playerId: target().playerId,
                                    currency: target().currency,
                                    label: `${props.row.original.name} — ${currencyText}`,
                                });
                            }}
                        >
                            <Trans>Record payment</Trans>
                        </Button>
                    )}
                </Show>
            ),
        },
    ];
}

export default function PayeesPage() {
    const {_} = useLingui();
    const label = useLabel();
    const {isLoggedIn, login} = useAccount();
    const settings = useSettings();
    const bricoConn = useConnection(BRICO_APP_SERVER);
    const prismConn = useConnection(PRISM_SERVER);
    const {rows, ready: rowsReady} = createPayerEntitlements();
    const {rewards} = createLoyaltyRewards();
    const {totals: bonusTotals} = createLoyaltyBonusTotals();
    const {names: playerNames} = createPlayerNames();
    const [currencyFilter, setCurrencyFilter] = createSignal<string[]>([]);
    const groups = createMemo(() => groupPayerRows(filterByCurrency(rows(), currencyFilter()), settings.localPayeeGroupings()));
    const presentCurrencies = createMemo(() => [...new Set(rows().map(row => row.currency))]);
    const shownCurrencies = useShownCurrencies(presentCurrencies);
    const filterCurrencies = createMemo(() => shownCurrencies().filter(currency => presentCurrencies().includes(currency)));
    const hasEscrowed = createMemo(() => presentCurrencies().some(currency => ESCROWED_BOUNTY_CURRENCIES.includes(currency)));
    const tableRows = createMemo(() => toRows(groups(), playerNames(), rewards(), bonusTotals()));
    const funding = createCraftBountyFunding();
    const escrowTotals = createMemo(() => [...escrowSummary(funding.openEscrows().values(), funding.escrowWallets())]
        .filter(([currency, totals]) => ESCROWED_BOUNTY_CURRENCIES.includes(currency) && (totals.held > 0n || totals.refundDue > 0n)));
    const {rows: paymentLog, ready: paymentLogReady} = createPayoutLogAsPayer();

    const [editing, setEditing] = createSignal<EditTarget | null>(null);
    const [historyOpen, setHistoryOpen] = createSignal(false);
    const [historyFilter, setHistoryFilter] = createSignal<PayoutHistoryFilter | null>(null);
    const openHistory = (row: PayeeRow) => {
        setHistoryFilter({entries: row.entries});
        setHistoryOpen(true);
    };
    const columns = buildColumns(setEditing, openHistory, label);

    return (
        <MainLayout
            title={_(msg`Payouts I owe`)}
            hideSearch
            ownHeading
            description="Per-payee breakdown of bounties you've assigned, and a place to record payments."
            navTitle={breadcrumb("/account", msg`Payouts I owe`)}
        >
            <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Craft Bounties</Trans>}
                    tabs={bountyTabs()}
                    status={<ConnectionStatusBadge connections={[prismConn, bricoConn]}/>}
                />
                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription><Trans>Log in to see the payouts for your bounties.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <PayoutScheduleLine show={hasEscrowed()}/>
                    <For each={escrowTotals()}>
                        {([currency, totals]) => (
                            <p class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                <CurrencyLabel currency={currency}/>
                                <Trans>held in escrow: {totals.held.toLocaleString(uiLocale())}, refund due: {totals.refundDue.toLocaleString(uiLocale())}</Trans>
                            </p>
                        )}
                    </For>
                    <LiveTable
                        name={TABLE_NAME}
                        columns={columns}
                        data={tableRows()}
                        initialState={{sorting: [{id: "effort", desc: true}]}}
                        getRowId={row => row.id}
                        getSubRows={row => row.subRows}
                        searchColumnId="name"
                        empty={rowsReady() ? <Trans>No matches.</Trans> : <Trans>Loading…</Trans>}
                        toolbar={
                            <>
                                <CurrencyFilterButton currencies={filterCurrencies()} selected={currencyFilter()} onChange={setCurrencyFilter}/>
                                <Button
                                    variant="outline" size="sm" class="h-8"
                                    onClick={() => {setHistoryFilter(null); setHistoryOpen(true);}}
                                >
                                    <IconHistory class="mr-1 size-4"/><Trans>History</Trans>
                                </Button>
                            </>
                        }
                    />
                </Show>
            </div>
            <PaymentDialog target={editing} onClose={() => setEditing(null)}/>
            <PayoutHistoryDialog
                open={historyOpen()}
                onOpenChange={setHistoryOpen}
                rows={paymentLog()}
                ready={paymentLogReady()}
                filter={historyFilter()}
                playerName={id => playerNames().get(id) ?? id}
            />
        </MainLayout>
    );
}
