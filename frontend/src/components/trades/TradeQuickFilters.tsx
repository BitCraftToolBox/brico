/**
 * TradeQuickFilters.tsx — the trade finder's multi-select pickers and "hide full shops" toggle.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {type FieldOption, OptionPicker} from "~/components/crafts/FilterBuilder";
import {Checkbox} from "~/components/ui/checkbox";
import {Label} from "~/components/ui/label";
import type {TradeFilter} from "~/lib/trades/filter";

export type TradeFilterField = "offered" | "requested" | "shops" | "claims" | "players" | "shopTypes";

/**
 * Reads `options` through `props` so the `OptionPicker` is created once: the page hands in fresh
 * option lists on a timer, and rebuilding the element would close an open dropdown.
 */
function Picker(props: {options: FieldOption[]; selected: string[]; placeholder: string; onChange: (values: string[]) => void}) {
    return (
        <OptionPicker
            options={props.options}
            selected={props.selected}
            multiple
            placeholder={props.placeholder}
            onChange={values => props.onChange(values as string[])}
        />
    );
}

export function TradeQuickFilters(props: {
    filter: TradeFilter;
    options: (field: TradeFilterField) => FieldOption[];
    onChange: (filter: TradeFilter) => void;
}) {
    const {_} = useLingui();
    const set = (field: TradeFilterField) => (values: string[]) => props.onChange({...props.filter, [field]: values});
    const picker = (field: TradeFilterField, placeholder: string) => (
        <Picker options={props.options(field)} selected={props.filter[field]} placeholder={placeholder} onChange={set(field)}/>
    );
    return (
        <div class="space-y-3">
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {picker("offered", _(msg`Offered item`))}
                {picker("requested", _(msg`Requested item`))}
                {picker("shopTypes", _(msg`Shop type`))}
                {picker("shops", _(msg`Shop`))}
                {picker("claims", _(msg`Claim`))}
                {picker("players", _(msg`Player`))}
            </div>
            <div class="flex items-center gap-2">
                <Checkbox checked={props.filter.hideFull} onChange={(checked: boolean) => props.onChange({...props.filter, hideFull: checked})}/>
                <Label><Trans>Hide full shops</Trans></Label>
            </div>
        </div>
    );
}
