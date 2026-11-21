/**
 * StockIssues.tsx — badges and action text for stock manager line issues.
 */
import type {StockIssue, StockLine} from "@brico/trades/stock-plan";
import {Trans} from "@lingui/solid/macro";
import {For, Match, Show, Switch} from "solid-js";
import {ItemStackIcon} from "~/components/shared/ItemStacks";
import {Badge} from "~/components/ui/badge";
import {uiLocale} from "~/lib/i18n";
import {goodStack} from "~/lib/trades/stock";

const n = (value: number) => value.toLocaleString(uiLocale());

const moveQuantity = (issue: StockIssue) => (issue.kind === "move" ? issue.quantity : null);
const resetLimit = (issue: StockIssue) => (issue.kind === "reset-buy" ? issue.limit : null);

export function StockIssueBadge(props: {issue: StockIssue}) {
    return (
        <Switch>
            <Match when={props.issue.kind === "missing-order"}><Badge variant="error"><Trans>Order missing</Trans></Badge></Match>
            <Match when={moveQuantity(props.issue)}>{quantity => <Badge variant="warning"><Trans>Move {n(quantity())}</Trans></Badge>}</Match>
            <Match when={props.issue.kind === "intake-full"}><Badge variant="error"><Trans>Intake full</Trans></Badge></Match>
            <Match when={props.issue.kind === "reset-buy"}><Badge variant="warning"><Trans>Raise buy limit</Trans></Badge></Match>
            <Match when={props.issue.kind === "sell-limit"}><Badge variant="warning"><Trans>Sell limit reached</Trans></Badge></Match>
            <Match when={props.issue.kind === "sold-out"}><Badge variant="secondary"><Trans>Sold out</Trans></Badge></Match>
            <Match when={props.issue.kind === "holding"}><Badge variant="secondary"><Trans>Selling batch</Trans></Badge></Match>
        </Switch>
    );
}

export function StockIssueBadges(props: {issues: StockIssue[]}) {
    return (
        <span class="inline-flex flex-wrap gap-1">
            <For each={props.issues} fallback={<Badge variant="success"><Trans>OK</Trans></Badge>}>
                {issue => <StockIssueBadge issue={issue}/>}
            </For>
        </span>
    );
}

export function GoodLabel(props: {line: StockLine}) {
    return (
        <Show when={goodStack(props.line.good)} fallback={<span>{props.line.good}</span>}>
            {stack => <ItemStackIcon stack={stack()} small showName hideSingle/>}
        </Show>
    );
}

/** One sentence telling the owner what to do about `issue`. */
export function StockActionText(props: {issue: StockIssue; line: StockLine; intake: string; outlet: string}) {
    return (
        <Switch>
            <Match when={moveQuantity(props.issue)}>
                {quantity => <Trans>Move {n(quantity())} from {props.intake} to {props.outlet}.</Trans>}
            </Match>
            <Match when={props.issue.kind === "reset-buy"}>
                <Show
                    when={resetLimit(props.issue)}
                    fallback={<Trans>Raise the buy limit in {props.intake}. Set a buy limit to get a suggested amount.</Trans>}
                >
                    {limit => <Trans>Raise the buy limit in {props.intake} to {n(limit())}.</Trans>}
                </Show>
            </Match>
            <Match when={props.issue.kind === "intake-full" && props.line.linked}>
                <Trans>{props.intake} has no room for more. Make room or move goods to {props.outlet}.</Trans>
            </Match>
            <Match when={props.issue.kind === "intake-full"}>
                <Trans>{props.intake} has no room for more. Make room in it.</Trans>
            </Match>
            <Match when={props.issue.kind === "sell-limit"}><Trans>Raise the sell limit in {props.outlet}.</Trans></Match>
            <Match when={props.issue.kind === "missing-order"}><Trans>No buy or sell order left for this in {props.intake}.</Trans></Match>
        </Switch>
    );
}
