/**
 * `/account/my-bounties` — every bounty the caller pays: what each craft's rule or override asks for,
 * what is assigned, and for an escrowed currency whether it is funded and why not.
 */
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {PayoutRateButton} from "~/components/crafts/PayoutRateButton";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {useLinkedIntegrations} from "~/lib/account/links";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {createCraftBountyFunding, createCraftBountyOverrides, createMyBountyAssignments} from "~/lib/crafts/bounty-funding";
import {craftEntriesFrom} from "~/lib/crafts/entries";
import {FUNDING_STATE_LABEL, fundingReasonText} from "~/lib/crafts/funding-vocab";
import {countByStatus, type MyBountyRow, myBountyRows} from "~/lib/crafts/my-bounties";
import {createCraftRelay} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {useLabel} from "~/lib/labels";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const rateOf = (ratio: {numerator: bigint; denominator: bigint}) => Number(ratio.numerator) / Number(ratio.denominator);

const STATUS_LABEL: Record<string, MessageDescriptor> = {
    ...FUNDING_STATE_LABEL,
    assigned: msg`Assigned`,
    pending: msg`Not assigned yet`,
};

const STATUS_BADGE = {
    failed: "error", waiting: "warning", funding: "secondary", funded: "success", assigned: "success", pending: "secondary",
} as const;

function BountyLine(props: {row: MyBountyRow; name: string; detail: string; ready: boolean; address: string | undefined}) {
    const label = useLabel();
    const raising = () => props.row.assigned !== null
        && props.row.intended.numerator * props.row.assigned.denominator !== props.row.assigned.numerator * props.row.intended.denominator;
    return (
        <TableRow>
            <TableCell>
                <A href={`/tools/crafts/${props.row.craftId}`} class="underline">{props.name}</A>
                <Show when={props.detail || props.ready}>
                    <p class="flex items-center gap-1 text-xs text-muted-foreground">
                        {props.detail}
                        <Show when={props.ready}><Badge variant="secondary"><Trans>ready</Trans></Badge></Show>
                    </p>
                </Show>
            </TableCell>
            <TableCell>
                <PayoutRateButton rate={rateOf(props.row.intended)} currency={props.row.currency}/>
                <Show when={raising()}>
                    <p class="text-xs text-muted-foreground">
                        <Trans>Assigned: <PayoutRateButton rate={rateOf(props.row.assigned!)} currency={props.row.currency}/></Trans>
                    </p>
                </Show>
            </TableCell>
            <TableCell>
                <A href={props.row.source === "rule" ? "/account/bounty-rules" : `/tools/crafts/${props.row.craftId}`}
                   class="text-muted-foreground underline hover:text-foreground">
                    {props.row.source === "rule" ? <Trans>Rule</Trans> : <Trans>Override</Trans>}
                </A>
                <Show when={props.row.private}><p class="text-xs text-muted-foreground"><Trans>Private</Trans></p></Show>
            </TableCell>
            <TableCell>
                <Badge variant={STATUS_BADGE[props.row.status]}>{label(STATUS_LABEL[props.row.status])}</Badge>
                <Show when={props.row.reason}>
                    {reason => <p class="mt-1 text-xs text-muted-foreground">{fundingReasonText(reason(), label)}</p>}
                </Show>
            </TableCell>
            <TableCell class="text-muted-foreground">
                <Show when={props.address}>{address => <>#{address()}</>}</Show>
                <Show when={props.row.spendable !== undefined}>
                    <p class="text-xs"><Trans>Held:</Trans> {props.row.spendable!.toString()}</p>
                </Show>
            </TableCell>
        </TableRow>
    );
}

export default function MyBountiesPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const links = useLinkedIntegrations();
    const overrides = createCraftBountyOverrides();
    const funding = createCraftBountyFunding();
    const assignments = createMyBountyAssignments();
    const relay = createCraftRelay();

    const crafts = createMemo(() => new Map(craftEntriesFrom(relay.snapshot()).map(entry => [entry.id, entry])));
    // The relay snapshot holds only active crafts. A collected or removed craft can no longer accrue, so it is left out.
    const rows = createMemo(() => !relay.ready() ? [] : myBountyRows({
        assignments: assignments(),
        overrides: [...overrides.overrides().values()].map(row => ({
            craftId: row.craftId, numerator: row.ratioNumerator, denominator: row.ratioDenominator, currency: row.currency, private: row.private,
        })),
        funding: funding.funding().values(),
        escrows: funding.openEscrows(),
    }).filter(row => crafts().has(row.craftId.toString())));
    const counts = createMemo(() => countByStatus(rows()));
    const addressOf = (row: MyBountyRow) => row.fundingLinkId === undefined
        ? undefined
        : links.steloWallets().find(wallet => wallet.link.id === row.fundingLinkId)?.address;
    const nameOf = (row: MyBountyRow) => crafts().get(row.craftId.toString())!.recipeName;
    const detailOf = (row: MyBountyRow) => {
        const entry = crafts().get(row.craftId.toString());
        return entry ? [entry.claimName, entry.ownerName].filter(Boolean).join(" · ") : "";
    };

    return (
        <MainLayout
            title={_(msg`My bounties`)}
            hideSearch
            ownHeading
            description="Every bounty you pay, with its funding status."
            navTitle={breadcrumb("/account", msg`My bounties`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Craft Bounties</Trans>}
                    tabs={bountyTabs()}
                    status={<ConnectionStatusBadge connections={[conn, relay]}/>}
                />

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription><Trans>Log in to see the bounties you pay.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent><Button onClick={() => void login()}><Trans>Log in</Trans></Button></CardContent>
                        </Card>
                    }
                >
                    <Show when={(counts().get("failed") ?? 0) + (counts().get("waiting") ?? 0) > 0}>
                        <Card class="border-error">
                            <CardContent class="pt-6 text-sm">
                                <Plural
                                    value={(counts().get("failed") ?? 0) + (counts().get("waiting") ?? 0)}
                                    one="# bounty is not funded. It keeps retrying; fix the reason shown below."
                                    other="# bounties are not funded. They keep retrying; fix the reasons shown below."
                                />
                            </CardContent>
                        </Card>
                    </Show>

                    <Show
                        when={rows().length > 0}
                        fallback={
                            <p class="text-sm text-muted-foreground">
                                <Show when={funding.ready() && relay.ready()} fallback={<Trans>Loading your bounties…</Trans>}>
                                    <Trans>You don't have any bounties yet. Set one on a craft or add a rule under Bounty rules.</Trans>
                                </Show>
                            </p>
                        }
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead><Trans>Craft</Trans></TableHead>
                                    <TableHead><Trans>Rate</Trans></TableHead>
                                    <TableHead><Trans>From</Trans></TableHead>
                                    <TableHead><Trans>Status</Trans></TableHead>
                                    <TableHead><Trans>Wallet</Trans></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <For each={rows()}>
                                    {row => <BountyLine row={row} name={nameOf(row)} detail={detailOf(row)} ready={crafts().get(row.craftId.toString())!.complete} address={addressOf(row)}/>}
                                </For>
                            </TableBody>
                        </Table>
                    </Show>
                </Show>
            </div>
        </MainLayout>
    );
}
