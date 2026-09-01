/**
 * payout.ts — display-time conversion between the engine's fixed bounty ratio shape (always
 * currency-per-effort, see `@brico/crafts/subject`'s `CraftSubject.payout` doc comment) and
 * whichever direction the user prefers to read/type rates in (`PayoutDisplayMode`, `~/lib/settings`).
 *
 * Storage and the real ledger math (`@brico/crafts/entitlement`) never go through this — only the
 * craft browser's columns, a craft's detail page, and the bounty rule builder's amount inputs do.
 */
import {parseDecimalRatio, reduceRatio} from "@brico/crafts/entitlement";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {createEffect, createSignal} from "solid-js";
import {currencyData} from "~/lib/crafts/filter-vocab";
import {uiLocale} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import type {PayoutDisplayMode} from "~/lib/settings";

/** An exact currency-per-effort fraction — never a float, never a re-parsed decimal string, so repeatedly flipping `PayoutDisplayMode` can't drift it (`1/18` has no finite decimal representation, so round-tripping it through a decimal string and back loses precision every time). */
export type Ratio = {numerator: bigint; denominator: bigint};

/** `"0.05 Hex Coin / effort"` or, inverted, `"20 effort / Hex Coin"` — `rate` is always currency-per-effort. */
export function formatPayoutRate(rate: number, currency: string, mode: PayoutDisplayMode): string {
    const {_} = useLingui();
    const label = useLabel();
    const data = currencyData(currency);
    const currencyLabel = data ? label(data.label) : currency;
    const value = mode === "effortPerCurrency" ? (rate > 0 ? 1 / rate : 0) : rate;
    const rateText = value.toLocaleString(uiLocale(), {maximumFractionDigits: 4});
    return _(mode === "effortPerCurrency" ? msg`${rateText} effort / ${currencyLabel}` : msg`${rateText} ${currencyLabel} / effort`);
}

/** An exact currency-per-effort ratio, as the plain decimal amount `mode` would display it as. */
export function ratioToDisplayAmount(ratioNumerator: bigint, ratioDenominator: bigint, mode: PayoutDisplayMode): string {
    if (ratioNumerator === 0n) return "0";
    const value = mode === "effortPerCurrency"
        ? Number(ratioDenominator) / Number(ratioNumerator)
        : Number(ratioNumerator) / Number(ratioDenominator);
    return String(value);
}

/**
 * Parses a decimal amount typed under `mode` into an exact currency-per-effort ratio — the inverse
 * of `ratioToDisplayAmount`. `null` when `input` isn't a plain non-negative decimal, or when an
 * `effortPerCurrency` amount of `0` would invert to a division by zero.
 */
export function parseRateInput(input: string, mode: PayoutDisplayMode): {numerator: bigint; denominator: bigint} | null {
    const parsed = parseDecimalRatio(input.trim());
    if (!parsed) return null;
    if (mode === "currencyPerEffort") return parsed;
    if (parsed.numerator === 0n) return null;
    return reduceRatio(parsed.denominator, parsed.numerator);
}

function ratioEquals(a: Ratio | null, b: Ratio | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.numerator === b.numerator && a.denominator === b.denominator;
}

/**
 * An amount field's local typed text, decoupled from the canonical (`Ratio`) model value so a
 * keystroke is never fought by a reactive re-render mid-edit — the field only reformats itself on
 * blur (`commit`), when `mode` flips underneath it, or when `ratio` changes to a value it didn't
 * itself just commit (an *external* change — e.g. another cell's paste fanning out into this one),
 * never on every character typed.
 *
 * Reformatting always re-derives display text from `lastRatio` — the exact bigint fraction last
 * committed or externally supplied — never by re-parsing the *displayed* decimal string. That
 * distinction matters: `ratioToDisplayAmount` necessarily goes through a float divide to produce a
 * decimal string (`1/18` has no finite decimal representation), so re-parsing that string back into a
 * "ratio" after every toggle would compound the rounding error each time (flip, flip back, flip again
 * → `18.000000000000004`); starting over from the original bigints every time keeps every reformat
 * exact regardless of how many times direction gets flipped.
 */
export function useAmountField(mode: () => PayoutDisplayMode, ratio: () => Ratio | null, onCommit: (ratio: Ratio | null, rawText: string) => void) {
    const initial = ratio();
    const [text, setText] = createSignal(initial ? ratioToDisplayAmount(initial.numerator, initial.denominator, mode()) : "");
    let activeMode = mode();
    let lastRatio = initial;
    createEffect(() => {
        const nextMode = mode();
        const nextRatio = ratio();
        if (nextMode !== activeMode) {
            activeMode = nextMode;
            if (lastRatio) setText(ratioToDisplayAmount(lastRatio.numerator, lastRatio.denominator, nextMode));
        }
        if (!ratioEquals(nextRatio, lastRatio)) {
            lastRatio = nextRatio;
            setText(nextRatio ? ratioToDisplayAmount(nextRatio.numerator, nextRatio.denominator, activeMode) : "");
        }
    });
    const commit = () => {
        const trimmed = text().trim();
        const parsed = parseRateInput(trimmed, activeMode);
        lastRatio = parsed;
        if (parsed) setText(ratioToDisplayAmount(parsed.numerator, parsed.denominator, activeMode));
        onCommit(parsed, trimmed);
    };
    return {text, setText, commit};
}
