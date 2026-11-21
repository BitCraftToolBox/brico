/**
 * ShopInventoryView.tsx — a shop's pockets (items, then cargo) or its per-good totals.
 */
import type {ItemStack, ShopInventory} from "@brico/bindings/prism/types";
import {inventoryCounts} from "@brico/trades/availability";
import {parseGoodKey} from "@brico/trades/goods";
import {Trans} from "@lingui/solid/macro";
import {createMemo, createSignal, For, Show} from "solid-js";
import {ItemStackArray, ItemStackIcon} from "~/components/shared/ItemStacks";
import {Button} from "~/components/ui/button";

function PocketGrid(props: {pockets: ShopInventory["pockets"]}) {
    return (
        <div class="flex flex-wrap gap-1">
            <For each={props.pockets}>
                {pocket => (
                    <Show when={pocket.contents} fallback={<div class="size-10 rounded-md border border-dashed border-border"/>}>
                        {stack => <ItemStackIcon stack={stack()} small/>}
                    </Show>
                )}
            </For>
        </div>
    );
}

export function ShopInventoryView(props: {inventory: ShopInventory | null}) {
    const [totals, setTotals] = createSignal(false);
    const items = createMemo(() => props.inventory?.pockets.slice(0, props.inventory.cargoIndex) ?? []);
    const cargo = createMemo(() => props.inventory?.pockets.slice(props.inventory.cargoIndex) ?? []);
    const totalStacks = createMemo((): ItemStack[] => [...inventoryCounts(props.inventory)].flatMap(([key, quantity]) => {
        const good = parseGoodKey(key);
        return good ? [{itemId: good.itemId, quantity, itemType: {tag: good.kind}, durability: undefined}] : [];
    }));
    const used = (pockets: ShopInventory["pockets"]) => pockets.filter(pocket => pocket.contents).length;

    return (
        <Show when={props.inventory} fallback={<p class="text-sm text-muted-foreground"><Trans>No inventory.</Trans></p>}>
            <div class="space-y-3">
                <div class="flex gap-2">
                    <Button variant={totals() ? "outline" : "secondary"} size="sm" class="h-8" onClick={() => setTotals(false)}><Trans>Pockets</Trans></Button>
                    <Button variant={totals() ? "secondary" : "outline"} size="sm" class="h-8" onClick={() => setTotals(true)}><Trans>Totals</Trans></Button>
                </div>
                <Show
                    when={!totals()}
                    fallback={
                        <Show when={totalStacks().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>Empty.</Trans></p>}>
                            <ItemStackArray stacks={totalStacks()} class="justify-start"/>
                        </Show>
                    }
                >
                    <Show when={items().length > 0}>
                        <div class="space-y-1">
                            <h3 class="text-sm font-medium"><Trans>Items ({used(items())}/{items().length})</Trans></h3>
                            <PocketGrid pockets={items()}/>
                        </div>
                    </Show>
                    <Show when={cargo().length > 0}>
                        <div class="space-y-1">
                            <h3 class="text-sm font-medium"><Trans>Cargo ({used(cargo())}/{cargo().length})</Trans></h3>
                            <PocketGrid pockets={cargo()}/>
                        </div>
                    </Show>
                </Show>
            </div>
        </Show>
    );
}
