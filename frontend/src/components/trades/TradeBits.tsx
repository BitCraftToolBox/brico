/**
 * TradeBits.tsx — small shared pieces of the trade pages: order status badges, shop/claim links.
 */
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import {uiLocale} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";
import type {ShopEntry, TradeEntry} from "~/lib/trades/entries";

export const TRADES_HREF = "/tools/trades/browse";
export const shopHref = (id: string) => `/tools/trades/shop/${id}`;
export const claimHref = (id: string) => `/tools/trades/claim/${id}`;
export const stockHref = (claimId: string) => `/tools/trades/claim/${claimId}/stock`;

/** A route's entity id param, or `null` when it isn't one. */
export function parseEntityId(raw: string | undefined): bigint | null {
    return raw && /^\d{1,20}$/.test(raw) ? BigInt(raw) : null;
}

export function Dash() {
    return <span class="text-muted-foreground">—</span>;
}

/** The shop's display name, falling back to a generic label when neither its name nor type resolved. */
export function shopLabel(shop: ShopEntry, label: ReturnType<typeof useLabel>): string {
    return shop.name ?? label(msg`Unknown shop`);
}

export function ShopLink(props: {shop: ShopEntry}) {
    const label = useLabel();
    return <A href={shopHref(props.shop.id)} class="font-medium hover:underline">{shopLabel(props.shop, label)}</A>;
}

export function ClaimLink(props: {shop: ShopEntry}) {
    return (
        <Show when={props.shop.claimId} fallback={<Dash/>}>
            {id => <A href={claimHref(id())} class="hover:underline">{props.shop.claimName ?? id()}</A>}
        </Show>
    );
}

/** "∞" for unlimited, else the localized count. */
export function countText(value: number | null): string {
    return value === null ? "∞" : value.toLocaleString(uiLocale());
}

export function OrderStatusBadges(props: {entry: TradeEntry; showAvailable?: boolean}) {
    const label = useLabel();
    return (
        <span class="inline-flex flex-wrap gap-1">
            <Show when={props.entry.status === "available" && props.showAvailable}>
                <Badge variant="success"><Trans>{countText(props.entry.capacity.trades)} available</Trans></Badge>
            </Show>
            <Show when={props.entry.status === "limit"}>
                <Badge variant="secondary" title={label(msg`The owner's trade limit for this order is used up.`)}><Trans>Limit reached</Trans></Badge>
            </Show>
            <Show when={props.entry.status === "inventory"}>
                <Badge variant="warning" title={label(msg`The shop doesn't hold enough of what it offers.`)}><Trans>Out of stock</Trans></Badge>
            </Show>
            <Show when={props.entry.status === "inactive"}>
                <Badge variant="secondary" title={label(msg`The shop isn't placed in the world right now.`)}><Trans>Inactive</Trans></Badge>
            </Show>
            <Show when={props.entry.full}>
                <Badge variant="error" title={label(msg`No room for what this shop receives. Ask the owner to make room.`)}><Trans>Full</Trans></Badge>
            </Show>
        </span>
    );
}
