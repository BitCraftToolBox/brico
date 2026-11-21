/**
 * stock.tsx — restock status for a claim's barter stalls: which buy limits to raise and which goods
 * to move from intake to outlet stalls. Settings live in this browser (see `StockConfigDialog`).
 */
import {claimDisplayName} from "@brico/crafts/names";
import {emptyStockConfig, type StockConfig, type StockThresholds} from "@brico/trades/stock-config";
import {ACTION_ISSUES, type StockIssue} from "@brico/trades/stock-plan";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import {TbOutlineFileExport as IconExport} from "solid-icons/tb";
import {createMemo, createSignal, For, onCleanup, onMount, Show} from "solid-js";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {stockColumns, type StockRow} from "~/components/trades/stock-columns";
import {StockConfigDialog} from "~/components/trades/StockConfigDialog";
import {GoodLabel, StockActionText} from "~/components/trades/StockIssues";
import {StockLinksCard} from "~/components/trades/StockLinksCard";
import {inheritedText, StockOverrideDialog} from "~/components/trades/StockOverrideDialog";
import {ThresholdFields} from "~/components/trades/ThresholdFields";
import {claimHref, parseEntityId, shopLabel, TRADES_HREF} from "~/components/trades/TradeBits";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {breadcrumb} from "~/lib/game-links";
import {useLabel} from "~/lib/labels";
import {useSettings} from "~/lib/settings";
import {shopEntriesFrom} from "~/lib/trades/entries";
import {createClaimTradesRelay} from "~/lib/trades/relay";
import {claimStalls, stockPlan} from "~/lib/trades/stock";

/** An in-game order edit deletes then re-creates the order; a gap shorter than this isn't reported. */
const MISSING_ORDER_GRACE_MS = 10_000;
/** Re-evaluates 24h windows and the missing-order grace while the relay is quiet. */
const CLOCK_TICK_MS = 5_000;

const THRESHOLD_FIELDS: (keyof StockThresholds)[] = ["batchSize", "reorderAt", "outletLowAt", "outletTarget"];

export default function StockManagerPage() {
    const {_} = useLingui();
    const params = useParams();
    const label = useLabel();
    const {stockConfigs, setStockConfig} = useSettings();
    const claimId = createMemo(() => parseEntityId(params.id as string | undefined));
    const claimKey = createMemo(() => claimId()?.toString() ?? "");
    const relay = createClaimTradesRelay(claimId);

    const [now, setNow] = createSignal(Date.now());
    onMount(() => {
        const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
        onCleanup(() => clearInterval(timer));
    });

    const config = createMemo((): StockConfig => stockConfigs()[claimKey()] ?? emptyStockConfig(claimKey()));
    const saveConfig = (next: StockConfig) => setStockConfig({...next, claimEntityId: claimKey()});

    const claim = createMemo(() => {
        const id = claimId();
        return id === null ? undefined : relay.snapshot().claims.get(id);
    });
    const claimName = () => (claim() ? claimDisplayName(claim()!.name) : "");
    const shops = createMemo(() => shopEntriesFrom(relay.snapshot()));
    const stalls = createMemo(() => claimStalls(shops(), claimKey()));
    const stallName = (id: string) => {
        const stall = stalls().find(shop => shop.id === id);
        return stall ? shopLabel(stall, label) : id;
    };
    const plan = createMemo(() => stockPlan(relay.snapshot(), stalls(), config(), now()));

    const missingSince = new Map<string, number>();
    const rows = createMemo((): StockRow[] => {
        const at = now();
        const seen = new Set<string>();
        const result = plan().lines.map(line => {
            let issues: StockIssue[] = line.issues;
            if (issues.some(issue => issue.kind === "missing-order")) {
                seen.add(line.key);
                const since = missingSince.get(line.key) ?? at;
                missingSince.set(line.key, since);
                if (at - since < MISSING_ORDER_GRACE_MS) issues = issues.filter(issue => issue.kind !== "missing-order");
            }
            return {line, issues, intakeName: stallName(line.intakeShopId), outletName: stallName(line.outletShopId)};
        });
        for (const key of [...missingSince.keys()]) if (!seen.has(key)) missingSince.delete(key);
        return result;
    });
    const attention = createMemo(() => rows().filter(row => !row.line.ignored && row.issues.some(issue => ACTION_ISSUES.has(issue.kind))));

    const [editing, setEditing] = createSignal<StockRow | null>(null);
    const [dialogOpen, setDialogOpen] = createSignal(false);
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    const columns = stockColumns(row => setEditing(row));

    const heading = () => (claimName() ? _(msg`${claimName()} stock`) : label(msg`Stock manager`));

    return (
        <MainLayout
            title={heading()}
            ownHeading
            description="Restock status for a BitCraft claim's barter stalls: buy limits to raise and goods to move."
            navTitle={breadcrumb(TRADES_HREF)}
        >
            <div class="w-full space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground">{heading()}</h1>
                    <div class="ml-auto flex flex-row gap-2">
                        <Show when={claimId() !== null}>
                            <Button variant="outline" size="sm" class="h-8" as={A} href={claimHref(claimKey())}><Trans>Claim shops</Trans></Button>
                        </Show>
                        <Button variant="outline" size="sm" class="h-8" onClick={() => setDialogOpen(true)}>
                            <IconExport class="mr-1 size-4"/><Trans>Import / Export</Trans>
                        </Button>
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Show
                    when={claimId() !== null && relay.ready()}
                    fallback={
                        <p class="text-muted-foreground">
                            <Show when={claimId() !== null} fallback={<Trans>That is not a claim id.</Trans>}>
                                <Trans>Loading this claim…</Trans>
                            </Show>
                        </p>
                    }
                >
                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Needs attention</Trans></CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Show when={attention().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>Nothing to do right now.</Trans></p>}>
                                <ul class="divide-y">
                                    <For each={attention()}>
                                        {row => (
                                            <li class="flex flex-wrap items-center gap-3 py-2">
                                                <GoodLabel line={row.line}/>
                                                <div class="flex flex-col text-sm">
                                                    <For each={row.issues.filter(issue => ACTION_ISSUES.has(issue.kind))}>
                                                        {issue => <span><StockActionText issue={issue} line={row.line} intake={row.intakeName} outlet={row.outletName}/></span>}
                                                    </For>
                                                </div>
                                                <Button variant="ghost" size="sm" class="ml-auto h-8" onClick={() => setEditing(row)}><Trans>Settings</Trans></Button>
                                            </li>
                                        )}
                                    </For>
                                </ul>
                            </Show>
                        </CardContent>
                    </Card>

                    <Collapsible open={settingsOpen()} onOpenChange={setSettingsOpen}>
                        <Card>
                            <CardHeader>
                                <CollapsibleTrigger class="block w-full text-left">
                                    <CardTitle><Trans>Stock settings</Trans></CardTitle>
                                    <CardDescription><Trans>Stall links and claim-wide defaults. Set per-item values from each row's settings button.</Trans></CardDescription>
                                </CollapsibleTrigger>
                            </CardHeader>
                            <CollapsibleContent>
                                <CardContent class="space-y-4">
                                    <StockLinksCard
                                        config={config()}
                                        stalls={stalls().map(stall => ({id: stall.id, name: shopLabel(stall, label)}))}
                                        suggestions={plan().suggestions}
                                        onChange={saveConfig}
                                    />
                                    <Card>
                                        <CardHeader><CardTitle><Trans>Claim defaults</Trans></CardTitle></CardHeader>
                                        <CardContent>
                                            <ThresholdFields
                                                fields={THRESHOLD_FIELDS}
                                                value={config().defaults}
                                                inherited={field => inheritedText({...config(), defaults: {}}, field, _)}
                                                onChange={defaults => saveConfig({...config(), defaults})}
                                            />
                                        </CardContent>
                                    </Card>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>

                    <LiveTable
                        name="trade-stock-lines"
                        columns={columns}
                        data={rows()}
                        getRowId={row => row.line.key}
                        initialState={{sorting: [{id: "status", desc: true}]}}
                        empty={<Trans>This claim's barter stalls have no coin buy or sell orders.</Trans>}
                    />
                </Show>

                <StockConfigDialog open={dialogOpen()} onOpenChange={setDialogOpen} config={config()} claimName={claimName()} onImport={saveConfig}/>
                <StockOverrideDialog row={editing()} config={config()} onClose={() => setEditing(null)} onSave={saveConfig}/>
            </div>
        </MainLayout>
    );
}
