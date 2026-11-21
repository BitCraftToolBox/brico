/**
 * StockOverrideDialog.tsx — per (shop, good) thresholds for one stock line.
 *
 * Buy-side fields are stored under the intake stall, sell-side under the outlet; an unlinked line
 * has one stall, so both land in the same override.
 */
import {overrideKey, type StockConfig, type StockOverride, type StockThresholds} from "@brico/trades/stock-config";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {createEffect, createSignal, Show} from "solid-js";
import type {StockRow} from "~/components/trades/stock-columns";
import {GoodLabel} from "~/components/trades/StockIssues";
import {ThresholdFields} from "~/components/trades/ThresholdFields";
import {Button} from "~/components/ui/button";
import {Checkbox} from "~/components/ui/checkbox";
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Label} from "~/components/ui/label";

const BUY = ["batchSize", "reorderAt"] as const;
const SELL = ["outletLowAt", "outletTarget"] as const;

function pick(override: StockOverride | undefined, fields: readonly (keyof StockThresholds)[]): StockThresholds {
    const out: StockThresholds = {};
    for (const field of fields) if (override?.[field] !== undefined) out[field] = override[field];
    return out;
}

/** The placeholder for an empty field: the claim default, else the built-in one. */
export function inheritedText(config: StockConfig, field: keyof StockThresholds, label: (message: MessageDescriptor) => string): string {
    const value = config.defaults[field];
    if (value !== undefined) return label(msg`claim default: ${value}`);
    if (field === "reorderAt" || field === "outletLowAt") return label(msg`default: 0`);
    if (field === "outletTarget") return label(msg`default: move everything`);
    return label(msg`not set`);
}

export function StockOverrideDialog(props: {
    row: StockRow | null;
    config: StockConfig;
    onClose: () => void;
    onSave: (config: StockConfig) => void;
}) {
    const {_} = useLingui();
    const [buy, setBuy] = createSignal<StockThresholds>({});
    const [sell, setSell] = createSignal<StockThresholds>({});
    const [ignore, setIgnore] = createSignal(false);

    const keys = () => {
        const line = props.row?.line;
        return line ? {intake: overrideKey(line.intakeShopId, line.good), outlet: overrideKey(line.outletShopId, line.good)} : null;
    };
    createEffect(() => {
        const k = keys();
        if (!k) return;
        const intake = props.config.overrides[k.intake];
        const outlet = props.config.overrides[k.outlet];
        setBuy(pick(intake, BUY));
        setSell(pick(outlet, SELL));
        setIgnore(intake?.ignore === true || outlet?.ignore === true);
    });

    const save = () => {
        const k = keys();
        if (!k) return;
        const overrides = {...props.config.overrides};
        const write = (key: string, fields: readonly (keyof StockThresholds)[], values: StockThresholds) => {
            const next: StockOverride = {...overrides[key]};
            for (const field of fields) delete next[field];
            Object.assign(next, values);
            if (ignore()) next.ignore = true;
            else delete next.ignore;
            if (Object.keys(next).length) overrides[key] = next;
            else delete overrides[key];
        };
        write(k.intake, BUY, buy());
        write(k.outlet, SELL, sell());
        props.onSave({...props.config, overrides});
        props.onClose();
    };

    return (
        <Dialog open={props.row !== null} onOpenChange={open => !open && props.onClose()}>
            <DialogContent class="max-w-xl">
                <Show when={props.row}>
                    {row => (
                        <>
                            <DialogHeader>
                                <DialogTitle class="flex items-center gap-2"><GoodLabel line={row().line}/></DialogTitle>
                            </DialogHeader>
                            <div class="space-y-4">
                                <div class="space-y-2">
                                    <h3 class="text-sm font-medium"><Trans>Buying in {row().intakeName}</Trans></h3>
                                    <ThresholdFields fields={BUY} value={buy()} inherited={field => inheritedText(props.config, field, _)} onChange={setBuy}/>
                                </div>
                                <div class="space-y-2">
                                    <h3 class="text-sm font-medium"><Trans>Selling in {row().outletName}</Trans></h3>
                                    <ThresholdFields fields={SELL} value={sell()} inherited={field => inheritedText(props.config, field, _)} onChange={setSell}/>
                                </div>
                                <div class="flex items-center gap-2">
                                    <Checkbox checked={ignore()} onChange={setIgnore}/>
                                    <Label><Trans>Don't list this item under "Needs attention"</Trans></Label>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => props.onClose()}><Trans>Cancel</Trans></Button>
                                <Button onClick={save}><Trans>Save</Trans></Button>
                            </DialogFooter>
                        </>
                    )}
                </Show>
            </DialogContent>
        </Dialog>
    );
}
