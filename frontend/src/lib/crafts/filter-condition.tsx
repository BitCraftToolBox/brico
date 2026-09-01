/**
 * filter-condition.tsx — the JSX half of the filter vocabulary translation layer.
 *
 * Split from `filter-vocab.ts` (which has the plain label/data maps, and can't share this file's
 * name since `.ts`/`.tsx` siblings with the same basename are an ambiguous import target) purely so
 * that file stays JSX-free — not that it matters for `node --test` on its own (it still pulls in
 * `~/lib/labels`), but see `currency-ids.ts` for the file that actually has to stay import-light.
 */
import {type ClaimAccessFlag, type Comparator, FIELDS, type FilterField, type FilterLeaf, type FilterNode, type FilterValue, isLeaf,} from "@brico/crafts/filter";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {type JSX, Match, Show, Switch} from "solid-js";
import {getAssetURL} from "~/lib/bitcraft-utils.ts";
import type {VocabCurrencyId} from "~/lib/crafts/currency-ids";
import {claimAccessFlagLabel, cmpLabel, type CurrencyData, currencyData, fieldLabel, quantifierLabel} from "~/lib/crafts/filter-vocab";
import {type Label, type LabelResolver, useLabel} from "~/lib/labels";

// ── Currency vocabulary ───────────────────────────────────────

/**
 * A currency's full display identity: `filter-vocab.ts`'s `CurrencyData` plus an icon, for
 * space-constrained or purely-visual spots.
 *
 * Two consumption shapes read off the same entry: `<>{vocab.icon()} {label(vocab.label)}</>` where
 * space allows, or `<span title={label(vocab.label)}>{vocab.icon()}</span>` where it doesn't (e.g.
 * next to a payout number in a table cell).
 */
export interface CurrencyVocab extends CurrencyData {
    icon: () => JSX.Element;
}

/** Icons keyed the same as `filter-vocab.ts`'s `CURRENCY_DATA` — kept separate since it's JSX. */
const CURRENCY_ICONS: Record<VocabCurrencyId, () => JSX.Element> = {
    "hex-coin": () => <img src={getAssetURL("Items/HexCoin")} class="size-4" alt="hex-coin"/>,
};

export function currencyVocab(currency: string): CurrencyVocab | undefined {
    const data = currencyData(currency);
    const icon = (CURRENCY_ICONS as Partial<Record<string, () => JSX.Element>>)[currency];
    return data && icon ? {...data, icon} : undefined;
}

/**
 * The two consumption shapes `CurrencyVocab`'s doc comment describes, in one reusable component:
 * icon + label by default (currency `<Select>` items, filter option lists — anywhere space allows
 * full identification), or `iconOnly` for space-constrained spots (a payout number in a table cell),
 * where the label becomes the icon's tooltip instead of adjacent text. Falls back to the bare
 * currency id, untranslated, for a currency this file has no vocabulary for yet — same "never worse
 * than today" fallback the old `CURRENCY_LABELS[id] ?? id` call sites had.
 */
export function CurrencyLabel(props: {currency: string; iconOnly?: boolean}) {
    const label = useLabel();
    const vocab = () => currencyVocab(props.currency);
    return (
        <Show when={vocab()} fallback={<span>{props.currency}</span>}>
            {v => (
                <Show
                    when={props.iconOnly}
                    fallback={<span class="align-bottom inline-flex items-center gap-1">{v().icon()} {label(v().label)}</span>}
                >
                    <span title={label(v().label)} class="flex items-center">{v().icon()}</span>
                </Show>
            )}
        </Show>
    );
}

// ── Condition phrase (FilterBuilder's `LeafRow`) ──────

/**
 * Renders one leaf's condition as a single translatable phrase, with `field`/`cmp`/`value` (and
 * `quantifier`, when the field is quantified) as opaque, already-rendered placeholders. One
 * `<Match>`/`<Trans>` per `Comparator`
 * (crossed with "is this field quantified" for the four comparators a quantified field can use),
 * rather than one fixed `{quantifier} {field} {cmp} {value}` skeleton, so a translator can reorder
 * or restructure any single comparator's phrase independently instead of being forced to keep every
 * comparator's wording symmetric. Several of these render identically today (Lingui dedupes call
 * sites with identical extracted content into one catalog entry), but each is its own call site so a
 * comparator whose grammar needs to diverge later — a different word order, a completely different
 * clause shape — can be pulled out on its own without disturbing the rest.
 *
 * Shared by `LeafRow` (where `field`/`cmp`/`value`/`quantifier` are the live, editable controls) and
 * `describeFilterLocalized` (where they're plain resolved text) — same templates, same catalog
 * entries, two different sets of placeholder content.
 */
export function ConditionPhrase(props: {
    quantified: boolean;
    cmp: Comparator;
    quantifier: JSX.Element;
    field: JSX.Element;
    cmpEl: JSX.Element;
    value: JSX.Element;
}) {
    // Destructured to plain identifiers so Lingui's macro names the extracted placeholders after
    // them (`{field}`, `{cmpEl}`, `{value}`) instead of falling back to positional `{0} {1} {2}` —
    // it only does the named form for a bare identifier, not a member expression like
    // `props.field` (see `labels.ts`'s `interpolate` doc comment for the same rule applied to
    // `msg` templates). Safe to destructure here despite Solid's usual "don't destructure props"
    // warning: `field`/`cmpEl`/`value` are read exactly once per render either way (every branch
    // below needs all three, so this doesn't change *when* or *how often* their getters run), and
    // `LeafRow` never keeps a `ConditionPhrase` mounted across a prop change in the first place —
    // an edit rebuilds the whole row (see `GroupEditor`'s `For` comment), so there is no "prop
    // changed under a live component" case for a destructure to go stale against.
    const {field, cmpEl, value} = props;
    return (
        <Switch fallback={<Trans>{field} {cmpEl} {value}</Trans>}>
            <Match when={props.quantified}>
                <QuantifiedConditionPhrase cmp={props.cmp} quantifier={props.quantifier} field={field} cmpEl={cmpEl} value={value}/>
            </Match>
            <Match when={props.cmp === "eq"}>
                <Trans context={"equals"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "neq"}>
                <Trans context={"not equals"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "in"}>
                <Trans context={"in"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "notIn"}>
                <Trans context={"not in"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "gte"}>
                <Trans context={"greater or equal"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "lte"}>
                <Trans context={"less or equal"}>{field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "all"}>
                <Trans context={"all"}>{field} {cmpEl} {value}</Trans>
            </Match>
        </Switch>
    );
}

/**
 * Split out from `ConditionPhrase` so `quantifier` — unlike `field`/`cmpEl`/`value` — is only ever
 * read (its prop getter only ever invoked, its backing `<Select>` only ever constructed) when a
 * quantified branch actually renders. Destructuring it inline in `ConditionPhrase` instead would
 * read every prop unconditionally up front, forcing the quantifier `<Select>` to be built even for
 * the (large majority of) non-quantified fields that never display it.
 */
function QuantifiedConditionPhrase(props: {cmp: Comparator, quantifier: JSX.Element; field: JSX.Element; cmpEl: JSX.Element; value: JSX.Element}) {
    const {quantifier, field, cmpEl, value} = props;
    return (
        <Switch>
            <Match when={props.cmp === "eq"}>
                <Trans context={"equals"}>{quantifier} {field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "neq"}>
                <Trans context={"not equals"}>{quantifier} {field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "in"}>
                <Trans context={"in"}>{quantifier} {field} {cmpEl} {value}</Trans>
            </Match>
            <Match when={props.cmp === "notIn"}>
                <Trans context={"not in"}>{quantifier} {field} {cmpEl} {value}</Trans>
            </Match>
        </Switch>
    );
}

// ── Read-only description (SavedFiltersDialog's import preview) ─

/**
 * The localized equivalent of `@brico/crafts/filter`'s `describeFilter` — same `FilterNode` walk,
 * same per-comparator phrase templates as `LeafRow` (via `ConditionPhrase`), but with plain resolved
 * text/labels as the placeholders instead of live editable controls. `describeFilter` itself stays
 * English-only and in `@brico/crafts` — it's also `brico-bot`'s summarizer, where no i18n exists or
 * should (see the design doc).
 *
 * `labelFor` resolves an id/number to a display label exactly like `describeFilter`'s own parameter.
 */
export function describeFilterLocalized(
    node: FilterNode,
    label: LabelResolver,
    labelFor: (field: FilterField, value: FilterValue) => string = (_f, v) => String(v),
): JSX.Element {
    if (isLeaf(node)) return <LeafPhrase leaf={node} label={label} labelFor={labelFor}/>;
    if (node.op === "not") return <Trans>not ({describeFilterLocalized(node.child, label, labelFor)})</Trans>;
    if (node.children.length === 0) return node.op === "and" ? <Trans>everything</Trans> : <Trans>nothing</Trans>;
    if (node.children.length === 1) return describeFilterLocalized(node.children[0], label, labelFor);
    return (
        <>
            {node.children.map((child, index) => (
                <>
                    {index > 0 && (node.op === "and" ? <Trans> and </Trans> : <Trans> or </Trans>)}
                    {isLeaf(child) ? describeFilterLocalized(child, label, labelFor) : <>({describeFilterLocalized(child, label, labelFor)})</>}
                </>
            ))}
        </>
    );
}

function LeafPhrase(props: {
    leaf: FilterLeaf;
    label: LabelResolver;
    labelFor: (field: FilterField, value: FilterValue) => string;
}) {
    const meta = () => FIELDS[props.leaf.field];
    const values = () => (Array.isArray(props.leaf.value) ? props.leaf.value : [props.leaf.value]);
    const renderValue = (value: FilterValue): string => {
        const kind = meta()?.kind;
        if (kind === "bool") return value ? props.label(msg`Yes`) : props.label(msg`No`);
        // A flag is a fixed, closed vocabulary too — its label doesn't depend on live game data, so
        // it's rendered here rather than pushed onto every caller's `labelFor`, same as
        // `describeFilter` itself.
        if (kind === "flag") return props.label(claimAccessFlagLabel(value as ClaimAccessFlag));
        if (kind === "currency") {
            const vocab = currencyData(value as string);
            return vocab ? props.label(vocab.label as Label) : String(value);
        }
        return props.labelFor(props.leaf.field, value);
    };
    const valueText = () => values().map(renderValue).join(", ");
    const valueEl = () => (Array.isArray(props.leaf.value) ? `[${valueText()}]` : valueText());

    return (
        <ConditionPhrase
            quantified={meta()?.quantified === true}
            cmp={props.leaf.cmp}
            quantifier={props.label(quantifierLabel(props.leaf.quantifier ?? "any"))}
            field={props.label(fieldLabel(props.leaf.field))}
            cmpEl={props.label(cmpLabel(props.leaf.cmp))}
            value={valueEl()}
        />
    );
}
