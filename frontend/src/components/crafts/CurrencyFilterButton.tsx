import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {createMemo, Show} from "solid-js";
import {ValueFilterPopover} from "~/components/data-table/value-filter-popover";
import {currencyVocab} from "~/lib/crafts/filter-condition";
import {useLabel} from "~/lib/labels";

/**
 * Multi-select currency filter for the reports. `selected` is owned by the page (empty means all
 * currencies); hidden when there are fewer than two currencies to choose between.
 */
export function CurrencyFilterButton(props: {currencies: readonly string[]; selected: readonly string[]; onChange: (selected: string[]) => void}) {
    const {_} = useLingui();
    const label = useLabel();
    const options = createMemo(() => props.currencies.map(currency => {
        const vocab = currencyVocab(currency);
        return {
            value: currency,
            label: vocab ? label(vocab.label) : currency,
            icon: vocab ? () => vocab.icon() : undefined,
        };
    }));

    return (
        <Show when={props.currencies.length >= 2}>
            <ValueFilterPopover title={_(msg`Currency`)} options={options()} selected={props.selected} onChange={props.onChange}/>
        </Show>
    );
}
