/**
 * currencies.ts - Framework-free source of truth for supported currency types/enums.
 */

/**
 * The bounty currencies a craft's payout can be denominated in.
 */
export const BOUNTY_CURRENCIES: readonly string[] = ["hex-coin", "stelo-hex-coin"];
/**
 * The currencies that are trust-based ledgers. Payers can make payouts to these without verification.
 */
export const MANUALLY_RECORDED_BOUNTY_CURRENCIES: readonly string[] = ["hex-coin"];
/**
 * The currencies whose payouts are backed by funds `brico-bot` holds in escrow on Stelo; the module
 * requires a funded hold before such a bounty can be assigned.
 */
export const ESCROWED_BOUNTY_CURRENCIES: readonly string[] = ["stelo-hex-coin"];

export const CURRENCY_LABELS: Record<string, string> = {
    "hex-coin": "Hex Coin",
    "stelo-hex-coin": "Stelo Hex Coin",
};

export const CURRENCY_EMOJI: Record<string, string> = {
    "hex-coin": "<:HexCoin:1555600295235559514>",
    "stelo-hex-coin": "<:Stelo:1555606560028368936>",
};