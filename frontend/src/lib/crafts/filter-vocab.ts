/**
 * filter-vocab.ts — the frontend-side translation layer for `@brico/crafts/filter`'s vocabulary.
 *
 * `common/crafts/filter.ts` is deliberately framework-free (see its own doc comment), so none of its
 * field/comparator/quantifier/currency vocabulary can carry a `msg` descriptor at the source, and
 * none of it is reachable by `npm run i18n:extract` either way (`frontend/lingui.config.ts`'s one
 * catalog is `include: ["src"]` — a glob-scoped scan of `frontend/src`, confirmed by reading
 * `scripts/i18n/extract.mjs`, not an import-graph walk that could see into `common/crafts`). This
 * file is the frontend-only mirror, resolving all of it through plain Lingui `msg` — this is
 * brico's own filter-builder terminology, not game vocabulary, so (unlike currency, below) none of
 * it goes through `gameText()`.
 *
 * Every map here is a plain (non-`Partial`) `Record` keyed by a closed literal union
 * (`FilterField`/`Comparator`/`Quantifier`), so TypeScript itself refuses to compile if
 * `common/crafts/filter.ts` grows a new field/comparator/quantifier and this file isn't updated to
 * match — deliberately not the sparse-`Partial`-plus-English-fallback shape `game-strings.ts` uses
 * for large, externally-sourced game vocabulary, since this vocabulary is small and app-authored.
 *
 * Plain `.ts`, no JSX — the currency *icon* (which needs JSX) lives in the sibling
 * `filter-condition.tsx` instead. This file still isn't importable by plain `node --test`, though
 * (it pulls in `~/lib/labels`, which pulls in `~/lib/data-translation`, both resolved through Vite's
 * `~/` alias, which plain Node has no resolver for) — that's why `CURRENCY_IDS` lives in the
 * separate, zero-import `currency-ids.ts`, which `currency.test.ts` imports directly instead of
 * going through this file.
 */
import {type ClaimAccessFlag, type Comparator, type FilterField, type Quantifier} from "@brico/crafts/filter";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {type VocabCurrencyId} from "~/lib/crafts/currency-ids";
import {gameText, type Label} from "~/lib/labels";

// ── Field labels ─────────────────────────────────────────────

const FIELD_LABELS: Record<FilterField, MessageDescriptor> = {
    region: msg`Region`,
    claim: msg`Claim`,
    item: msg`Output item`,
    itemTag: msg`Output item tag`,
    inputItem: msg`Input item`,
    inputItemTag: msg`Input item tag`,
    skill: msg`Skill`,
    tier: msg`Tier`,
    buildingType: msg`Building`,
    effortTotal: msg`Total effort`,
    effortRemaining: msg`Remaining effort`,
    public: msg`Public`,
    complete: msg`Complete`,
    owner: msg`Owner`,
    ownerAccess: msg`Owner's claim access`,
    payout: msg`Payout`,
    currency: msg`Currency`,
};

export function fieldLabel(field: FilterField): Label {
    return FIELD_LABELS[field];
}

// ── Comparator / quantifier labels ───────────────────────────

/** Reads as the leaf's subject: "Any input item is...", "Every input item is...". */
const QUANTIFIER_LABELS: Record<Quantifier, MessageDescriptor> = {
    any: msg`Any`,
    all: msg`Every`,
};

export function quantifierLabel(quantifier: Quantifier): Label {
    return QUANTIFIER_LABELS[quantifier];
}

const CMP_LABELS: Record<Comparator, MessageDescriptor> = {
    eq: msg`is`,
    neq: msg`is not`,
    in: msg`is any of`,
    notIn: msg`is none of`,
    gte: msg`at least`,
    lte: msg`at most`,
    all: msg`has all of`,
};

export function cmpLabel(cmp: Comparator): Label {
    return CMP_LABELS[cmp];
}

// ── Claim access flag labels ─────────────────────────────────
//
// The `ownerAccess` field's own closed vocabulary (`common/crafts/filter.ts`'s
// `CLAIM_ACCESS_FLAG_LABELS`) has the exact same problem as the field/comparator labels above —
// small, app-authored, unreachable by Lingui — just missed in the first pass. Same exhaustive-Record
// treatment.

const CLAIM_ACCESS_FLAG_LABELS_I18N: Record<ClaimAccessFlag, MessageDescriptor> = {
    member: msg`Member`,
    build: msg`Build`,
    inventory: msg`Storage`,
    officer: msg`Officer`,
    coOwner: msg`Co-owner`,
    owner: msg`Owner`,
};

export function claimAccessFlagLabel(flag: ClaimAccessFlag): Label {
    return CLAIM_ACCESS_FLAG_LABELS_I18N[flag];
}

// ── Currency data (id/label only — see filter-vocab.tsx for the icon-bearing `CurrencyVocab`) ──

/**
 * A currency's translatable identity, minus the icon (JSX, so it lives in `filter-vocab.tsx`
 * instead). `Label`, not a bare `MessageDescriptor` — `hex-coin` is a real BitCraft item, so its
 * label goes through `gameText()` to read as the game's own name, with Crowdin still able to
 * override it.
 */
export interface CurrencyData {
    id: string;
    label: Label;
}

/**
 * Keyed by `VocabCurrencyId` (from `currency-ids.ts`), so TypeScript itself catches a currency added
 * there without a matching entry here — but `currencyData()` below still takes a plain `string`
 * and returns `| undefined`, since the actual source of truth for "what currencies exist",
 * `BOUNTY_CURRENCIES` in `filter.ts`, is deliberately typed `readonly string[]`, not a closed literal
 * union (see its doc comment — adding a currency is meant to be an additive allow-list entry, not a
 * schema migration). `currency.test.ts` covers *that* gap — `VocabCurrencyId` catching up with
 * `BOUNTY_CURRENCIES` — with a CI-time coverage check instead of a compiler one.
 */
const CURRENCY_DATA: Record<VocabCurrencyId, CurrencyData> = {
    "hex-coin": {id: "hex-coin", label: gameText(msg`Hex Coin`)},
};

export function currencyData(currency: string): CurrencyData | undefined {
    return (CURRENCY_DATA as Record<string, CurrencyData>)[currency];
}
