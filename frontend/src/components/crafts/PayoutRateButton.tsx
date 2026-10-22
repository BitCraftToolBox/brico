/**
 * PayoutRateButton.tsx — a bounty rate, decimal-formatted in whichever direction `~/lib/settings`'s
 * shared `payoutDisplayMode` currently prefers. Clicking it flips that setting (and so every other
 * instance of this component, not just this one). `rate` is always currency-per-effort — storage
 * and the real ledger math (`@brico/crafts/entitlement`) never go through this, only display.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {Show} from "solid-js";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {uiLocale} from "~/lib/i18n";
import {useSettings} from "~/lib/settings";

export function PayoutRateButton(props: {rate: number; currency: string}) {
    const {_} = useLingui();
    const settings = useSettings();
    const inverted = () => settings.payoutDisplayMode() === "effortPerCurrency";
    const rateText = () => {
        const value = inverted() ? (props.rate > 0 ? 1 / props.rate : 0) : props.rate;
        return value.toLocaleString(uiLocale(), {maximumFractionDigits: 4});
    };
    return (
        <button
            class="hover:underline inline-flex flex-nowrap"
            title={_(msg`Switch between currency/effort and effort/currency`)}
            onClick={() => settings.setPayoutDisplayMode(inverted() ? "currencyPerEffort" : "effortPerCurrency")}
        >
            <Show when={inverted()} fallback={<Trans>{rateText()} <CurrencyLabel currency={props.currency} iconOnly={true}/> / effort</Trans>}>
                <Trans>{rateText()} effort / <CurrencyLabel currency={props.currency} iconOnly={true}/></Trans>
            </Show>
        </button>
    );
}
