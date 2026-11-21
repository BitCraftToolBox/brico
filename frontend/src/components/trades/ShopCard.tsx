/**
 * ShopCard.tsx — a collapsible summary of one shop and its orders, for the claim page.
 */
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {TbOutlineChevronDown as IconChevronDown} from "solid-icons/tb";
import {createMemo, For, Show} from "solid-js";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {countText, OrderStatusBadges, shopHref, shopLabel} from "~/components/trades/TradeBits";
import {Badge} from "~/components/ui/badge";
import {Card} from "~/components/ui/card";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {useLabel} from "~/lib/labels";
import type {ShopEntry, TradeEntry} from "~/lib/trades/entries";
import {cn} from "~/lib/utils";

export function ShopCard(props: {shop: ShopEntry; orders: TradeEntry[]; open: boolean; onOpenChange: (open: boolean) => void}) {
    const label = useLabel();
    const blocked = createMemo(() => props.orders.filter(order => order.status !== "available").length);
    const full = createMemo(() => props.orders.filter(order => order.full).length);

    return (
        <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
            <Card>
                <div class="flex flex-wrap items-center gap-2 p-3">
                    <CollapsibleTrigger class="cursor-pointer text-muted-foreground" aria-label={shopLabel(props.shop, label)}>
                        <IconChevronDown class={cn("size-5 transition-transform", !props.open && "-rotate-90")}/>
                    </CollapsibleTrigger>
                    <A href={shopHref(props.shop.id)} class="font-medium hover:underline">{shopLabel(props.shop, label)}</A>
                    <Show when={props.shop.ownerName}>{name => <span class="text-sm text-muted-foreground">{name()}</span>}</Show>
                    {/* Stand names already carry the type ("<player>'s Trader Stand (I)"). */}
                    <Show when={props.shop.kind === "stall" && props.shop.typeName && props.shop.typeName !== props.shop.name}>
                        <Badge variant="outline">{props.shop.typeName}</Badge>
                    </Show>
                    <div class="ml-auto flex flex-wrap gap-1">
                        <Badge variant="secondary"><Plural value={props.orders.length} one="# order" other="# orders"/></Badge>
                        <Show when={blocked() > 0}><Badge variant="warning"><Trans>{blocked()} not tradeable</Trans></Badge></Show>
                        <Show when={full() > 0}><Badge variant="error"><Trans>{full()} full</Trans></Badge></Show>
                    </div>
                </div>
                <CollapsibleContent>
                    <div class="border-t">
                        <Show when={props.orders.length > 0} fallback={<p class="p-3 text-sm text-muted-foreground"><Trans>No trade orders.</Trans></p>}>
                            {/* Fixed widths so columns line up from card to card, not just within one. */}
                            <Table class="min-w-[36rem] table-fixed">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead class="w-[32%] pl-3"><Trans>Offers</Trans></TableHead>
                                        <TableHead class="w-[32%]"><Trans>Asks for</Trans></TableHead>
                                        <TableHead class="w-[12%]"><Trans>Trade limit</Trans></TableHead>
                                        <TableHead><Trans>Status</Trans></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <For each={props.orders}>
                                        {order => (
                                            <TableRow>
                                                <TableCell class="pl-3"><ItemStackArray stacks={order.offer} class="justify-start"/></TableCell>
                                                <TableCell><ItemStackArray stacks={order.request} class="justify-start"/></TableCell>
                                                <TableCell class="tabular-nums">{countText(order.remainingStock)}</TableCell>
                                                <TableCell><OrderStatusBadges entry={order} showAvailable/></TableCell>
                                            </TableRow>
                                        )}
                                    </For>
                                </TableBody>
                            </Table>
                        </Show>
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
