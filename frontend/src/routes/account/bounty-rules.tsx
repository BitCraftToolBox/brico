/**
 * `/account/bounty-rules` — the bounty-rule builder: a reorderable list of the account's
 * `bounty_rule` rows.
 *
 * Reordering is up/down buttons, not drag-and-drop (no dnd library in this frontend yet). Each
 * rule pairs a `FilterBuilder` (with `payout`/`currency` excluded — a rule conditioning on the
 * very bounty it assigns would be circular) with either a flat ratio+currency or a skill/tier
 * grid, matching `BountyRuleValue`'s shape.
 */
import type {BountyRule, BountyRuleValue, GridCell} from "@brico/bindings/brico-app/types";
import {BOUNTY_CURRENCIES, CLAIM_ACCESS_FLAGS, type FilterField, type FilterNode, matchAll, validateFilter,} from "@brico/crafts/filter";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineArrowsExchange as IconSwap, TbOutlineTrash as IconRemove} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {CurrencySelect} from "~/components/crafts/CurrencySelect";
import {type FieldOption, type FieldOptions, FilterBuilder} from "~/components/crafts/FilterBuilder";
import {FontIcon} from "~/components/icons/font-icons.tsx";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {TierIcon} from "~/components/shared/GameIcon.tsx";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {Label} from "~/components/ui/label";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip.tsx";
import {useLinkedIntegrations} from "~/lib/account/links";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {Tiers} from "~/lib/bitcraft-utils.ts";
import {createBountyRules} from "~/lib/crafts/bounty-rules";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {claimAccessFlagLabel, currencyData} from "~/lib/crafts/filter-vocab";
import {byLabel, craftStaticOptions, SKILL_ORDER} from "~/lib/crafts/options";
import {parseRateInput, type Ratio, useAmountField} from "~/lib/crafts/payout";
import {createCraftReferenceSelf} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {compareText} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import {type PayoutDisplayMode, useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";

const DISALLOWED_FIELDS = ["payout", "currency"] as const;
// skill tiers, not item tiers
const TIERS = Tiers.tiers.map((p) => p.value).filter(v => v > 0);

const BITCRAFT_PROVIDER = "bitcraft-ea2";

/** A grid cell's committed value — `"invalid"` for non-empty typed text that didn't parse, which (unlike a merely *empty* cell, which is just absent from the map) still has to block Save the same way bogus flat-amount text does. */
type CellAmount = Ratio | "invalid";

interface RuleDraft {
    filter: FilterNode;
    mode: "flat" | "grid";
    /** `null` means empty/not-yet-entered — also what an unparseable typed amount collapses to, so `valueFrom` fails the same way an empty field would. */
    flatAmount: Ratio | null;
    flatCurrency: string;
    gridCurrency: string;
    /** `` `${skillId}:${tier}` -> committed cell value ``; missing means "no bounty from this cell". */
    gridCells: Map<string, CellAmount>;
    /** When true, any assignment this rule produces is only visible to the owner — see `myPrivateCraftBountyAssignment`. */
    private: boolean;
}

function draftFrom(rule: BountyRule): RuleDraft {
    const filter = JSON.parse(rule.filterJson) as FilterNode;
    if (rule.value.tag === "Flat") {
        const flatAmount = {numerator: rule.value.value.ratioNumerator, denominator: rule.value.value.ratioDenominator};
        return {filter, mode: "flat", flatAmount, flatCurrency: rule.value.value.currency, gridCurrency: BOUNTY_CURRENCIES[0], gridCells: new Map(), private: rule.private};
    }
    const gridCells = new Map<string, CellAmount>();
    for (const cell of rule.value.value.cells) {
        gridCells.set(`${cell.skillId}:${cell.tier}`, {numerator: cell.ratioNumerator, denominator: cell.ratioDenominator});
    }
    return {filter, mode: "grid", flatAmount: null, flatCurrency: BOUNTY_CURRENCIES[0], gridCurrency: rule.value.value.currency, gridCells, private: rule.private};
}

function emptyDraft(): RuleDraft {
    return {filter: matchAll(), mode: "flat", flatAmount: null, flatCurrency: BOUNTY_CURRENCIES[0], gridCurrency: BOUNTY_CURRENCIES[0], gridCells: new Map(), private: false};
}

/** The `BountyRuleValue` a draft currently describes, or `null` when an amount is missing/didn't parse. */
function valueFrom(draft: RuleDraft): BountyRuleValue | null {
    if (draft.mode === "flat") {
        if (!draft.flatAmount) return null;
        return {tag: "Flat", value: {ratioNumerator: draft.flatAmount.numerator, ratioDenominator: draft.flatAmount.denominator, currency: draft.flatCurrency}};
    }
    const cells: GridCell[] = [];
    for (const [key, cell] of draft.gridCells) {
        if (cell === "invalid") return null;
        const [skillId, tier] = key.split(":").map(Number);
        cells.push({skillId, tier, ratioNumerator: cell.numerator, ratioDenominator: cell.denominator});
    }
    return {tag: "Grid", value: {currency: draft.gridCurrency, cells}};
}

/** The flat-rate amount input — mounts fresh (and re-syncs off `amount`) each time the flat/grid `<Show>` swaps it in. */
function FlatAmountField(props: {amount: Ratio | null; mode: () => PayoutDisplayMode; onCommit: (ratio: Ratio | null) => void}) {
    const {_} = useLingui();
    const field = useAmountField(props.mode, () => props.amount, ratio => props.onCommit(ratio));
    return (
        <TextField class="w-40" value={field.text()} onChange={field.setText}>
            <TextFieldInput class="h-9" placeholder={props.mode() === "currencyPerEffort" ? _(msg`e.g. 0.05`) : _(msg`e.g. 20`)} onBlur={field.commit}/>
        </TextField>
    );
}

/**
 * One skill/tier grid cell's amount input — same commit-on-blur/exact-ratio treatment as
 * `FlatAmountField`, except an unparseable *non-empty* commit reports `"invalid"` rather than `null`:
 * an empty cell just means "no bounty here" (dropped from the map, no error), but bogus text has to
 * keep blocking Save the same way a bad flat amount does, not silently vanish.
 *
 * Pasting tabular content (multiple whitespace-separated tokens, or multiple lines) fans out into
 * the surrounding cells starting from this one, like pasting a range into a spreadsheet — a single
 * token still falls through to the browser's normal single-field paste.
 */
function GridAmountCell(props: {
    amount: () => Ratio | null;
    mode: () => PayoutDisplayMode;
    onCommit: (value: CellAmount | null) => void;
    onPasteFill: (rows: string[][]) => void;
}) {
    const field = useAmountField(props.mode, props.amount, (ratio, rawText) => props.onCommit(ratio ?? (rawText ? "invalid" : null)));
    const onPaste = (e: ClipboardEvent) => {
        const rows = (e.clipboardData?.getData("text") ?? "")
            .split(/\r\n|\r|\n/)
            .filter(line => line.trim().length > 0)
            .map(line => line.trim().split(/\s+/));
        if (rows.length === 0 || (rows.length === 1 && rows[0].length <= 1)) return;
        e.preventDefault();
        props.onPasteFill(rows);
    };
    return (
        <input
            class="h-7 w-14 rounded bg-transparent px-1 text-center text-xs"
            value={field.text()}
            placeholder="—"
            onInput={e => field.setText(e.currentTarget.value)}
            onPaste={onPaste}
            onBlur={field.commit}
        />
    );
}

/**
 * The currency picker plus its "per effort"/"effort per" label, in the order that actually reads
 * correctly for the current direction, plus the toggle that flips it — shared by the flat-rate row
 * and the skill/tier grid's header, so both amount-entry surfaces stay on the same direction.
 */
function RateDirectionRow(props: {currency: string; onCurrencyChange: (value: string) => void}) {
    const {_} = useLingui();
    const settings = useSettings();
    const mode = settings.payoutDisplayMode;
    const switchLabel = () => _(msg`Switch between currency/effort and effort/currency`);
    return (
        <div class="flex items-center gap-2">
            <Show
                when={mode() === "currencyPerEffort"}
                fallback={
                    <Trans>
                        <span class="text-sm text-muted-foreground">effort per</span>
                        <CurrencySelect value={props.currency} onChange={props.onCurrencyChange}/>
                    </Trans>
                }
            >
                <Trans>
                    <CurrencySelect value={props.currency} onChange={props.onCurrencyChange}/>
                    <span class="text-sm text-muted-foreground">per effort</span>
                </Trans>
            </Show>
            <Button
                variant="ghost"
                size="icon"
                class="size-9 shrink-0 text-muted-foreground"
                aria-label={switchLabel()}
                title={switchLabel()}
                onClick={() => settings.setPayoutDisplayMode(mode() === "currencyPerEffort" ? "effortPerCurrency" : "currencyPerEffort")}
            >
                <IconSwap class="size-4"/>
            </Button>
        </div>
    );
}

function RuleCard(props: {
    /** `null` for a brand-new, not-yet-saved rule. */
    rule: BountyRule | null;
    priority: number;
    isFirst: boolean;
    isLast: boolean;
    options: FieldOptions;
    onSave: (id: string, filterJson: string, value: BountyRuleValue, priority: number, isPrivate: boolean) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDiscard?: () => void;
}) {
    const {_} = useLingui();
    const [id] = createSignal(props.rule?.id ?? crypto.randomUUID());
    const [draft, setDraft] = createSignal<RuleDraft>(props.rule ? draftFrom(props.rule) : emptyDraft());
    const [busy, setBusy] = createSignal(false);
    const skillOrder = new Map(SKILL_ORDER.map((id, index) => [id, index]));
    const skills = () => (BitCraftTables.SkillDesc.get() ?? [])
        .filter(s => skillOrder.has(s.id))
        .sort((a, b) => skillOrder.get(a.id)! - skillOrder.get(b.id)!);
    // Same "does any recipe require this skill" check as `craftStaticOptions`'s skills memo, so a
    // skill's name here is muted exactly when it wouldn't appear as a filter option at all.
    const skillsWithRecipes = createMemo(() => {
        const recipes = BitCraftTables.CraftingRecipeDesc.get() ?? [];
        return new Set(recipes.map(recipe => recipe.levelRequirements[0]?.skillId));
    });
    const settings = useSettings();
    const rateMode = settings.payoutDisplayMode;

    const setFlatAmount = (ratio: Ratio | null) => setDraft({...draft(), flatAmount: ratio});
    const setGridAmount = (key: string, value: CellAmount | null) => {
        const next = new Map(draft().gridCells);
        if (value) next.set(key, value);
        else next.delete(key);
        setDraft({...draft(), gridCells: next});
    };
    // Fills a rectangular block of the grid from pasted tabular text, anchored at the cell the paste
    // landed on — rows walk down the skill list, tokens within a row walk across tiers, both clipped
    // at the grid's edges (a paste that overruns the grid just gets truncated, not rejected).
    const pasteGridAmounts = (anchorRow: number, anchorCol: number, rows: string[][]) => {
        const rowSkills = skills();
        const next = new Map(draft().gridCells);
        rows.forEach((tokens, r) => {
            const skill = rowSkills[anchorRow + r];
            if (!skill) return;
            tokens.forEach((token, c) => {
                const tier = TIERS[anchorCol + c];
                if (tier === undefined) return;
                const ratio = parseRateInput(token, rateMode());
                next.set(`${skill.id}:${tier}`, ratio ?? "invalid");
            });
        });
        setDraft({...draft(), gridCells: next});
    };

    const reportError = (title: string, cause: unknown) => {
        showToast({
            title: () => title,
            description: () => describeServerError(cause),
            variant: "destructive",
        });
    };

    const filterProblems = createMemo(() => validateFilter(draft().filter, "filter", [...DISALLOWED_FIELDS]));

    const save = async () => {
        const value = valueFrom(draft());
        if (!value) {
            reportError(_(msg`Could not save rule`), new Error(_(msg`Enter a plain non-negative number for each rate, e.g. 0.05 or 12.`)));
            return;
        }
        if (filterProblems().length > 0) {
            // `filterProblems()[0]` comes from `@brico/crafts/filter`'s `validateFilter`, which is
            // English-only by design (shared with `brico-bot`, no i18n dependency) — left untranslated.
            reportError(_(msg`Could not save rule`), new Error(filterProblems()[0]));
            return;
        }
        setBusy(true);
        try {
            await props.onSave(id(), JSON.stringify(draft().filter), value, props.priority, draft().private);
        } catch (cause) {
            reportError(_(msg`Could not save rule`), cause);
        } finally {
            setBusy(false);
        }
    };

    const del = async () => {
        setBusy(true);
        try {
            await props.onDelete(id());
        } catch (cause) {
            reportError(_(msg`Could not delete rule`), cause);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardContent class="space-y-3 pt-6">
                <div class="flex items-center gap-1">
                    <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Move up`)} disabled={props.isFirst} onClick={props.onMoveUp}>↑</Button>
                    <Button variant="ghost" size="icon" class="size-8" aria-label={_(msg`Move down`)} disabled={props.isLast} onClick={props.onMoveDown}>↓</Button>
                    <div class="ml-auto flex gap-1">
                        <Button variant={draft().mode === "flat" ? "secondary" : "outline"} size="sm" onClick={() => setDraft({...draft(), mode: "flat"})}>
                            <Trans>Flat rate</Trans>
                        </Button>
                        <Button variant={draft().mode === "grid" ? "secondary" : "outline"} size="sm" onClick={() => setDraft({...draft(), mode: "grid"})}>
                            <Trans>Skill/tier grid</Trans>
                        </Button>
                    </div>
                </div>

                <FilterBuilder
                    node={draft().filter}
                    options={props.options}
                    disallowedFields={[...DISALLOWED_FIELDS]}
                    onChange={filter => setDraft({...draft(), filter})}
                />

                <Show when={draft().mode === "flat"}>
                    <div class="flex items-end gap-2">
                        <FlatAmountField amount={draft().flatAmount} mode={rateMode} onCommit={setFlatAmount}/>
                        <RateDirectionRow currency={draft().flatCurrency} onCurrencyChange={value => setDraft({...draft(), flatCurrency: value})}/>
                    </div>
                    <div class="flex items-center gap-2">
                        <Checkbox checked={draft().private} onChange={value => setDraft({...draft(), private: value})}/>
                        <Tooltip>
                            <TooltipTrigger>
                                <Label><Trans>Private</Trans></Label>
                            </TooltipTrigger>
                            <TooltipContent class="max-w-[90svw]">
                                <Trans>Private bounties won't be shown to others on the craft list or details, but payouts are still calculated.</Trans>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </Show>

                <Show when={draft().mode === "grid"}>
                    <div class="space-y-2">
                        <div class="flex flex-row justify-between w-full">
                            <RateDirectionRow currency={draft().gridCurrency} onCurrencyChange={value => setDraft({...draft(), gridCurrency: value})}/>
                            <Button
                                variant="ghost" size="icon" class="size-9" aria-label={_(msg`Clear grid`)}
                                onClick={() => setDraft({...draft(), gridCells: new Map()})}
                            >
                                <IconRemove class="size-4"/>
                            </Button>
                        </div>
                        <div class="flex items-center gap-2">
                            <Checkbox checked={draft().private} onChange={value => setDraft({...draft(), private: value})}/>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Label><Trans>Private</Trans></Label>
                                </TooltipTrigger>
                                <TooltipContent class="max-w-[90svw]">
                                    <Trans>Private bounties won't be shown to others on the craft list or details, but payouts are still calculated.</Trans>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <div class="flex max-h-80 overflow-auto rounded-md border">
                            <table class="sticky left-0 z-10 shrink-0 bg-background text-xs">
                                <thead class="sticky top-0 bg-background">
                                    <tr class="h-8">
                                        <th class="p-1 text-center"><Trans>Skill</Trans></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={skills()}>
                                        {skill => (
                                            <tr class="h-8">
                                                <td class="bg-background p-1 text-left font-medium">
                                                    <div
                                                        class="inline-flex items-center gap-1.5"
                                                        classList={{"text-muted-foreground": !skillsWithRecipes().has(skill.id)}}
                                                    >
                                                        <Show when={skill.iconAssetName}>
                                                            {icon => <FontIcon codepoint={icon()} class="size-4"/>}
                                                        </Show>
                                                        {skill.name}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                            <table class="text-xs">
                                <thead class="sticky top-0 bg-background">
                                    <tr class="h-8">
                                        <For each={TIERS}>{tier => <th class="p-1"><TierIcon tier={tier}/></th>}</For>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={skills()}>
                                        {(skill, rowIndex) => (
                                            <tr class="h-8">
                                                <For each={TIERS}>
                                                    {(tier, colIndex) => {
                                                        const key = `${skill.id}:${tier}`;
                                                        // A live accessor, not a precomputed value — `<For>`'s per-item callback only runs once per
                                                        // (skill, tier) pair, so a plain `draft().gridCells.get(key)` read here would freeze at
                                                        // whatever the map held on first render; reading it fresh on every call (from inside
                                                        // `GridAmountCell`'s effect) is what lets paste/clear updates actually reach the input.
                                                        // "invalid" is filtered to `null` here too — it only satisfies `useAmountField`'s ratio type,
                                                        // which only takes a real `Ratio`; the raw invalid text still lives in the field's own state.
                                                        const amount = () => {
                                                            const cell = draft().gridCells.get(key);
                                                            return cell && cell !== "invalid" ? cell : null;
                                                        };
                                                        return (
                                                            <td class="border border-input">
                                                                <GridAmountCell
                                                                    amount={amount}
                                                                    mode={rateMode}
                                                                    onCommit={value => setGridAmount(key, value)}
                                                                    onPasteFill={rows => pasteGridAmounts(rowIndex(), colIndex(), rows)}
                                                                />
                                                            </td>
                                                        );
                                                    }}
                                                </For>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Show>

                <div class="flex justify-end gap-2">
                    <Show when={props.rule}>
                        <Button variant="destructive" size="sm" disabled={busy()} onClick={del}><Trans>Delete</Trans></Button>
                    </Show>
                    <Show when={!props.rule && props.onDiscard}>
                        <Button variant="outline" size="sm" onClick={props.onDiscard}><Trans>Discard</Trans></Button>
                    </Show>
                    <Button size="sm" disabled={busy()} onClick={save}><Trans>Save</Trans></Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default function BountyRulesPage() {
    const {_} = useLingui();
    const label = useLabel();
    const {isLoggedIn, login} = useAccount();
    const {links} = useLinkedIntegrations();
    const bricoConn = useConnection(BRICO_APP_SERVER);
    const prismConn = useConnection(PRISM_SERVER);
    const {rules, upsert, remove, reorder} = createBountyRules();
    const [drafting, setDrafting] = createSignal(false);

    // The account's own linked BitCraft player ids — see `craftReferenceSelfResource`'s doc comment
    // for why this page previews only its own characters (every claim is still offered, per
    // `CraftReferenceSelf.claims`'s doc comment: a personal-ownership rule can legitimately filter
    // on a claim the account doesn't own).
    const playerIds = createMemo(() => links().filter(l => l.provider === BITCRAFT_PROVIDER).map(l => BigInt(l.externalId)));
    const reference = createCraftReferenceSelf(playerIds);

    // Own memo so a `snapshot()` rebuild (every `REBUILD_INTERVAL_MS`, see relay.ts) doesn't force
    // this to redo the recipe scan/sort — it only needs to change on a data-locale switch.
    const staticOptions = createMemo(() => craftStaticOptions());

    const options = createMemo(() => {
        const snap = reference.snapshot();
        const ownClaims = new Set(snap.claimMembers.map(cm => cm.claimEntityId));
        const byField: Partial<Record<FilterField, FieldOption[]>> = {
            region: [...snap.regions.values()]
                .map(r => ({value: r.id, label: regionDisplayName(r.name, r.id)}))
                .sort(byLabel),
            claim: [...snap.claims.values()]
                .sort((a, b) => {
                    const memberOfA = ownClaims.has(a.entityId);
                    const memberOfB = ownClaims.has(b.entityId);
                    if (memberOfA !== memberOfB) return memberOfB ? 1 : -1;
                    return compareText(claimDisplayName(a.name), claimDisplayName(b.name));
                })
                .map(c => ({value: c.entityId.toString(), label: claimDisplayName(c.name)})),
            owner: [...snap.players.values()]
                .map(p => ({value: p.entityId.toString(), label: p.name}))
                .sort(byLabel),
            item: staticOptions().item,
            itemTag: staticOptions().itemTag,
            inputItem: staticOptions().inputItem,
            inputItemTag: staticOptions().itemTag,
            skill: staticOptions().skill,
            tier: staticOptions().tier,
            buildingType: staticOptions().buildingType,
            ownerAccess: CLAIM_ACCESS_FLAGS.map(flag => ({value: flag, label: label(claimAccessFlagLabel(flag))})),
            currency: BOUNTY_CURRENCIES.map(currencyId => ({value: currencyId, label: currencyData(currencyId) ? label(currencyData(currencyId)!.label) : currencyId})),
        };
        return byField;
    });
    const optionsFor: FieldOptions = field => options()[field];

    const move = (index: number, direction: -1 | 1) => {
        const ids = rules().map(r => r.id);
        const target = index + direction;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorder(ids).catch(() => {});
    };

    return (
        <MainLayout
            title={_(msg`Bounty rules`)}
            hideSearch
            ownHeading
            description="Automatically assign bounties to your crafts."
            navTitle={breadcrumb("/account", msg`Bounty rules`)}
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
                                <CardDescription><Trans>Log in to create bounty rules.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <div class="flex items-center gap-3">
                        <Button class="ml-auto shrink-0" size="sm" onClick={() => setDrafting(true)} disabled={drafting()}>
                            <Trans>New rule</Trans>
                        </Button>
                    </div>
                    <For each={rules()}>
                        {(rule, index) => (
                            <RuleCard
                                rule={rule}
                                priority={rule.priority}
                                isFirst={index() === 0}
                                isLast={index() === rules().length - 1}
                                options={optionsFor}
                                onSave={(id, filterJson, value, priority, isPrivate) => upsert({id, filterJson, value, priority, private: isPrivate})}
                                onDelete={remove}
                                onMoveUp={() => move(index(), -1)}
                                onMoveDown={() => move(index(), 1)}
                            />
                        )}
                    </For>

                    <Show when={drafting()}>
                        <RuleCard
                            rule={null}
                            priority={rules().length}
                            isFirst
                            isLast
                            options={optionsFor}
                            onSave={(id, filterJson, value, priority, isPrivate) => upsert({id, filterJson, value, priority, private: isPrivate}).then(() => { setDrafting(false); })}
                            onDelete={async () => { setDrafting(false); }}
                            onMoveUp={() => {}}
                            onMoveDown={() => {}}
                            onDiscard={() => setDrafting(false)}
                        />
                    </Show>

                    <Show when={rules().length === 0 && !drafting()}>
                        <p class="text-sm text-muted-foreground"><Trans>No bounty rules yet.</Trans></p>
                    </Show>
                </Show>
            </div>
        </MainLayout>
    );
}
