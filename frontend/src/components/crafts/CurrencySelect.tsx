import {BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx";
import {CurrencyLabel} from "~/lib/crafts/filter-condition.tsx";

export function CurrencySelect(props: { value: string; onChange: (value: string) => void }) {
    return (
        <Select
            value={props.value}
            onChange={value => value && props.onChange(value)}
            options={[...BOUNTY_CURRENCIES]}
            itemComponent={itemProps => <SelectItem item={itemProps.item}><CurrencyLabel currency={itemProps.item.rawValue}/></SelectItem>}
        >
            <SelectTrigger class="h-9 w-40">
                <SelectValue<string>>{state => <CurrencyLabel currency={state.selectedOption()}/>}</SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );
}