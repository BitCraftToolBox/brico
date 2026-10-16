/**
 * currency-visibility.ts — pure rules for which bounty currencies a user sees. Imports only package
 * specifiers so `currency-visibility.test.ts` runs under plain `node --test`.
 */
import {BOUNTY_CURRENCIES} from "@brico/crafts/currencies";

export const DEFAULT_VISIBLE_CURRENCIES: readonly string[] = ["hex-coin", "stelo-hex-coin"];

/** Drops unknown ids and duplicates, in `BOUNTY_CURRENCIES` order; never empty (falls back to the default). */
export function sanitizeVisibleCurrencies(raw: unknown): string[] {
    const wanted = new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
    const kept = BOUNTY_CURRENCIES.filter(id => wanted.has(id));
    return kept.length > 0 ? kept : [...DEFAULT_VISIBLE_CURRENCIES];
}

/** `BOUNTY_CURRENCIES` filtered to `visible ∪ extra`, in `BOUNTY_CURRENCIES` order; never empty. */
export function shownCurrencies(visible: readonly string[], extra: Iterable<string> = []): string[] {
    const wanted = new Set([...visible, ...extra]);
    const shown = BOUNTY_CURRENCIES.filter(id => wanted.has(id));
    return shown.length > 0 ? shown : [...DEFAULT_VISIBLE_CURRENCIES];
}

/**
 * Wallet currencies not yet in `seen`, to be appended to the visible set once. The result of the
 * whole step is `{visible, seen}`; unchanged inputs return `null`.
 */
export function absorbWalletCurrencies(
    walletCurrencies: readonly string[],
    seen: readonly string[],
    visible: readonly string[],
): {visible: string[]; seen: string[]} | null {
    const fresh = walletCurrencies.filter(id => !seen.includes(id));
    if (fresh.length === 0) return null;
    return {
        visible: sanitizeVisibleCurrencies([...visible, ...fresh]),
        seen: [...seen, ...fresh],
    };
}
