/**
 * currency-ids.ts — the currency ids `filter-vocab.ts`/`filter-condition.tsx` have vocabulary for.
 *
 * Deliberately its own file with zero imports so `currency.test.ts` can under plain `node --test`.
 */
export const CURRENCY_IDS = ["hex-coin", "stelo-hex-coin", "solis-lux"] as const;
export type VocabCurrencyId = (typeof CURRENCY_IDS)[number];
