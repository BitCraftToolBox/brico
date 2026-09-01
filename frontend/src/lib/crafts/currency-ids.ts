/**
 * currency-ids.ts — the currency ids `filter-vocab.ts`/`filter-condition.tsx` have vocabulary for.
 *
 * Deliberately its own file with zero imports (not even `~/lib/labels`): `filter-vocab.ts` pulls in
 * `~/lib/labels`, which pulls in `~/lib/data-translation`, both resolved through the `~/` path alias
 * Vite provides — but `currency.test.ts` runs under plain `node --test`, which has no alias
 * resolution at all, so anything it imports (even transitively) must be either a real package
 * specifier or an alias-free relative file. Splitting the bare id list out here is what lets that
 * test check `BOUNTY_CURRENCIES` coverage without dragging in the whole label-resolution stack.
 */
export const CURRENCY_IDS = ["hex-coin"] as const;
export type VocabCurrencyId = (typeof CURRENCY_IDS)[number];
