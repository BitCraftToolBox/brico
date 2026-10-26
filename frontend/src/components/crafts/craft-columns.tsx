/**
 * craft-columns.tsx — the column set of a table of open crafts, shared by the craft browser and the public dashboard.
 */
import {i18n} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineEyeOff as IconEyeOff, TbOutlineLock as IconLock} from "solid-icons/tb";
import {Show} from "solid-js";
import {OutputIcon} from "~/components/crafts/OutputIcon";
import {PayoutRateButton} from "~/components/crafts/PayoutRateButton";
import {FontIcon} from "~/components/icons/font-icons";
import {TierIcon} from "~/components/shared/GameIcon";
import {Badge} from "~/components/ui/badge";
import type {CraftEntry} from "~/lib/crafts/entries";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {currencyData} from "~/lib/crafts/filter-vocab";
import {trackUILocale, uiLocale} from "~/lib/i18n";
import {gameText, useLabel} from "~/lib/labels";
import {useSettings} from "~/lib/settings";

let relativeTimeFormat: Intl.RelativeTimeFormat | undefined;
let relativeTimeFormatLocale: string | undefined;

/** Cached per locale, same reasoning as the `Intl.Collator`/`Intl.DurationFormat` caches elsewhere. */
function getRelativeTimeFormat(locale: string): Intl.RelativeTimeFormat {
    if (relativeTimeFormatLocale !== locale) {
        relativeTimeFormat = new Intl.RelativeTimeFormat(locale, {style: "narrow", numeric: "always"});
        relativeTimeFormatLocale = locale;
    }
    return relativeTimeFormat!;
}

/**
 * Compact "how long ago", sized for a table cell — the exact time goes in the cell's tooltip.
 *
 * `Intl.RelativeTimeFormat` (not hand-glued "Xm ago" text) so unit placement and pluralization
 * follow the target locale's own rules instead of an English template — the same reasoning as
 * `~/lib/utils.ts`'s `Intl.DurationFormat` usage.
 */
function sinceText(ms: number, now: number, locale: string): string {
    trackUILocale();
    const seconds = Math.max(Math.round((now - ms) / 1000), 0);
    const rtf = getRelativeTimeFormat(locale);
    if (seconds < 60) return i18n._(msg`just now`);
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
    if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), "hour");
    return rtf.format(-Math.floor(seconds / 86400), "day");
}

function ProgressBar(props: {entry: CraftEntry}) {
    return (
        <div class="flex items-center gap-2">
            <div class="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary" style={{width: `${Math.round(props.entry.fraction * 100)}%`}}/>
            </div>
            <span class="tabular-nums text-xs text-muted-foreground">
                {props.entry.effortDone.toLocaleString(uiLocale())} / {props.entry.effortTotal.toLocaleString(uiLocale())}
            </span>
        </div>
    );
}

/** A cell whose value the relay may not have resolved, rendered as a muted dash when it hasn't. */
function OrDash(props: {value: string | null}) {
    return (
        <Show when={props.value} fallback={<span class="text-muted-foreground">—</span>}>
            {value => <>{value()}</>}
        </Show>
    );
}

type CraftCell<TValue> = CellContext<CraftEntry, TValue>;

/** Whether the entry's bounty currency is outside the user's visible currencies; call from a cell. */
function useBountyHidden(entry: CraftEntry): () => boolean {
    const settings = useSettings();
    return () => entry.subject.currency !== null && !settings.visibleCurrencies().includes(entry.subject.currency);
}

/**
 * The table's columns. `honorHiddenCurrencies` replaces the bounty of a currency the viewer has hidden in their
 * settings with an eye icon; a page that shows someone else's bounties passes false.
 *
 * Every one carries an `accessorFn`, which is what makes it both sortable and hideable — the
 * "View" dropdown skips display-only columns. Cells read `row.original` non-reactively, which is
 * safe here and only here: the feed hands the table a fresh entry object for every craft on every
 * snapshot, so the row (and everything under it) is rebuilt rather than re-read.
 */
export function craftColumns(honorHiddenCurrencies: boolean): ColumnDef<CraftEntry, any>[] {
    return [
        {
            id: "craft",
            meta: {label: msg`Craft`},
            enableHiding: false,
            accessorFn: entry => entry.recipeName,
            cell: (props: CraftCell<string>) => {
                const entry = props.row.original;
                return (
                    <div class="flex items-center gap-2">
                        <OutputIcon output={entry.output}/>
                        <span>
                            <A href={`/tools/crafts/${entry.id}`} class="font-medium hover:underline">{entry.recipeName}</A>
                            <Show when={entry.count > 1}><span class="text-muted-foreground"> ×{entry.count}</span></Show>
                            <Show when={!entry.public}><Badge variant="secondary" class="ml-2"><Trans>private</Trans></Badge></Show>
                            <Show when={entry.complete}><Badge variant="secondary" class="ml-2"><Trans>ready</Trans></Badge></Show>
                        </span>
                    </div>
                );
            },
        },
        {
            id: "skill",
            meta: {label: gameText(msg`Skill`)},
            accessorFn: entry => entry.skillName ?? "",
            cell: (props: CraftCell<string>) => {
                const entry = props.row.original;
                return (
                    <Show when={entry.skillName} fallback={<span class="text-muted-foreground">—</span>}>
                        {name => (
                            <span class="inline-flex items-center gap-1.5">
                                <Show when={entry.skillIcon}>{icon => <FontIcon codepoint={icon()} class="size-4"/>}</Show>
                                {name()}
                            </span>
                        )}
                    </Show>
                );
            },
        },
        {
            id: "tier",
            meta: {label: gameText(msg`Tier`)},
            // Crafts with no `recipe_meta` row have no tier at all; 0 sorts them below tier 1.
            accessorFn: entry => entry.tier ?? 0,
            cell: (props: CraftCell<number>) => (
                <Show when={props.row.original.tier} fallback={<span class="text-muted-foreground">—</span>}>
                    {tier => <TierIcon tier={tier()}/>}
                </Show>
            ),
        },
        {
            id: "progress",
            meta: {label: msg`Progress`},
            accessorFn: entry => entry.fraction,
            cell: (props: CraftCell<number>) => <ProgressBar entry={props.row.original}/>,
        },
        {
            id: "remaining",
            meta: {label: msg`Remaining`},
            accessorFn: entry => entry.effortRemaining,
            cell: (props: CraftCell<number>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "effort",
            meta: {label: msg`Total effort`},
            accessorFn: entry => entry.effortTotal,
            cell: (props: CraftCell<number>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "bounty",
            meta: {label: msg`Bounty`},
            // `payout` is already a currency-per-effort rate — the float approximation
            // `CraftSubject.payout` carries, for display/sort only (see its doc comment).
            accessorFn: entry => entry.subject.payout ?? undefined,
            cell: (props: CraftCell<number>) => {
                const entry = props.row.original;
                const label = useLabel();
                const hidden = honorHiddenCurrencies ? useBountyHidden(entry) : () => false;
                const hiddenTitle = () => {
                    const data = currencyData(entry.subject.currency!);
                    return `${label(msg`Hidden currency`)}: ${data ? label(data.label) : entry.subject.currency}`;
                };
                return (
                    <Show
                        when={!hidden()}
                        fallback={<IconEyeOff class="size-4 text-muted-foreground" title={hiddenTitle()}/>}
                    >
                        <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                            <span class="inline-flex flex-nowrap text-nowrap items-center gap-1">
                                <Show when={entry.subject.bountyPrivate}>
                                    <IconLock class="size-3.5 text-muted-foreground" title={label(msg`Private bounty`)}/>
                                </Show>
                                <PayoutRateButton rate={entry.subject.payout!} currency={entry.subject.currency!}/>
                            </span>
                        </Show>
                    </Show>
                );
            },
            // -1/1 actually compares two undefined rows as 0, unlike first/last which fast-circuit an undefined
            sortUndefined: -1
        },
        {
            id: "estPayoutRemaining",
            meta: {label: msg`Est. payout remaining`},
            accessorFn: entry => (entry.subject.payout ?? 0) * entry.effortRemaining,
            cell: (props: CraftCell<number>) => {
                const entry = props.row.original;
                return (
                    <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                        <div class="flex flex-row justify-center">
                            <span class="inline-flex gap-1 tabular-nums">
                                {(entry.subject.payout! * entry.effortRemaining).toLocaleString(uiLocale(), {maximumFractionDigits: 0})}
                                <CurrencyLabel currency={entry.subject.currency!} iconOnly={true}/>
                            </span>
                        </div>
                    </Show>
                );
            },
        },
        {
            id: "estPayout",
            meta: {label: msg`Est. payout total`},
            accessorFn: entry => (entry.subject.payout ?? 0) * entry.effortTotal,
            cell: (props: CraftCell<number>) => {
                const entry = props.row.original;
                return (
                    <Show when={entry.subject.payout !== null && entry.subject.currency !== null} fallback={<span class="text-muted-foreground">—</span>}>
                        <div class="flex flex-row justify-center">
                            <span class="inline-flex gap-1 tabular-nums">
                                {(entry.subject.payout! * entry.effortTotal).toLocaleString(uiLocale(), {maximumFractionDigits: 0})}
                                <CurrencyLabel currency={entry.subject.currency!} iconOnly={true}/>
                            </span>
                        </div>
                    </Show>
                );
            },
        },
        {
            id: "region",
            meta: {label: msg`Region`},
            accessorFn: entry => entry.regionName,
        },
        {
            id: "claim",
            meta: {label: msg`Claim`},
            accessorFn: entry => entry.claimName ?? "",
            cell: (props: CraftCell<string>) => <OrDash value={props.row.original.claimName}/>,
        },
        {
            id: "owner",
            meta: {label: msg`Owner`},
            accessorFn: entry => entry.ownerName ?? "",
            cell: (props: CraftCell<string>) => <OrDash value={props.row.original.ownerName}/>,
        },
        {
            id: "lastActive",
            meta: {label: msg`Last active`},
            accessorFn: entry => entry.lastActiveMs,
            cell: (props: CraftCell<number>) => (
                <span class="whitespace-nowrap text-muted-foreground" title={new Date(props.getValue()).toLocaleString(uiLocale())}>
                    {sinceText(props.getValue(), Date.now(), uiLocale())}
                </span>
            ),
        },
    ];
}
