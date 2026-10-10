/**
 * funding-wallet.ts — pure rules for the wallet a bounty rule or override names as its funding source.
 * Imports only package specifiers so `funding-wallet.test.ts` runs under plain `node --test`.
 */
import {ESCROWED_BOUNTY_CURRENCIES} from "@brico/crafts/filter";

export interface WalletChoice {
    linkId: bigint;
    currency: string;
}

export const isEscrowCurrency = (currency: string): boolean => ESCROWED_BOUNTY_CURRENCIES.includes(currency);

/**
 * - `none`: the currency has no funding wallet.
 * - `missing`: an escrow currency with no wallet chosen.
 * - `invalid`: the chosen wallet is not one of the caller's active wallets on this currency.
 */
export type FundingWalletState = "none" | "missing" | "invalid" | "ok";

export function fundingWalletState(currency: string, value: bigint | null, wallets: readonly WalletChoice[]): FundingWalletState {
    if (!isEscrowCurrency(currency)) return "none";
    if (value === null) return "missing";
    return wallets.some(wallet => wallet.linkId === value && wallet.currency === currency) ? "ok" : "invalid";
}

/**
 * The wallet to carry into `currency`: none for a trust currency, the current one if it is valid there,
 * the only wallet if there is exactly one, otherwise nothing (several are never guessed).
 */
export function walletForCurrency(currency: string, current: bigint | null, wallets: readonly WalletChoice[]): bigint | null {
    if (!isEscrowCurrency(currency)) return null;
    const onCurrency = wallets.filter(wallet => wallet.currency === currency);
    if (current !== null && onCurrency.some(wallet => wallet.linkId === current)) return current;
    return onCurrency.length === 1 ? onCurrency[0].linkId : null;
}
