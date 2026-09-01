/**
 * `/account/payees` — the payer view: a per-payee breakdown of bounties the caller has assigned,
 * and a place to record payments.
 *
 * `recordBountyPayment` has, by design, no craft-ownership cross-check — this page is an
 * honor-system ledger, not a real balance.
 *
 * Player names come from prism (`~/lib/crafts/relay.ts`'s `createPlayerNames`), not the module —
 * `myEntitlementsAsPayer` only ever hands back a bare `payeePlayerId` (a linked account's
 * `externalHandle` isn't guaranteed current, so the report deliberately never snapshots one; see
 * `PayerEntitlementRow`'s doc comment). A group only gets a proper account name
 * (`PayeeGroup.payeeName`) when the payee's account has itself set a display name — otherwise every
 * player id stays its own ungrouped row, and this page falls back to prism's live name for it.
 *
 * The payment editor is a single page-level `Dialog` rather than a per-row popover, on purpose:
 * `LiveTable` fully rebuilds every cell on every live-data tick (see the comment at
 * `live-table.tsx:163-174`), and `bounty_entitlement_total` changes exactly that often while a
 * payee is actively crafting. A `Popover` with row-local open/typed-amount state would get torn
 * down and reset mid-keystroke; a `Dialog` mounted once outside `LiveTable`'s render tree, driven by
 * one page-level "what am I editing" signal, is immune to that churn regardless of how often the
 * report updates underneath it.
 *
 * Local groupings (grouping ungrouped payees under a name of your own) live on `/account/settings`
 * now, not here — see `LocalGroupingsManager`'s doc comment.
 */
import {LoyaltyReward} from "@brico/bindings/brico-app/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineChevronRight as IconChevronRight} from "solid-icons/tb";
import {type Accessor, createEffect, createMemo, createSignal, Show} from "solid-js";
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
import {applyLocalGroupings, createPayerEntitlements, groupPayerRows, type PayeeGroup} from "~/lib/crafts/entitlement-reports";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {currencyData} from "~/lib/crafts/filter-vocab";
import {createLoyaltyRewards} from "~/lib/crafts/loyalty-rewards.ts";
import {createPlayerNames} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {type LabelResolver, useLabel} from "~/lib/labels";
import {useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";
import {cn, fixFloat} from "~/lib/utils";

const TABLE_NAME = "account-payees";

interface PayeeRow {
    id: string;
    name: string;
    /** Set only on a row that represents exactly one payee player — a lone ungrouped row, or a
     * subrow under a multi-player group. `null` on a multi-player group's parent row, since a
     * payment always targets one player, never a whole account. */
    playerId: string | null;
    currency: string;
    loyalty?: [bigint, bigint];
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    subRows?: PayeeRow[];
}

/** One row per group; a group with more than one payee player expands into per-player subrows,
 * matching "no subrows needed" for the common single-player case. */
function toRows(groups: readonly PayeeGroup[], playerNames: ReadonlyMap<string, string>, loyaltyRewards: LoyaltyReward[]): PayeeRow[] {
    const loyaltyMap = new Map(loyaltyRewards.map(r => [
        `${r.payeePlayerId}:${r.currency}`,
        [r.ratioNumerator, r.ratioDenominator] satisfies [bigint, bigint]
    ]));
    return groups.map(group => {
        const soloId = group.players[0]?.playerId ?? null;
        const name = group.payeeName ?? (soloId ? playerNames.get(soloId) ?? soloId : "?");
        const base = {
            id: group.groupKey,
            name,
            currency: group.currency,
            effortTotal: group.effortTotal,
            earnedTotal: group.earnedTotal,
            paidTotal: group.paidTotal,
        };
        if (group.players.length <= 1) {
            return {...base, playerId: soloId, loyalty: loyaltyMap.get(`${soloId}:${group.currency}`)};
        }
        return {
            ...base,
            playerId: null,
            subRows: group.players.map(player => ({
                id: `${group.groupKey}:${player.playerId}`,
                name: playerNames.get(player.playerId) ?? player.playerId,
                playerId: player.playerId,
                currency: group.currency,
                loyalty: loyaltyMap.get(`${player.playerId}:${group.currency}`),
                effortTotal: player.effortTotal,
                earnedTotal: player.earnedTotal,
                paidTotal: player.paidTotal,
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
    const [busy, setBusy] = createSignal(false);

    // Clears the typed amount whenever the *target* changes (a new row opened the dialog, or it
    // closed) — but never on its own, so a re-render of whatever row is currently being edited
    // can't touch it. See the file doc comment.
    createEffect<string | null>(previousKey => {
        const target = props.target();
        const key = target ? `${target.playerId}:${target.currency}` : null;
        if (key !== previousKey) setAmount("");
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
        setBusy(true);
        try {
            const active = conn.active();
            if (!active) throw new Error(_(msg`Not connected.`));
            await active.reducers.recordBountyPayment({
                payeePlayerId: BigInt(target.playerId),
                currency: target.currency,
                delta: sign * BigInt(trimmed),
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
                    <TextFieldInput class="h-9" placeholder={_(msg`Amount`)}/>
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

function buildColumns(onEdit: (target: EditTarget) => void, label: LabelResolver): ColumnDef<PayeeRow, any>[] {
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
                    <Show when={props.row.original.loyalty}>
                        {multiplier => {
                            const ratio = multiplier();
                            const raw = Number(ratio[0]) / Number(ratio[1]);
                            return <Badge variant="outline" title={String(raw)}>{fixFloat(raw)}×</Badge>
                        }}
                    </Show>
                </div>
            ),
        },
        {
            id: "currency",
            meta: {label: msg`Currency`},
            accessorFn: row => row.currency,
            cell: (props: Cell<string>) => <CurrencyLabel currency={props.getValue()}/>,
        },
        {
            id: "effort",
            meta: {label: msg`Effort`},
            accessorFn: row => row.effortTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
        },
        {
            id: "entitled",
            meta: {label: msg`Entitled`},
            accessorFn: row => row.earnedTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
        },
        {
            id: "paid",
            meta: {label: msg`Paid`},
            accessorFn: row => row.paidTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
        },
        {
            id: "difference",
            meta: {label: msg`Difference`},
            accessorFn: row => row.earnedTotal - row.paidTotal,
            cell: (props: Cell<bigint>) => {
                const diff = props.getValue();
                return <Badge variant={diff > 0n ? "default" : "secondary"} class="tabular-nums">{diff > 0n ? "+" : ""}{diff.toString()}</Badge>;
            },
        },
        {
            id: "action",
            meta: {label: msg`Payment`},
            enableHiding: false,
            enableSorting: false,
            cell: (props: Cell<undefined>) => (
                <Show when={props.row.original.playerId} fallback={<div class="h-9"></div>}>
                    {playerId => (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                const data = currencyData(props.row.original.currency);
                                const currencyText = data ? label(data.label) : props.row.original.currency;
                                onEdit({
                                    playerId: playerId(),
                                    currency: props.row.original.currency,
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
    const rows = createPayerEntitlements();
    const {rewards} = createLoyaltyRewards();
    const accountGroups = createMemo(() => groupPayerRows(rows()));
    const {names: playerNames} = createPlayerNames();
    const groups = createMemo(() => applyLocalGroupings(accountGroups(), settings.localPayeeGroupings()));
    const tableRows = createMemo(() => toRows(groups(), playerNames(), rewards()));

    const [editing, setEditing] = createSignal<EditTarget | null>(null);
    const columns = buildColumns(setEditing, label);

    return (
        <MainLayout
            title={_(msg`Payouts I owe`)}
            hideSearch
            ownHeading
            description="Per-payee breakdown of bounties you've assigned, and a place to record payments."
            navTitle={breadcrumb("/account", msg`Payouts I owe`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Bounty payouts</Trans>}
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
                    <LiveTable
                        name={TABLE_NAME}
                        columns={columns}
                        data={tableRows()}
                        initialState={{sorting: [{id: "effort", desc: true}]}}
                        getRowId={row => row.id}
                        getSubRows={row => row.subRows}
                        empty={<Trans>You haven't assigned any bounties yet.</Trans>}
                    />
                </Show>
            </div>
            <PaymentDialog target={editing} onClose={() => setEditing(null)}/>
        </MainLayout>
    );
}
