/**
 * [id].tsx — one live craft order, with its contributors.
 *
 * A craft id stays valid for 24 hours after the craft is claimed or removed (prism keeps the row
 * so history is queryable), so this page deliberately does *not* apply the browser's `Active`
 * filter — a link to a finished craft still renders, with a badge saying what became of it.
 */
import {computeEntitlement, parseDecimalRatio, reduceRatio} from "@brico/crafts/entitlement";
import {BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import type {CraftBountyFacts} from "@brico/crafts/subject";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineClipboardCheck as IconClipboardCheck, TbOutlineClipboardCopy as IconClipboardCopy, TbOutlineLock as IconLock} from "solid-icons/tb";
import {createMemo, createSignal, type JSX, Show} from "solid-js";
import {Timestamp} from "spacetimedb";
import {OutputIcon} from "~/components/crafts/OutputIcon";
import {LiveTable} from "~/components/data-table/live-table";
import {FontIcon} from "~/components/icons/font-icons";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {TierIcon} from "~/components/shared/GameIcon";
import {CraftOrderPanel} from "~/components/shared/RecipeDisplay";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Checkbox} from "~/components/ui/checkbox";
import {Label} from "~/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {useLinkedIntegrations} from "~/lib/account/links";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {createBountyAssignments} from "~/lib/crafts/bounty";
import {type CraftContributor, craftContributorsFrom, craftEntriesFrom} from "~/lib/crafts/entries";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {formatPayoutRate, type Ratio, useAmountField} from "~/lib/crafts/payout";
import {createCraftDetailRelay} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n.ts";
import {useLabel} from "~/lib/labels";
import {type PayoutDisplayMode, useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {fixFloat, useCopy} from "~/lib/utils.ts";

const BROWSE_HREF = "/tools/crafts/browse";

/** Keys the persisted hidden-column set. Shares a namespace with the database tables' names. */
const CONTRIBUTORS_TABLE_NAME = "craft-contributors";

/**
 * The craft entity id from the URL.
 *
 * Craft ids are u64, so they are parsed as `BigInt` rather than `Number` — a 19-digit entity id
 * does not survive a double. Anything that is not a plain non-negative integer is simply "not a
 * craft id", which the page reports differently from an id the relay has never heard of.
 */
function parseCraftId(raw: string | undefined): bigint | null {
    if (!raw || !/^\d+$/.test(raw)) return null;
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}

type ContributorCell<TValue> = CellContext<CraftContributor, TValue>;

/**
 * The contributor table's columns.
 *
 * Cells read `row.original` non-reactively, which is safe here for the same reason it is in the
 * browser: the relay hands the table a freshly built contributor object on every snapshot, so the
 * row is rebuilt rather than re-read.
 */
const CONTRIBUTOR_COLUMNS: ColumnDef<CraftContributor, any>[] = [
    {
        id: "player",
        meta: {label: msg`Contributor`},
        enableHiding: false,
        accessorFn: contributor => contributor.name ?? contributor.playerId,
        cell: (props: ContributorCell<string>) => (
            <Show when={props.row.original.name} fallback={
                <span class="font-mono text-xs text-muted-foreground">{props.row.original.playerId}</span>
            }>
                {name => <span class="font-medium">{name()}</span>}
            </Show>
        ),
    },
    {
        id: "contribution",
        meta: {label: msg`Effort`},
        accessorFn: contributor => contributor.contribution,
        cell: (props: ContributorCell<number>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
    },
    {
        id: "share",
        meta: {label: msg`Share`},
        accessorFn: contributor => contributor.share,
        cell: (props: ContributorCell<number>) => (
            <div class="flex items-center gap-2">
                <div class="h-2 w-24 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full bg-primary" style={{width: `${Math.round(props.getValue() * 100)}%`}}/>
                </div>
                <span class="tabular-nums text-xs text-muted-foreground">{(props.getValue() * 100).toFixed(1)}%</span>
            </div>
        ),
    },
    {
        id: "percentTotal",
        meta: {label: msg`% of total`},
        accessorFn: contributor => contributor.percentTotal,
        cell: (props: ContributorCell<number>) => (
            <span class="tabular-nums text-xs text-muted-foreground">{(props.getValue() * 100).toFixed(1)}%</span>
        ),
    },
    {
        id: "estPayout",
        meta: {label: msg`Est. payout`},
        accessorFn: contributor => contributor.estimatedPayout?.toString() ?? "",
        cell: (props: ContributorCell<string>) => (
            <Show when={props.row.original.estimatedPayout !== null} fallback={<span class="text-muted-foreground">—</span>}>
                <span class={`inline-flex gap-1 tabular-nums ${props.row.original.isOwner ? "text-muted-foreground" : ""}`}>
                    {props.row.original.estimatedPayout!.toString()} <CurrencyLabel currency={props.row.original.currency!} iconOnly={true}/>
                </span>
            </Show>
        )
    },
];

/** Quotes a CSV field only when it needs it, doubling any embedded quotes. */
function csvField(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Snapshots the current contributor rows as `player_id,player_name,effort,estimated_payout` CSV text. */
function contributorsToCsv(contributors: CraftContributor[]): string {
    const lines = ["player_id,player_name,effort,estimated_payout"];
    for (const contributor of contributors) {
        lines.push([
            contributor.playerId,
            csvField(contributor.name ?? ""),
            String(contributor.contribution),
            contributor.estimatedPayout?.toString() ?? "",
        ].join(","));
    }
    return lines.join("\n");
}

/** The contributor table's toolbar button — copies a CSV snapshot of the current rows to the clipboard. */
function CopyContributorsCsvButton(props: {contributors: () => CraftContributor[]}) {
    const [copy, copied] = useCopy(() => contributorsToCsv(props.contributors()));
    return (
        <Button variant="outline" size="sm" class="h-8" onClick={copy}>
            <Show when={copied()} fallback={<><IconClipboardCopy class="mr-1"/> <Trans>Copy CSV</Trans></>}>
                <IconClipboardCheck class="mr-1"/> <Trans>Copied!</Trans>
            </Show>
        </Button>
    );
}

/** One label/value line of the craft's metadata block, dot-led like the recipe stat lines. */
function MetaRow(props: {label: string; children: JSX.Element}) {
    return (
        <div class="flex flex-row">
            <div class="mr-2 shrink-0 text-nowrap text-muted-foreground">{props.label}</div>
            <div class="dots-before flex flex-1 justify-end text-nowrap">{props.children}</div>
        </div>
    );
}

/** A value the relay may not have resolved, rendered as a muted dash when it hasn't. */
function OrDash(props: {value: string | null}) {
    return (
        <Show when={props.value} fallback={<span class="text-muted-foreground">—</span>}>
            {value => <>{value()}</>}
        </Show>
    );
}

/**
 * A bounty's rate, decimal-formatted in whichever direction `~/lib/settings`'s shared
 * `payoutDisplayMode` currently prefers — clicking it flips that setting (and so every other page
 * showing a rate, not just this one). Storage never changes shape based on it; the stored fraction
 * is always currency-per-effort.
 */
function BountyRateText(props: {ratioNumerator: bigint; ratioDenominator: bigint; currency: string}) {
    const {_} = useLingui();
    const settings = useSettings();
    const rate = () => Number(props.ratioNumerator) / Number(props.ratioDenominator);
    return (
        <button
            class="hover:underline"
            title={_(msg`Switch between currency/effort and effort/currency`)}
            onClick={() => settings.setPayoutDisplayMode(settings.payoutDisplayMode() === "currencyPerEffort" ? "effortPerCurrency" : "currencyPerEffort")}
        >
            {formatPayoutRate(rate(), props.currency, settings.payoutDisplayMode())}
        </button>
    );
}

/**
 * The "Rate" tab's amount input — same commit-on-blur/exact-ratio treatment as
 * `~/routes/account/bounty-rules.tsx`'s `FlatAmountField` (both wrap the shared `useAmountField`):
 * mounts fresh each time the "Rate" `TabsContent` panel is shown (kobalte unmounts the inactive
 * tab), so its initial text is always derived from the caller's last-known-good `Ratio`, never a
 * re-parsed decimal string.
 */
function BountyRateField(props: {
    mode: () => PayoutDisplayMode;
    initialRatio: Ratio | null;
    onCommit: (ratio: Ratio | null) => void;
    onTextChange: (text: string) => void;
}) {
    const {_} = useLingui();
    const field = useAmountField(props.mode, () => props.initialRatio, ratio => props.onCommit(ratio));
    const setText = (value: string) => {
        field.setText(value);
        props.onTextChange(value);
    };
    return (
        <TextField class="flex-1" value={field.text()} onChange={setText}>
            <TextFieldInput class="h-9" placeholder={props.mode() === "currencyPerEffort" ? _(msg`e.g. 0.05`) : _(msg`e.g. 20`)} onBlur={field.commit}/>
        </TextField>
    );
}

/**
 * The add/edit/remove action for a craft's bounty override — for viewers who own the craft or its
 * claim, checked client-side against the same ownership data the page already resolves.
 *
 * Two independent tabs, not a mode toggle over one shared field: "Total" is always a total currency
 * amount for this craft's whole effort (`ratioNumerator = amount, ratioDenominator = 1`, reduced
 * against `effortTotal` before submitting), while "Rate" is the ratio itself, independent of craft
 * size, entered/shown in whichever direction the shared `payoutDisplayMode` setting prefers — each
 * tab keeps its own draft, so switching tabs never clobbers the other's value. Storage always ends
 * up as one exact currency-per-effort fraction regardless of which tab was used.
 */
function BountyEditor(props: {craftId: string; effortTotal: number; existing: CraftBountyFacts | null}) {
    const {_} = useLingui();
    const conn = useConnection(BRICO_APP_SERVER);
    const settings = useSettings();
    const rateMode = settings.payoutDisplayMode;
    const [open, setOpen] = createSignal(false);
    const [tab, setTab] = createSignal<"rate" | "total">("rate");
    const [rateRatio, setRateRatio] = createSignal<Ratio | null>(null);
    /** Tracked separately from `rateRatio` only so the Save button can disable on empty/mid-edit text between commits — see `BountyRateField`'s `onTextChange`. */
    const [rateHasText, setRateHasText] = createSignal(false);
    const [totalAmount, setTotalAmount] = createSignal("");
    const [currency, setCurrency] = createSignal<string>(BOUNTY_CURRENCIES[0]);
    const [isPrivate, setIsPrivate] = createSignal(false);
    const [busy, setBusy] = createSignal(false);

    /** The ratio the total field's current text parses to, or `null` while it's empty/mid-edit. */
    const totalRatio = () => {
        const parsed = parseDecimalRatio(totalAmount().trim());
        return parsed ? reduceRatio(parsed.numerator, parsed.denominator * BigInt(Math.max(props.effortTotal, 1))) : null;
    };

    /**
     * Each tab keeps its own draft — since kobalte unmounts the inactive `TabsContent`, the two
     * fields can only ever disagree while the other one is off-screen anyway. A commit on the rate
     * field (blur, or switching away from it) re-derives the total field's text from it here;
     * typing in the total field re-derives `rateRatio` the same way, which `BountyRateField` then
     * picks up as its `initialRatio` the next time the "Rate" tab is shown.
     */
    const onRateCommit = (ratio: Ratio | null) => {
        setRateRatio(ratio);
        if (ratio) setTotalAmount(String((Number(ratio.numerator) / Number(ratio.denominator)) * Math.max(props.effortTotal, 1)));
    };
    const onTotalAmountChange = (value: string) => {
        setTotalAmount(value);
        const parsed = parseDecimalRatio(value.trim());
        if (parsed) setRateRatio(reduceRatio(parsed.numerator, parsed.denominator * BigInt(Math.max(props.effortTotal, 1))));
    };

    const openEditor = () => {
        setTab("rate");
        if (props.existing) {
            setRateRatio({numerator: props.existing.ratioNumerator, denominator: props.existing.ratioDenominator});
            setRateHasText(true);
            const rate = Number(props.existing.ratioNumerator) / Number(props.existing.ratioDenominator);
            setTotalAmount(String(rate * Math.max(props.effortTotal, 1)));
            setCurrency(props.existing.currency);
        } else {
            setRateRatio(null);
            setRateHasText(false);
            setTotalAmount("");
            setCurrency(BOUNTY_CURRENCIES[0]);
        }
        setIsPrivate(props.existing?.private ?? false);
        setOpen(true);
    };

    const reportError = (title: string, cause: unknown) => {
        showToast({
            title: () => title,
            description: () => describeServerError(cause),
            variant: "destructive",
        });
    };

    const save = async () => {
        const ratio = tab() === "total" ? totalRatio() : rateRatio();
        if (!ratio) {
            reportError(_(msg`Could not save bounty`), new Error(_(msg`Enter a plain non-negative number, e.g. 0.05 or 12.`)));
            return;
        }

        setBusy(true);
        try {
            const active = conn.active();
            if (!active) throw new Error(_(msg`Not connected.`));
            await active.reducers.upsertCraftBountyOverride({
                craftId: BigInt(props.craftId),
                ratioNumerator: ratio.numerator,
                ratioDenominator: ratio.denominator,
                currency: currency(),
                private: isPrivate(),
                updatedAt: Timestamp.now(),
            });
            setOpen(false);
        } catch (cause) {
            reportError(_(msg`Could not save bounty`), cause);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            const active = conn.active();
            if (!active) throw new Error(_(msg`Not connected.`));
            await active.reducers.deleteCraftBountyOverride({craftId: BigInt(props.craftId)});
            setOpen(false);
        } catch (cause) {
            reportError(_(msg`Could not remove bounty`), cause);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover open={open()} onOpenChange={isOpen => (isOpen ? openEditor() : setOpen(false))}>
            <PopoverTrigger as={Button<"button">} variant="outline" size="sm">
                {props.existing ? <Trans>Edit bounty</Trans> : <Trans>Set bounty</Trans>}
            </PopoverTrigger>
            <PopoverContent class="w-72 space-y-3 p-3">
                <Tabs value={tab()} onChange={v => setTab(v as "rate" | "total")}>
                    <TabsList class="grid w-full grid-cols-2">
                        <TabsTrigger value="rate"><Trans>Rate</Trans></TabsTrigger>
                        <TabsTrigger value="total"><Trans>Total</Trans></TabsTrigger>
                    </TabsList>
                    <TabsContent value="rate" class="space-y-2">
                        <div class="flex items-end gap-2">
                            <BountyRateField
                                mode={rateMode}
                                initialRatio={rateRatio()}
                                onCommit={onRateCommit}
                                onTextChange={text => setRateHasText(text.trim().length > 0)}
                            />
                            <button
                                type="button"
                                class="text-xs text-muted-foreground hover:text-foreground hover:underline"
                                title={_(msg`Switch between currency/effort and effort/currency`)}
                                onClick={() => settings.setPayoutDisplayMode(rateMode() === "currencyPerEffort" ? "effortPerCurrency" : "currencyPerEffort")}
                            >
                                {rateMode() === "currencyPerEffort" ? _(msg`currency/effort`) : _(msg`effort/currency`)}
                            </button>
                        </div>
                    </TabsContent>
                    <TabsContent value="total" class="space-y-2">
                        <TextField value={totalAmount()} onChange={onTotalAmountChange}>
                            <TextFieldInput class="h-9" placeholder={_(msg`e.g. 30`)}/>
                        </TextField>
                        <p class="text-xs text-muted-foreground"><Trans>Total for this craft's {props.effortTotal.toLocaleString(uiLocale())} effort.</Trans></p>
                    </TabsContent>
                </Tabs>
                <Select
                    value={currency()}
                    onChange={value => value && setCurrency(value)}
                    options={[...BOUNTY_CURRENCIES]}
                    itemComponent={itemProps => <SelectItem item={itemProps.item}><CurrencyLabel currency={itemProps.item.rawValue}/></SelectItem>}
                >
                    <SelectTrigger class="h-9 w-full">
                        <SelectValue<string>>{state => <CurrencyLabel currency={state.selectedOption()}/>}</SelectValue>
                    </SelectTrigger>
                    <SelectContent/>
                </Select>
                <div class="flex items-center gap-2">
                    <Checkbox checked={isPrivate()} onChange={setIsPrivate}/>
                    <Label><Trans>Private</Trans></Label>
                </div>
                <div class="flex justify-between gap-2">
                    <Show when={props.existing}>
                        <Button variant="destructive" size="sm" disabled={busy()} onClick={remove}><Trans>Remove</Trans></Button>
                    </Show>
                    <Button
                        size="sm"
                        class="ml-auto"
                        disabled={busy() || (tab() === "total" ? !totalAmount().trim() : !rateHasText())}
                        onClick={save}
                    >
                        <Trans>Save</Trans>
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default function CraftDetail() {
    const params = useParams();
    const label = useLabel();
    const {links} = useLinkedIntegrations();

    const craftId = createMemo(() => parseCraftId(params.id as string | undefined));
    const relay = createCraftDetailRelay(craftId);
    const bountyAssignments = createBountyAssignments();

    // `craftEntriesFrom` resolves the relay row against the static game data exactly as it does
    // for a browser row, so the claim/owner/region/skill/tier wording is identical on both pages.
    // The detail snapshot holds at most this one craft.
    const craft = createMemo(() => craftEntriesFrom(relay.snapshot(), bountyAssignments()).at(0) ?? null);
    const bounty = createMemo<CraftBountyFacts | null>(() => {
        const entry = craft();
        return entry ? bountyAssignments().get(entry.id) ?? null : null;
    });
    const contributors = createMemo(() => craftContributorsFrom(relay.snapshot(), relay.contributions(), bounty() ?? undefined));
    const contributedTotal = createMemo(() => contributors().reduce((sum, entry) => sum + entry.contribution, 0));
    const contributionCoverage = createMemo(() => craft() ? contributedTotal() / craft()!.effortDone : 0);

    // The viewer's own linked BitCraft player ids — an "owns this craft, or owns its claim" check,
    // done client-side with data this page already has. Non-blocking: `brico-bot` is the real
    // authority for whether a bounty edit is actually accepted.
    const viewerPlayerIds = createMemo(() => links().filter(l => l.provider === "bitcraft-ea2").map(l => l.externalId));
    const canEditBounty = createMemo(() => {
        const entry = craft();
        if (entry?.complete) return false; // craft already complete, bounty is historical reference now
        const players = viewerPlayerIds();
        if (!entry || players.length === 0) return false;
        if (entry.subject.owner !== null && players.includes(entry.subject.owner)) return true;
        if (entry.subject.claim === null) return false;
        const claimMembers = relay.snapshot().claimMembers;
        return players.some(playerId => claimMembers.get(`${entry.subject.claim}:${playerId}`)?.owner === true);
    });

    const recipe = createMemo(() => {
        const entry = craft();
        return entry ? BitCraftTables.CraftingRecipeDesc.indexedBy("id")().get(entry.recipeId) : undefined;
    });

    const heading = () => {
        const entry = craft();
        return entry ? `${entry.recipeName} ×${entry.count}` : label(msg`Craft Order`);
    };

    return (
        <MainLayout
            title={heading()}
            ownHeading
            description="Live BitCraft craft progress: view craft details, progress, and contributions."
            navTitle={breadcrumb(BROWSE_HREF)}
        >
            <div class="w-full space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground">{heading()}</h1>
                    <Show when={craft()}>
                        {entry => (
                            <>
                                <Show when={!entry().public}>
                                    <Badge variant="secondary"><Trans>private</Trans></Badge>
                                </Show>
                                <Show when={entry().status === "Active" && entry().complete}>
                                    <Badge variant="secondary"><Trans>ready</Trans></Badge>
                                </Show>
                                <Show when={entry().status === "Claimed" || entry().status === "Removed" && entry().complete}>
                                    <Badge variant="secondary"><Trans>collected</Trans></Badge>
                                </Show>
                                <Show when={entry().status === "Removed" && !entry().complete}>
                                    <Badge variant="secondary"><Trans>removed</Trans></Badge>
                                </Show>
                            </>
                        )}
                    </Show>
                    <div class="ml-auto flex flex-row gap-2">
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Show
                    when={craft()}
                    fallback={
                        <p class="text-muted-foreground">
                            <Show when={craftId() !== null} fallback={<Trans>That is not a craft id.</Trans>}>
                                <Show when={relay.ready()} fallback={<Trans>Loading this craft…</Trans>}>
                                    <Trans>
                                        No such craft. The relay keeps a craft for 24 hours after it leaves the game,
                                        so this one has most likely expired.
                                    </Trans>
                                </Show>
                            </Show>
                        </p>
                    }
                >
                    {entry => (
                        <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
                            <div class="flex flex-col items-center gap-3 rounded-md border p-4 lg:w-1/2">
                                <div class="flex items-center gap-2">
                                    <OutputIcon output={entry().output}/>
                                    <span class="font-medium">{entry().recipeName}</span>
                                    <span class="text-muted-foreground">×{entry().count}</span>
                                </div>
                                <Show when={recipe()} fallback={
                                    <p class="text-sm text-muted-foreground">
                                        <Trans>This recipe is not in the loaded game data.</Trans>
                                    </p>
                                }>
                                    {recipeDesc => <CraftOrderPanel recipe={recipeDesc()} count={entry().count}/>}
                                </Show>
                            </div>

                            <div class="flex flex-1 flex-col gap-4">
                                <div class="space-y-1 text-sm">
                                    <MetaRow label={label(msg`Claim`)}><OrDash value={entry().claimName}/></MetaRow>
                                    <MetaRow label={label(msg`Owner`)}><OrDash value={entry().ownerName}/></MetaRow>
                                    <MetaRow label={label(msg`Region`)}>{entry().regionName}</MetaRow>
                                    <MetaRow label={label(msg`Skill`)}>
                                        <Show when={entry().skillName} fallback={<span class="text-muted-foreground">—</span>}>
                                            {name => (
                                                <span class="inline-flex items-center gap-1.5">
                                                    <Show when={entry().skillIcon}>
                                                        {icon => <FontIcon codepoint={icon()} class="size-4"/>}
                                                    </Show>
                                                    {name()}
                                                </span>
                                            )}
                                        </Show>
                                    </MetaRow>
                                    <MetaRow label={label(msg`Tier`)}>
                                        <Show when={entry().tier} fallback={<span class="text-muted-foreground">—</span>}>
                                            {tier => <TierIcon tier={tier()}/>}
                                        </Show>
                                    </MetaRow>
                                    <MetaRow label={label(msg`Bounty`)}>
                                        <Show when={bounty()} fallback={<span class="text-muted-foreground">—</span>}>
                                            {b => (
                                                <span class="inline-flex items-center gap-1.5">
                                                    <BountyRateText ratioNumerator={b().ratioNumerator} ratioDenominator={b().ratioDenominator} currency={b().currency}/>
                                                    <Show when={b().private}>
                                                        <IconLock class="size-3.5 text-muted-foreground" title={label(msg`Private bounty`)}/>
                                                    </Show>
                                                </span>
                                            )}
                                        </Show>
                                    </MetaRow>
                                    <Show when={bounty()}>
                                        {b => (
                                            <MetaRow label={label(msg`Remaining payout`)}>
                                                <span class="tabular-nums inline-flex gap-1">
                                                    {computeEntitlement(BigInt(entry().effortRemaining), b().ratioNumerator, b().ratioDenominator).toString()}
                                                    <CurrencyLabel currency={b().currency}/>
                                                </span>
                                            </MetaRow>
                                        )}
                                    </Show>
                                    <MetaRow label={label(msg`First seen`)}>{new Date(entry().firstSeenMs).toLocaleString(uiLocale())}</MetaRow>
                                    <MetaRow label={label(msg`Last active`)}>{new Date(entry().lastActiveMs).toLocaleString(uiLocale())}</MetaRow>
                                </div>

                                <div class="space-y-1">
                                    <div class="h-3 w-full overflow-hidden rounded-full bg-muted">
                                        <div class="h-full rounded-full bg-primary" style={{width: `${Math.round(entry().fraction * 100)}%`}}/>
                                    </div>
                                    <p class="text-sm tabular-nums text-muted-foreground">
                                        <Trans>Effort</Trans>
                                        {": "}
                                        {entry().effortDone.toLocaleString(uiLocale())} / {entry().effortTotal.toLocaleString(uiLocale())}
                                        {" ("}{Math.round(entry().fraction * 100)}%{") · "}
                                        <Trans>remaining</Trans>
                                        {" "}{entry().effortRemaining.toLocaleString(uiLocale())}
                                    </p>
                                </div>

                                <Show when={canEditBounty()}>
                                    <div>
                                        <BountyEditor craftId={entry().id} effortTotal={entry().effortTotal} existing={bounty()}/>
                                    </div>
                                </Show>
                            </div>
                        </div>
                    )}
                </Show>

                <Show when={craft()}>
                    <div class="space-y-2">
                        <h2 class="text-xl font-semibold text-foreground"><Trans>Contributors</Trans></h2>
                        <LiveTable
                            name={CONTRIBUTORS_TABLE_NAME}
                            columns={CONTRIBUTOR_COLUMNS}
                            data={contributors()}
                            getRowId={contributor => contributor.playerId}
                            initialState={{
                                sorting: [{id: "contribution", desc: true}]
                            }}
                            toolbar={<CopyContributorsCsvButton contributors={contributors}/>}
                            empty={
                                <Show when={relay.ready()} fallback={<Trans>Loading contributions…</Trans>}>
                                    <Trans>Nobody has worked on this craft yet.</Trans>
                                </Show>
                            }
                            paginationLabel={
                                <>
                                    <Trans>
                                        Contributors: {contributors().length.toLocaleString(uiLocale())}
                                    </Trans>
                                    <Show when={craft()?.effortDone}>
                                        {" · "}
                                        <Trans>effort logged: {contributedTotal().toLocaleString(uiLocale())} ({fixFloat(contributionCoverage() * 100)}%)</Trans>
                                    </Show>
                                </>
                            }
                        />
                    </div>
                </Show>

                <p class="text-sm text-muted-foreground">
                    <A href={BROWSE_HREF} class="hover:underline">
                        <Trans>← Back to the craft browser</Trans>
                    </A>
                </p>
            </div>
        </MainLayout>
    );
}
