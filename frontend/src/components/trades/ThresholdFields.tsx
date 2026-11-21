/**
 * ThresholdFields.tsx — number inputs for stock thresholds; empty means "inherit".
 */
import type {StockThresholds} from "@brico/trades/stock-config";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {createEffect, createSignal, For} from "solid-js";
import {TextField, TextFieldInput} from "~/components/ui/text-field";

type Field = keyof StockThresholds;

const LABELS: Record<Field, {label: MessageDescriptor; hint: MessageDescriptor}> = {
    batchSize: {label: msg`Buy limit to set`, hint: msg`Trades, as entered in game when editing the buy order.`},
    reorderAt: {label: msg`Raise buy limit at`, hint: msg`Once the buy limit is used up and on-hand units (intake + outlet) drop to this.`},
    outletLowAt: {label: msg`Restock outlet at`, hint: msg`Move goods over once the outlet holds this many units or fewer.`},
    outletTarget: {label: msg`Restock outlet to`, hint: msg`Units to fill the outlet up to; empty moves everything.`},
};

function NumberField(props: {field: Field; value: number | undefined; inherited: string; onChange: (value: number | undefined) => void}) {
    const {_} = useLingui();
    const [text, setText] = createSignal("");
    createEffect(() => setText(props.value === undefined ? "" : String(props.value)));
    const commit = () => {
        const trimmed = text().trim();
        if (trimmed === "") return props.onChange(undefined);
        const value = Number(trimmed);
        if (Number.isInteger(value) && value >= 0 && value <= 2_147_483_646) props.onChange(value);
        else setText(props.value === undefined ? "" : String(props.value));
    };
    return (
        <label class="space-y-1 text-sm">
            <span class="font-medium">{_(LABELS[props.field].label)}</span>
            <TextField value={text()} onChange={setText}>
                <TextFieldInput
                    class="h-9"
                    inputMode="numeric"
                    placeholder={props.inherited}
                    onBlur={commit}
                    onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && commit()}
                />
            </TextField>
            <span class="block text-xs text-muted-foreground">{_(LABELS[props.field].hint)}</span>
        </label>
    );
}

/** `inherited(field)` is the placeholder shown when the field is empty, e.g. the claim default. */
export function ThresholdFields(props: {
    fields: readonly Field[];
    value: StockThresholds;
    inherited: (field: Field) => string;
    onChange: (value: StockThresholds) => void;
}) {
    return (
        <div class="grid gap-3 sm:grid-cols-2">
            <For each={props.fields}>
                {field => (
                    <NumberField
                        field={field}
                        value={props.value[field]}
                        inherited={props.inherited(field)}
                        onChange={value => {
                            const next = {...props.value};
                            if (value === undefined) delete next[field];
                            else next[field] = value;
                            props.onChange(next);
                        }}
                    />
                )}
            </For>
        </div>
    );
}
