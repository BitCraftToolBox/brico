import {Show} from "solid-js";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx";
import {useShownCurrencies} from "~/lib/crafts/shown-currencies";
import {CurrencyLabel} from "~/lib/crafts/filter-condition.tsx";
import {cn} from "~/lib/utils";

/** Offers the shown currencies plus the current value; with a single option it is just the label. */
export function CurrencySelect(props: { value: string; onChange: (value: string) => void; class?: string }) {
    const options = useShownCurrencies(() => [props.value]);
    return (
        <Show
            when={options().length > 1}
            fallback={<CurrencyLabel currency={options()[0]}/>}
        >
            <Select
                value={props.value}
                onChange={value => value && value !== props.value && props.onChange(value)}
                options={options()}
                itemComponent={itemProps => <SelectItem item={itemProps.item}><CurrencyLabel currency={itemProps.item.rawValue}/></SelectItem>}
            >
                <SelectTrigger class={cn("h-9 w-40", props.class)}>
                    <SelectValue<string>>{state => <CurrencyLabel currency={state.selectedOption()}/>}</SelectValue>
                </SelectTrigger>
                <SelectContent/>
            </Select>
        </Show>
    );
}
