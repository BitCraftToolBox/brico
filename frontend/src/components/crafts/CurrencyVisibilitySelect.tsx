import {BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select.tsx";
import {CurrencyLabel} from "~/lib/crafts/filter-condition.tsx";
import {useSettings} from "~/lib/settings";
import {Trans} from "@lingui/solid/macro";

/** Multi-select for which bounty currencies the site offers; unchecking the last one is ignored. */
export function CurrencyVisibilitySelect() {
    const settings = useSettings();
    return (
        <Select<string>
            multiple
            options={[...BOUNTY_CURRENCIES]}
            value={settings.visibleCurrencies()}
            onChange={values => {
                if (values.length > 0) settings.setVisibleCurrencies(values);
            }}
            itemComponent={itemProps => <SelectItem item={itemProps.item}><CurrencyLabel currency={itemProps.item.rawValue}/></SelectItem>}
        >
            <SelectTrigger class="w-48">
                <SelectValue<string>>
                    {state => {
                        const selected = state.selectedOptions();
                        return selected.length === 1
                            ? <CurrencyLabel currency={selected[0]}/>
                            : <Trans>{selected.length} currencies</Trans>;
                    }}
                </SelectValue>
            </SelectTrigger>
            <SelectContent/>
        </Select>
    );
}
