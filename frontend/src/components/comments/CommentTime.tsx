import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import type {Timestamp} from "spacetimedb";
import {trackUILocale, uiLocale} from "~/lib/i18n";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
];

/** "3 hours ago" for a timestamp, with the exact date as its tooltip. */
export function CommentTime(props: {at: Timestamp; prefix?: string}) {
    const {_} = useLingui();
    const date = () => props.at.toDate();
    const relative = () => {
        trackUILocale();
        const seconds = Math.max(0, Math.round((Date.now() - date().getTime()) / 1000));
        if (seconds < 60) return _(msg`just now`);
        const [unit, size] = UNITS.find(([, size]) => seconds >= size)!;
        return new Intl.RelativeTimeFormat(uiLocale(), {numeric: "auto"}).format(-Math.floor(seconds / size), unit);
    };
    return <time datetime={date().toISOString()} title={date().toLocaleString(uiLocale())}>{props.prefix}{relative()}</time>;
}
