/**
 * shown-currencies.ts — which bounty currencies the UI offers: the user's visible set plus whatever
 * the data on screen already uses, so hiding a currency never makes existing data unreadable.
 */
import {type Accessor, createEffect, createMemo} from "solid-js";
import {useLinkedIntegrations} from "~/lib/account/links";
import {absorbWalletCurrencies, shownCurrencies} from "~/lib/crafts/currency-visibility";
import {useSettings} from "~/lib/settings";

/** `BOUNTY_CURRENCIES` filtered to the visible set plus `extra()`, in vocabulary order; never empty. */
export function useShownCurrencies(extra?: () => Iterable<string>): Accessor<string[]> {
    const settings = useSettings();
    return createMemo(() => shownCurrencies(settings.visibleCurrencies(), extra?.() ?? []));
}

/**
 * Adds each currency a Stelo wallet is linked on to the visible set, once. Mount once, below both
 * the settings and linked-integrations providers.
 */
export function useWalletCurrencyAutoAdd(): void {
    const settings = useSettings();
    const links = useLinkedIntegrations();
    // A sorted string, so the effect reruns only when the set of wallet currencies changes.
    const walletCurrencies = createMemo(() => [...new Set(links.steloWallets().map(wallet => wallet.currency))].sort().join(","));
    createEffect(() => {
        if (!links.walletsReady()) return;
        const currencies = walletCurrencies() === "" ? [] : walletCurrencies().split(",");
        const absorbed = absorbWalletCurrencies(currencies, settings.seenWalletCurrencies(), settings.visibleCurrencies());
        if (!absorbed) return;
        settings.setVisibleCurrencies(absorbed.visible);
        settings.setSeenWalletCurrencies(absorbed.seen);
    });
}
