/**
 * RishEmulator — easter egg that reproduces two "beloved" bugs from the game's own UI library:
 *
 *   1. A small fraction of font icons get stuck wiggling in place (a tiny rapid left/right
 *      shimmy) forever.
 *   2. Scroll containers "jitter" when they settle at an end (or stop mid-scroll): the contents
 *      appear to momentarily stretch and the scroll position wobbles before snapping back.
 *
 * Entirely inert when the `rishEmulation` setting is off: no listeners, no injected styles, no
 * timers. Everything below lives inside a single effect gated on the setting, torn down via
 * `onCleanup` the instant it's disabled (or the component unmounts).
 */
import {createEffect, createSignal, onCleanup} from "solid-js";
import {isServer} from "solid-js/web";
import {FONT_ICON_CLASS} from "~/components/icons/font-icons";
import {useSettings} from "~/lib/settings";

const STYLE_ID = "bc-rish-emulation-styles";
const WIGGLE_CLASS = "bc-rish-wiggling";
const STRETCH_CLASS = "bc-rish-stretch";

/** Fraction of (ever-seen) font icons that get permanently stuck wiggling. */
const WIGGLE_CHANCE = 0.05;
/** Marks an icon as already having been rolled for the wiggle, regardless of whether it "won". */
const CHECKED_ATTR = "data-rish-checked";

const STYLES = `
@keyframes bc-rish-wiggle {
    0%, 100% { transform: translateX(0); }
    15% { transform: translateX(-2px); }
    30% { transform: translateX(2px); }
    45% { transform: translateX(-2px); }
    60% { transform: translateX(2px); }
    75% { transform: translateX(-1px); }
    90% { transform: translateX(1px); }
}
.${WIGGLE_CLASS} {
    animation: bc-rish-wiggle 260ms linear infinite;
}
/* Animates the standalone \`scale\` property rather than \`transform: scaleY()\` so it composes with
   (rather than clobbers) any \`transform\` already set on the element — e.g. the sidebar's
   scaleX(-1) scrollbar-flip hack, which would otherwise flash unmirrored for the animation's
   duration. */
@keyframes bc-rish-stretch {
    0% { scale: 1 1; }
    20% { scale: 1 1.015; }
    40% { scale: 1 0.99; }
    60% { scale: 1 1.015; }
    80% { scale: 1 0.99; }
    100% { scale: 1 1; }
}
.${STRETCH_CLASS} > * {
    transform-origin: top;
    animation: bc-rish-stretch 260ms ease-in-out;
}
`;

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
}

export default function RishEmulator() {
    const {rishEmulation} = useSettings();

    const matcher = window.matchMedia("(prefers-reduced-motion: reduce)");
    const [prefersReduced, setPrefersReduced] = createSignal(matcher.matches);
    const cb = () => setPrefersReduced(matcher.matches);
    matcher.addEventListener("change", cb);
    onCleanup(() => {
        matcher.removeEventListener("change", cb);
    })

    createEffect(() => {
        if (isServer || !rishEmulation() || prefersReduced()) return;

        ensureStyles();
        let active = true;

        // ── Icon wiggle ──────────────────────────────────────
        // Each icon gets exactly one roll the first time it's seen (tracked via CHECKED_ATTR so
        // re-scans skip it either way), so the wiggling set converges to a stable ~5% of
        // ever-rendered icons rather than drifting toward "eventually everything wiggles".
        // Re-scanning periodically (rather than once) picks up icons that mount later, e.g. after
        // navigating to a new page.
        const wiggleInterval = setInterval(() => {
            const icons = document.querySelectorAll(`.${FONT_ICON_CLASS}:not([${CHECKED_ATTR}])`);
            for (const icon of icons) {
                const el = icon as HTMLElement;
                el.setAttribute(CHECKED_ATTR, "");
                if (Math.random() < WIGGLE_CHANCE) {
                    el.classList.add(WIGGLE_CLASS);
                }
            }
        }, 1000);

        // ── Scroll jitter ────────────────────────────────────
        const settleTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
        const jittering = new WeakSet<Element>();

        const jitter = (el: HTMLElement) => {
            if (jittering.has(el)) return;
            const pendingSettle = settleTimers.get(el);
            if (pendingSettle) {
                clearTimeout(pendingSettle);
                settleTimers.delete(el);
            }
            jittering.add(el);
            const originalTop = el.scrollTop;
            const duration = 260;
            const start = performance.now();
            el.classList.add(STRETCH_CLASS);
            const finish = () => {
                el.classList.remove(STRETCH_CLASS);
                el.scrollTop = originalTop;
                // The scrollTop reset above dispatches its own (async) scroll event — keep the
                // guard up a little longer so that self-inflicted event doesn't get read by
                // onScroll as "settled at the edge again" and re-trigger the jitter forever.
                setTimeout(() => jittering.delete(el), 100);
            };
            const frame = (now: number) => {
                if (!active) return finish();
                const t = (now - start) / duration;
                if (t >= 1) return finish();
                el.scrollTop = originalTop + Math.sin(t * Math.PI * 3) * (1 - t) * 8;
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        };

        const onScroll = (e: Event) => {
            const el = e.target;
            if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) return;
            // Ignore scroll events we caused ourselves — every scrollTop write during (and
            // immediately after) a jitter cycle fires one of these, and without this guard each
            // synthetic event re-reads as "at the edge" and re-triggers the jitter, forever.
            if (jittering.has(el)) return;

            const atTop = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            if (atTop || atBottom) {
                jitter(el);
                return;
            }

            const existing = settleTimers.get(el);
            if (existing) clearTimeout(existing);
            settleTimers.set(el, setTimeout(() => jitter(el), 120));
        };

        // Scroll events don't bubble, but they ARE dispatched to capturing listeners on
        // ancestors — this is the one way to observe scrolling on arbitrary descendants
        // without wiring a listener to every scroll container individually.
        document.addEventListener("scroll", onScroll, true);

        onCleanup(() => {
            active = false;
            clearInterval(wiggleInterval);
            document.removeEventListener("scroll", onScroll, true);
            for (const el of document.querySelectorAll(`[${CHECKED_ATTR}]`)) {
                el.removeAttribute(CHECKED_ATTR);
                el.classList.remove(WIGGLE_CLASS);
            }
        });
    });

    return null;
}
