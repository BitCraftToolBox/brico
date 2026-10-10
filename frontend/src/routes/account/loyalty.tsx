/**
 * `/account/loyalty` — the manual loyalty-reward assignment page. A payer picks one of their
 * payees and gives them a payout multiplier (e.g. `1.05` for +5%), stored as an exact ratio in
 * `loyalty_reward` and folded by `brico-bot` into that payee's bounty ratio *before* the
 * entitlement floor, so it behaves like a plain percentage bonus.
 *
 * Deliberately not surfaced anywhere else in the frontend: a payee's boosted payout is only ever
 * visible in their own totals on `/account/payouts`, never as a separate "estimated" number
 * anywhere — the craft browser/detail page's estimated-payout preview never applies a multiplier.
 *
 * Similar shape to `~/components/crafts/LocalGroupingsManager` (a picker + input to add rows, plus
 * a table of existing rows with an editable field and delete button) but against real backend
 * state via `createLoyaltyRewards`, not `localStorage`.
 */
import type {LoyaltyBonusTotal, LoyaltyReward, LoyaltyRule, LoyaltyRuleSpec} from "@brico/bindings/brico-app/types";
import {bonusFromMultiplier, multiplierFromBonus, parseDecimalRatio} from "@brico/crafts/entitlement";
import {BOUNTY_CURRENCIES, CLAIM_ACCESS_FLAGS, type ClaimAccessFlag} from "@brico/crafts/filter";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineTrash as IconRemove} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {CurrencySelect} from "~/components/crafts/CurrencySelect.tsx";
import {type ClaimOption, ClaimPicker, type PlayerOption, PlayerPicker} from "~/components/crafts/PlayerPicker";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {claimAccessFlagLabel} from "~/lib/crafts/filter-vocab";
import {createLoyaltyRewards} from "~/lib/crafts/loyalty-rewards";
import {createLoyaltyBonusTotals, createLoyaltyRules} from "~/lib/crafts/loyalty-rules";
import {createClaimNames, createPlayerNames} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {compareText} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";

/** A ratio as the plain decimal string a multiplier field displays — `1.05`, not `105/100`. */
function formatMultiplier(ratioNumerator: bigint, ratioDenominator: bigint): string {
    if (ratioDenominator === 0n) return "";
    return String(Number(ratioNumerator) / Number(ratioDenominator));
}

/** A bonus-only ratio (e.g. `1/40`) as a `+2.5%` display string, for the read-only resolved-totals list. */
function formatBonusPercent(bonusRatioNumerator: bigint, bonusRatioDenominator: bigint): string {
    if (bonusRatioDenominator === 0n) return "";
    const percent = (Number(bonusRatioNumerator) / Number(bonusRatioDenominator)) * 100;
    return `+${percent.toLocaleString(undefined, {maximumFractionDigits: 2})}%`;
}

/** One existing reward's editor row — staged locally until Save, same reasoning as
 * `LocalGroupingsManager`'s `GroupingRow`: a live resubscribe of `myLoyaltyReward` can't clobber a
 * mid-edit multiplier. */
function RewardRow(props: {
    reward: LoyaltyReward;
    playerName: string;
    onSave: (ratioNumerator: bigint, ratioDenominator: bigint) => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const {_} = useLingui();
    const [text, setText] = createSignal(formatMultiplier(props.reward.ratioNumerator, props.reward.ratioDenominator));
    const [busy, setBusy] = createSignal(false);

    const parsed = createMemo(() => parseDecimalRatio(text().trim()));
    const dirty = createMemo(() => {
        const p = parsed();
        return p !== null && (p.numerator !== props.reward.ratioNumerator || p.denominator !== props.reward.ratioDenominator);
    });
    const valid = createMemo(() => {
        const p = parsed();
        return p !== null && p.numerator > 0n && p.numerator >= p.denominator;
    });

    const reportError = (title: string, cause: unknown) => {
        showToast({title: () => title, description: () => describeServerError(cause), variant: "destructive"});
    };

    const save = async () => {
        const p = parsed();
        if (!p || p.numerator <= 0n) return;
        setBusy(true);
        try {
            await props.onSave(p.numerator, p.denominator);
        } catch (cause) {
            reportError(_(msg`Could not save loyalty reward`), cause);
        } finally {
            setBusy(false);
        }
    };

    const del = async () => {
        setBusy(true);
        try {
            await props.onDelete();
        } catch (cause) {
            reportError(_(msg`Could not delete loyalty reward`), cause);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardContent class="flex flex-wrap items-center gap-2 p-3">
                <span class="w-48 shrink-0 truncate text-sm font-medium mr-auto">{props.playerName}</span>
                <CurrencyLabel currency={props.reward.currency}/>
                <TextField value={text()} onChange={setText} class="w-24">
                    <TextFieldInput class="h-9" placeholder={_(msg`e.g. 1.05`)}/>
                </TextField>
                <span class="text-sm text-muted-foreground">×</span>
                <Button size="sm" disabled={!dirty() || !valid() || busy()} onClick={save}>
                    <Trans>Save</Trans>
                </Button>
                <Button size="sm" variant="ghost" class="shrink-0 text-muted-foreground hover:text-destructive" aria-label={_(msg`Delete loyalty reward`)} disabled={busy()}
                        onClick={del}>
                    <IconRemove class="size-4"/>
                </Button>
            </CardContent>
        </Card>
    );
}

type RuleType = "claimMembership" | "effortThreshold";

/** A rule row's locally-staged form state — covers both `LoyaltyRuleSpec` variants at once, only one of which is read (by `specFrom`) depending on `type`. */
interface RuleDraft {
    type: RuleType;
    currency: string;
    claimId: string;
    requiredAccess: ClaimAccessFlag;
    allCurrencies: boolean;
    thresholdText: string;
    /** A multiplier (e.g. `1.025`), same units the manual card's field edits — converted to a bonus-only fraction (`bonusFromMultiplier`) only when actually saving. */
    multiplierText: string;
}

function draftFromRule(rule: LoyaltyRule): RuleDraft {
    const multiplier = multiplierFromBonus(rule.bonusRatioNumerator, rule.bonusRatioDenominator);
    const multiplierText = formatMultiplier(multiplier.numerator, multiplier.denominator);
    if (rule.spec.tag === "ClaimMembership") {
        return {
            type: "claimMembership", currency: rule.currency,
            claimId: rule.spec.value.claimEntityId.toString(), requiredAccess: rule.spec.value.requiredAccess as ClaimAccessFlag,
            allCurrencies: false, thresholdText: "", multiplierText,
        };
    }
    return {
        type: "effortThreshold", currency: rule.currency,
        claimId: "", requiredAccess: "member",
        allCurrencies: rule.spec.value.allCurrencies, thresholdText: rule.spec.value.threshold.toString(), multiplierText,
    };
}

function emptyRuleDraft(): RuleDraft {
    return {type: "claimMembership", currency: BOUNTY_CURRENCIES[0], claimId: "", requiredAccess: "member", allCurrencies: false, thresholdText: "", multiplierText: ""};
}

/** The `LoyaltyRuleSpec` a draft currently describes, or `null` when its type-specific value is missing/didn't parse. */
function specFromDraft(draft: RuleDraft): LoyaltyRuleSpec | null {
    if (draft.type === "claimMembership") {
        if (!/^\d+$/.test(draft.claimId.trim())) return null;
        return {tag: "ClaimMembership", value: {claimEntityId: BigInt(draft.claimId.trim()), requiredAccess: draft.requiredAccess}};
    }
    if (!/^\d+$/.test(draft.thresholdText.trim())) return null;
    return {tag: "EffortThreshold", value: {allCurrencies: draft.allCurrencies, threshold: BigInt(draft.thresholdText.trim())}};
}

const RULE_TYPES: readonly RuleType[] = ["claimMembership", "effortThreshold"];

function useRuleVocab() {
    const {_} = useLingui();
    const label = useLabel();
    return {
        ruleTypeLabel: (type: RuleType) => type === "claimMembership" ? _(msg`Claim membership`) : _(msg`Effort threshold`),
        permissionLabel: (flag: ClaimAccessFlag) => label(claimAccessFlagLabel(flag)),
        effortScopeLabel: (allCurrencies: boolean) => allCurrencies ? _(msg`Effort of any currency`) : _(msg`Effort of this currency`),
    };
}

/** One rule's type/currency/quantifier/value/multiplier row — new or existing, same shape either way; the caller supplies `onSave`/`onDelete` (existing rows) or just `onSave` (the "add new rule" row, which has no delete button). */
function RuleRow(props: {
    draft: RuleDraft;
    claimOptions: ClaimOption[];
    onSave: (spec: LoyaltyRuleSpec, currency: string, bonusRatioNumerator: bigint, bonusRatioDenominator: bigint) => Promise<void>;
    onDelete?: () => Promise<void>;
    saveLabel: string;
    resetOnSave?: boolean;
}) {
    const {_} = useLingui();
    const {ruleTypeLabel, permissionLabel, effortScopeLabel} = useRuleVocab();
    const [draft, setDraft] = createSignal(props.draft);
    const [busy, setBusy] = createSignal(false);

    const spec = createMemo(() => specFromDraft(draft()));
    const parsedMultiplier = createMemo(() => parseDecimalRatio(draft().multiplierText.trim()));
    const valid = createMemo(() => {
        const p = parsedMultiplier();
        return spec() !== null && p !== null && p.numerator > 0n && p.numerator >= p.denominator;
    });

    const reportError = (title: string, cause: unknown) => {
        showToast({title: () => title, description: () => describeServerError(cause), variant: "destructive"});
    };

    const save = async () => {
        const s = spec();
        const p = parsedMultiplier();
        if (!s || !p) return;
        const bonus = bonusFromMultiplier(p.numerator, p.denominator);
        setBusy(true);
        try {
            await props.onSave(s, draft().currency, bonus.numerator, bonus.denominator);
            if (props.resetOnSave) setDraft(emptyRuleDraft());
        } catch (cause) {
            reportError(_(msg`Could not save loyalty rule`), cause);
        } finally {
            setBusy(false);
        }
    };

    const del = async () => {
        if (!props.onDelete) return;
        setBusy(true);
        try {
            await props.onDelete();
        } catch (cause) {
            reportError(_(msg`Could not delete loyalty rule`), cause);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardContent class="flex flex-wrap items-center gap-2 p-3">
                <Select
                    value={draft().type}
                    onChange={value => value && setDraft({...draft(), type: value})}
                    options={[...RULE_TYPES]}
                    itemComponent={itemProps => <SelectItem item={itemProps.item}>{ruleTypeLabel(itemProps.item.rawValue)}</SelectItem>}
                >
                    <SelectTrigger class="h-9 w-44">
                        <SelectValue<RuleType>>{state => ruleTypeLabel(state.selectedOption())}</SelectValue>
                    </SelectTrigger>
                    <SelectContent/>
                </Select>

                <CurrencySelect value={draft().currency} onChange={currency => setDraft({...draft(), currency})}/>

                <Show
                    when={draft().type === "claimMembership"}
                    fallback={
                        // String-valued options, Kobalte only handles number/string or object with `.key`
                        <Select
                            value={draft().allCurrencies ? "any" : "same"}
                            onChange={value => value && setDraft({...draft(), allCurrencies: value === "any"})}
                            options={["same", "any"]}
                            itemComponent={itemProps => <SelectItem item={itemProps.item}>{effortScopeLabel(itemProps.item.rawValue === "any")}</SelectItem>}
                        >
                            <SelectTrigger class="h-9 w-48">
                                <SelectValue<"same" | "any">>{state => effortScopeLabel(state.selectedOption() === "any")}</SelectValue>
                            </SelectTrigger>
                            <SelectContent/>
                        </Select>
                    }
                >
                    <Select
                        value={draft().requiredAccess}
                        onChange={value => value && setDraft({...draft(), requiredAccess: value})}
                        options={[...CLAIM_ACCESS_FLAGS]}
                        itemComponent={itemProps => <SelectItem item={itemProps.item}>{permissionLabel(itemProps.item.rawValue)}</SelectItem>}
                    >
                        <SelectTrigger class="h-9 w-36">
                            <SelectValue<ClaimAccessFlag>>{state => permissionLabel(state.selectedOption())}</SelectValue>
                        </SelectTrigger>
                        <SelectContent/>
                    </Select>
                </Show>

                <Show
                    when={draft().type === "claimMembership"}
                    fallback={
                        <TextField value={draft().thresholdText} onChange={thresholdText => setDraft({...draft(), thresholdText})} class="w-32">
                            <TextFieldInput class="h-9" placeholder={_(msg`e.g. 50000`)}/>
                        </TextField>
                    }
                >
                    <ClaimPicker
                        options={props.claimOptions}
                        selected={draft().claimId ? [draft().claimId] : []}
                        onChange={ids => setDraft({...draft(), claimId: ids[0] ?? ""})}
                    />
                </Show>

                <div class="flex flex-row items-center gap-1">
                    <TextField value={draft().multiplierText} onChange={multiplierText => setDraft({...draft(), multiplierText})} class="w-24">
                        <TextFieldInput class="h-9" placeholder={_(msg`e.g. 1.025`)}/>
                    </TextField>
                    <span class="text-sm text-muted-foreground">×</span>
                </div>

                <Button size="sm" disabled={!valid() || busy()} onClick={save}>
                    {props.saveLabel}
                </Button>
                <Show when={props.onDelete}>
                    <Button size="sm" variant="ghost" class="shrink-0 text-muted-foreground hover:text-destructive" aria-label={_(msg`Delete loyalty rule`)} disabled={busy()}
                            onClick={del}>
                        <IconRemove class="size-4"/>
                    </Button>
                </Show>
            </CardContent>
        </Card>
    );
}

export default function LoyaltyRewardsPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const prismConn = useConnection(PRISM_SERVER);
    const bricoConn = useConnection(BRICO_APP_SERVER);
    const {names: playerNames} = createPlayerNames();
    const {names: claimNames} = createClaimNames();
    const {rewards, upsert, remove} = createLoyaltyRewards();
    const {rules, upsert: upsertRule, remove: removeRule} = createLoyaltyRules();
    const {totals: bonusTotals} = createLoyaltyBonusTotals();

    const playerOptions = createMemo<PlayerOption[]>(() =>
        [...playerNames().entries()]
            .map(([playerId, name]) => ({playerId, name}))
            .sort((a, b) => compareText(a.name, b.name))
    );
    const nameFor = (playerId: bigint) => playerNames().get(playerId.toString()) ?? playerId.toString();

    const claimOptions = createMemo<ClaimOption[]>(() =>
        [...claimNames().entries()]
            .map(([claimId, name]) => ({claimId: claimId.toString(), name}))
            .sort((a, b) => compareText(a.name, b.name))
    );

    const sortedRewards = createMemo(() =>
        [...rewards()].sort((a, b) => Number(b.ratioNumerator) / Number(b.ratioDenominator) - Number(a.ratioNumerator) / Number(a.ratioDenominator))
    );

    const sortedRules = createMemo(() => [...rules()].sort((a, b) => Number(a.id - b.id)));
    const sortedBonusTotals = createMemo(() =>
        [...bonusTotals()].sort((a, b) =>
            BOUNTY_CURRENCIES.indexOf(a.currency) - BOUNTY_CURRENCIES.indexOf(b.currency)
            || Number(b.bonusRatioNumerator) / Number(b.bonusRatioDenominator) - Number(a.bonusRatioNumerator) / Number(a.bonusRatioDenominator)
            || Number(a.payeePlayerId - b.payeePlayerId)
        )
    );
    const bonusTotalsByCurrency = createMemo(() => {
        const groups: {currency: string; totals: LoyaltyBonusTotal[]}[] = [];
        for (const total of sortedBonusTotals()) {
            const group = groups.at(-1);
            if (group && group.currency === total.currency) group.totals.push(total);
            else groups.push({currency: total.currency, totals: [total]});
        }
        return groups;
    });

    const [newPlayerIds, setNewPlayerIds] = createSignal<string[]>([]);
    const [newCurrency, setNewCurrency] = createSignal(BOUNTY_CURRENCIES[0]);
    const [newText, setNewText] = createSignal("");
    const [adding, setAdding] = createSignal(false);

    const newParsed = createMemo(() => parseDecimalRatio(newText().trim()));
    const canAdd = createMemo(() => {
        const p = newParsed();
        return newPlayerIds().length && p !== null && p.numerator > 0 && p.numerator >= p.denominator;
    });

    const reportError = (title: string, cause: unknown) => {
        showToast({title: () => title, description: () => describeServerError(cause), variant: "destructive"});
    };

    const addReward = async () => {
        const parsed = newParsed();
        const playerId = newPlayerIds()[0];
        if (!parsed || parsed.numerator <= 0n || !playerId) return;
        setAdding(true);
        try {
            await upsert(BigInt(playerId), newCurrency(), parsed.numerator, parsed.denominator);
            setNewPlayerIds([]);
            setNewText("");
        } catch (cause) {
            reportError(_(msg`Could not add loyalty reward`), cause);
        } finally {
            setAdding(false);
        }
    };

    return (
        <MainLayout
            title={_(msg`Loyalty rewards`)}
            hideSearch
            ownHeading
            description="Give specific payees a payout multiplier on top of their bounties."
            navTitle={breadcrumb("/account", msg`Loyalty rewards`)}
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
                                <CardDescription><Trans>Log in to assign loyalty rewards.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Loyalty rewards</Trans></CardTitle>
                            <CardDescription>
                                <Trans>
                                    A multiplier applied on top of the normal bounty math for crafts you pay out — e.g. 1.05 pays a
                                    player 5% more than their bounty alone would. Not shown anywhere except here; the payee's boosted
                                    total is only ever visible in their own payout totals.
                                </Trans>
                            </CardDescription>
                        </CardHeader>
                        <CardContent class="flex flex-col gap-3">
                            <div class="flex items-center gap-2">
                                <PlayerPicker options={playerOptions()} selected={newPlayerIds()} onChange={setNewPlayerIds} multiple={false}/>
                                <CurrencySelect value={newCurrency()} onChange={setNewCurrency}/>
                                <TextField value={newText()} onChange={setNewText} class="w-24">
                                    <TextFieldInput class="h-9" placeholder={_(msg`e.g. 1.05`)}/>
                                </TextField>
                                <span class="text-sm text-muted-foreground">×</span>
                                <Button size="sm" disabled={!canAdd() || adding()} onClick={addReward}>
                                    <Trans>Add</Trans>
                                </Button>
                            </div>

                            <Show when={sortedRewards().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No loyalty rewards yet.</Trans></p>}>
                                <div class="flex flex-col gap-2">
                                    <For each={sortedRewards()}>
                                        {reward => (
                                            <RewardRow
                                                reward={reward}
                                                playerName={nameFor(reward.payeePlayerId)}
                                                onSave={(ratioNumerator, ratioDenominator) => upsert(reward.payeePlayerId, reward.currency, ratioNumerator, ratioDenominator)}
                                                onDelete={() => remove(reward.payeePlayerId, reward.currency)}
                                            />
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Automatic loyalty rules</Trans></CardTitle>
                            <CardDescription>
                                <Trans>
                                    A standing condition — claim membership or cumulative effort — that grants a bonus to whichever
                                    payee currently satisfies it, on top of any manual assignment above. All applicable bonuses are
                                    added, not multiplied, with each other.
                                </Trans>
                            </CardDescription>
                        </CardHeader>
                        <CardContent class="flex flex-col gap-3">
                            <RuleRow
                                draft={emptyRuleDraft()}
                                claimOptions={claimOptions()}
                                onSave={(spec, currency, bonusRatioNumerator, bonusRatioDenominator) => upsertRule(null, currency, spec, bonusRatioNumerator, bonusRatioDenominator)}
                                saveLabel={_(msg`Add`)}
                                resetOnSave
                            />

                            <Show when={sortedRules().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No automatic rules yet.</Trans></p>}>
                                <div class="flex flex-col gap-2">
                                    <For each={sortedRules()}>
                                        {rule => (
                                            <RuleRow
                                                draft={draftFromRule(rule)}
                                                claimOptions={claimOptions()}
                                                onSave={(spec, currency, bonusRatioNumerator, bonusRatioDenominator) => upsertRule(rule.id, currency, spec, bonusRatioNumerator, bonusRatioDenominator)}
                                                onDelete={() => removeRule(rule.id)}
                                                saveLabel={_(msg`Save`)}
                                            />
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </CardContent>
                    </Card>

                    <Show when={sortedBonusTotals().length > 0}>
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>Resolved automatic bonuses</Trans></CardTitle>
                                <CardDescription>
                                    <Trans>
                                        Who currently qualifies for a bonus from the rules above, and how much.
                                    </Trans>
                                </CardDescription>
                            </CardHeader>
                            <CardContent class="flex flex-row flex-wrap gap-8">
                                <For each={bonusTotalsByCurrency()}>
                                    {group => (
                                        <div class="flex flex-col gap-2">
                                            <CurrencyLabel currency={group.currency}/>
                                            <For each={group.totals}>
                                                {total => (
                                                    <div class="flex items-center gap-2">
                                                        <span class="w-48 shrink-0 truncate text-sm font-medium">{nameFor(total.payeePlayerId)}</span>
                                                        <span class="w-20 text-right text-sm tabular-nums">{formatBonusPercent(total.bonusRatioNumerator, total.bonusRatioDenominator)}</span>
                                                    </div>
                                                )}
                                            </For>
                                        </div>
                                    )}
                                </For>
                            </CardContent>
                        </Card>
                    </Show>
                </Show>
            </div>
        </MainLayout>
    );
}
