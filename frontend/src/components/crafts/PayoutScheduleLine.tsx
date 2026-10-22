import {Trans} from "@lingui/solid/macro";
import {Show} from "solid-js";
import {createNextPayout} from "~/lib/crafts/payout-schedule";
import {uiLocale} from "~/lib/i18n";

function relativeTime(targetMs: number): string {
    const minutes = Math.round((targetMs - Date.now()) / 60_000);
    const formatter = new Intl.RelativeTimeFormat(uiLocale(), {numeric: "auto"});
    if (Math.abs(minutes) < 90) return formatter.format(minutes, "minute");
    if (Math.abs(minutes) < 60 * 36) return formatter.format(Math.round(minutes / 60), "hour");
    return formatter.format(Math.round(minutes / (60 * 24)), "day");
}

const dateText = (ms: number) => new Date(ms).toLocaleString(uiLocale());

/**
 * The next Stelo payout sweep, shown while `show` (some row is in an escrowed currency). Renders
 * nothing when the bot has published no schedule.
 */
export function PayoutScheduleLine(props: {show: boolean}) {
    const next = createNextPayout();
    return (
        <Show when={props.show ? next() : undefined}>
            {time => (
                <p class="text-sm text-muted-foreground">
                    <Show
                        when={time().kind === "upcoming" ? (time() as {atMs: number}).atMs : undefined}
                        fallback={<Trans>Payout due since {dateText((time() as {sinceMs: number}).sinceMs)}</Trans>}
                        keyed
                    >
                        {atMs => <Trans>Next Stelo payout: {relativeTime(atMs)} ({dateText(atMs)})</Trans>}
                    </Show>
                </p>
            )}
        </Show>
    );
}
