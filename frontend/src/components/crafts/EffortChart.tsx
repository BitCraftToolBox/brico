/**
 * EffortChart — per-contributor effort over time as lines or stacked areas, with a completion estimate.
 * The advanced view adds the expected-rate trend line to completion and a strip of the rate estimates.
 */
import {Trans} from "@lingui/solid/macro";
import {scaleLinear, scaleTime} from "d3-scale";
import {area, line, type SeriesPoint, stack} from "d3-shape";
import {createMemo, createSignal, createUniqueId, For, Show} from "solid-js";
import {Button} from "~/components/ui/button";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import type {EffortSample} from "~/lib/crafts/effort-history";
import {estimateCompletion, trendProjection} from "~/lib/crafts/effort-trend";
import {uiLocale} from "~/lib/i18n";
import {readableSeconds} from "~/lib/utils";

const WIDTH = 800;
const HEIGHT = 280;
const RATE_HEIGHT = 120;
const MARGIN = {top: 12, right: 12, bottom: 24, left: 48};
/** The trend line reaches at most this far past the latest sample, or the history's own span if longer. */
const MIN_TREND_HORIZON_MS = 5 * 60_000;
const LEGEND_LIMIT = 10;
const TOOLTIP_LIMIT = 10;
/** Drags narrower than this (viewBox units) are treated as clicks. */
const MIN_DRAG_PX = 6;
const MIN_ZOOM_MS = 5000;

type ChartMode = "lines" | "stacked";

/** Evenly spread hues (golden angle) so any number of contributors stays distinguishable. */
function seriesColor(index: number): string {
    return `hsl(${Math.round((index * 137.508) % 360)} 65% 55%)`;
}

/** Index of the sample whose time is closest to `t`; `samples` must be non-empty and time-ordered. */
function nearestSample(samples: readonly EffortSample[], t: number): number {
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].t < t) lo = mid + 1;
        else hi = mid;
    }
    return lo > 0 && t - samples[lo - 1].t < samples[lo].t - t ? lo - 1 : lo;
}

export function EffortChart(props: {
    samples: EffortSample[];
    /** Player id → display name; ids without an entry are shown raw. */
    names: (playerId: string) => string | null;
    effortTotal: number;
    /** The craft's live effort done; the history stops sampling once it completes. */
    effortDone: number;
}) {
    const [mode, setMode] = createSignal<ChartMode>("stacked");
    const [advanced, setAdvanced] = createSignal(false);
    /** Time (epoch ms) of the sample under the pointer; tracked by time, not index, so it survives the history being trimmed. */
    const [hoverT, setHoverT] = createSignal<number | null>(null);
    /** Zoomed time window (epoch ms), or null to show the whole history. */
    const [zoom, setZoom] = createSignal<[number, number] | null>(null);
    /** In-progress drag selection in viewBox x coordinates. */
    const [drag, setDrag] = createSignal<{from: number; to: number} | null>(null);
    const clipId = `effort-clip-${createUniqueId()}`;

    /** Contributors ordered by their latest effort, largest first — this order fixes stack and legend order, not color. */
    const ids = createMemo(() => {
        const latest: Record<string, number> = {};
        for (const sample of props.samples) {
            for (const [id, effort] of Object.entries(sample.efforts)) latest[id] = effort;
        }
        return Object.keys(latest).sort((a, b) => latest[b] - latest[a]);
    });
    /** Color slot per contributor, assigned on first sight and kept for the component's lifetime so colors survive re-ranking and history trimming. */
    const colorSlots = new Map<string, number>();
    const colors = createMemo(() => {
        for (const id of ids()) {
            if (!colorSlots.has(id)) colorSlots.set(id, colorSlots.size);
        }
        return colorSlots;
    }, undefined, {equals: false});
    const colorOf = (id: string) => seriesColor(colors().get(id) ?? 0);
    const labelOf = (id: string) => props.names(id) ?? id;

    const geometry = createMemo(() => {
        const samples = props.samples;
        const keys = ids();
        if (samples.length < 2 || keys.length === 0) return null;

        const stacked = mode() === "stacked";
        const showAdvanced = advanced();
        const layers = stack<EffortSample, string>().keys(keys).value((d, key) => d.efforts[key] ?? 0)(samples);
        const totals = layers.at(-1)!.map(point => point[1]);

        const first = samples[0].t;
        const lastT = samples.at(-1)!.t;
        const trend = showAdvanced ? trendProjection(samples, props.effortTotal, Math.max((lastT - first) * 0.2, MIN_TREND_HORIZON_MS)) : null;

        const zoomed = zoom();
        const domain: [number, number] = zoomed ?? [first, trend?.to.t ?? lastT];
        /** Samples inside the zoom window (all of them when unzoomed or the window holds none), so the y axes fit what is shown. */
        const inView = zoomed ? samples.filter(s => s.t >= zoomed[0] && s.t <= zoomed[1]) : samples;
        const visible = inView.length > 0 ? inView : samples;
        const yMax = stacked || showAdvanced
            ? Math.max(...visible.map(s => keys.reduce((sum, key) => sum + (s.efforts[key] ?? 0), 0)))
            : Math.max(...visible.flatMap(sample => keys.map(key => sample.efforts[key] ?? 0)));

        const x = scaleTime()
            .domain(domain)
            .range([MARGIN.left, WIDTH - MARGIN.right]);
        const y = scaleLinear()
            .domain([0, Math.max(yMax, trend?.to.effort ?? 0, 1)]).nice()
            .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

        const rawLine = (key: string) => line<EffortSample>().x(d => x(d.t)).y(d => y(d.efforts[key] ?? 0))(samples);
        const stackedLine = line<SeriesPoint<EffortSample>>().x(d => x(d.data.t)).y(d => y(d[1]));
        const stackedArea = area<SeriesPoint<EffortSample>>().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1]));
        const paths = keys.map((key, index) => ({
            key,
            stroke: stacked ? stackedLine(layers[index]) : rawLine(key),
            fill: stacked ? stackedArea(layers[index]) : null,
        }));

        const totalPath = showAdvanced && !stacked ? line<number>().x((_, i) => x(samples[i].t)).y(d => y(d))(totals) : null;
        const trendView = trend && {
            path: `M${x(trend.from.t)},${y(trend.from.effort)}L${x(trend.to.t)},${y(trend.to.effort)}`,
            targetY: y(trend.target),
            etaX: trend.etaT === null ? null : x(trend.etaT),
            targetVisible: trend.target <= y.domain()[1],
        };

        const rateMax = showAdvanced ? Math.max(...visible.map(s => Math.max(s.rate ?? 0, s.instantRate)), 1e-9) * 1000 : 0;
        const rateY = scaleLinear().domain([0, rateMax]).nice().range([RATE_HEIGHT - MARGIN.bottom, MARGIN.top]);
        const ratePath = (value: (s: EffortSample) => number | null) =>
            line<EffortSample>().defined(s => value(s) !== null).x(s => x(s.t)).y(s => rateY(value(s)! * 1000))(samples);
        const rates = showAdvanced
            ? {
                y: rateY,
                yTicks: rateY.ticks(3).map(v => ({v, y: rateY(v)})),
                expected: ratePath(s => s.rate),
                instant: ratePath(s => s.instantRate),
            }
            : null;

        return {
            x,
            y,
            stacked,
            paths,
            totalPath,
            trend: trendView,
            rates,
            xTicks: x.ticks(5).map(t => ({t, x: x(t)})),
            yTicks: y.ticks(5).map(v => ({v, y: y(v)})),
        };
    });

    /** The sample under the pointer with where each contributor's marker sits on it. */
    const hover = createMemo(() => {
        const chart = geometry();
        const t = hoverT();
        if (!chart || t === null) return null;
        const sample = props.samples[nearestSample(props.samples, t)];
        let running = 0;
        const rows = ids().map(id => {
            const effort = sample.efforts[id] ?? 0;
            running += effort;
            const player = sample.players[id];
            return {id, effort, y: chart.y(chart.stacked ? running : effort), phase: player?.phase, ratePerSecond: (player?.expectedRate ?? 0) * 1000};
        });
        return {sample, x: chart.x(sample.t), rows};
    });

    const viewXOf = (event: PointerEvent & {currentTarget: SVGSVGElement}) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
        return Math.min(Math.max(viewX, MARGIN.left), WIDTH - MARGIN.right);
    };

    const onPointerDown = (event: PointerEvent & {currentTarget: SVGSVGElement}) => {
        if (event.button !== 0 || !geometry()) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const viewX = viewXOf(event);
        setDrag({from: viewX, to: viewX});
    };

    const onPointerMove = (event: PointerEvent & {currentTarget: SVGSVGElement}) => {
        const chart = geometry();
        if (!chart) return;
        const viewX = viewXOf(event);
        setHoverT(chart.x.invert(viewX).getTime());
        if (drag()) setDrag({from: drag()!.from, to: viewX});
    };

    const onPointerUp = () => {
        const d = drag();
        const chart = geometry();
        setDrag(null);
        if (!d || !chart || Math.abs(d.to - d.from) < MIN_DRAG_PX) return;
        const [a, b] = [d.from, d.to].sort((p, q) => p - q).map(v => chart.x.invert(v).getTime());
        if (b - a >= MIN_ZOOM_MS) setZoom([a, b]);
    };

    const pointerHandlers = {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: () => setDrag(null),
        onPointerLeave: () => setHoverT(null),
    };

    const estimate = createMemo(() => estimateCompletion(props.samples, props.effortTotal, props.effortDone));
    const timeFormat = createMemo(() => new Intl.DateTimeFormat(uiLocale(), {hour: "numeric", minute: "numeric", second: "numeric"}));
    const formatTime = (ms: number) => timeFormat().format(new Date(ms));
    const compact = createMemo(() => new Intl.NumberFormat(uiLocale(), {notation: "compact", maximumFractionDigits: 1}));

    return (
        <div class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm text-muted-foreground">
                    {(() => {
                        const e = estimate();
                        if (e.kind === "eta") {
                            return (
                                <Trans>
                                    Estimated completion: {formatTime(e.atMs)} (in {readableSeconds(e.remainingMs / 1000, true)}) at {e.ratePerSecond.toFixed(2)} effort/s
                                </Trans>
                            );
                        }
                        if (e.kind === "complete") return <Trans>Craft complete.</Trans>;
                        return e.kind === "stalled"
                            ? <Trans>Estimated completion: No recent progress.</Trans>
                            : <Trans>Estimated completion: Collecting data…</Trans>;
                    })()}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                    <Show when={zoom()}>
                        <Button variant="outline" size="sm" onClick={() => setZoom(null)}><Trans>Reset zoom</Trans></Button>
                    </Show>
                    <Tabs value={advanced() ? "advanced" : "basic"} onChange={value => setAdvanced(value === "advanced")}>
                        <TabsList>
                            <TabsTrigger value="basic"><Trans>Basic</Trans></TabsTrigger>
                            <TabsTrigger value="advanced"><Trans>Advanced</Trans></TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Tabs value={mode()} onChange={value => setMode(value as ChartMode)}>
                        <TabsList>
                            <TabsTrigger value="lines"><Trans>Lines</Trans></TabsTrigger>
                            <TabsTrigger value="stacked"><Trans>Stacked</Trans></TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <Show
                when={geometry()}
                fallback={estimate().kind === "complete" ? null : <p class="text-sm text-muted-foreground"><Trans>Collecting samples…</Trans></p>}
            >
                {chart => (
                    <>
                        <div class="relative">
                            <svg
                                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                                class="w-full cursor-crosshair touch-pan-y select-none rounded-md border"
                                role="img"
                                {...pointerHandlers}
                            >
                                <defs>
                                    <clipPath id={clipId}>
                                        <rect x={MARGIN.left} y="0" width={WIDTH - MARGIN.left - MARGIN.right} height={HEIGHT}/>
                                    </clipPath>
                                </defs>
                                <For each={chart().yTicks}>
                                    {tick => (
                                        <g>
                                            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={tick.y} y2={tick.y} class="stroke-border"/>
                                            <text x={MARGIN.left - 6} y={tick.y} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">
                                                {compact().format(tick.v)}
                                            </text>
                                        </g>
                                    )}
                                </For>
                                <For each={chart().xTicks}>
                                    {tick => (
                                        <text x={tick.x} y={HEIGHT - 8} text-anchor="middle" class="fill-muted-foreground text-[10px]">
                                            {formatTime(tick.t.getTime())}
                                        </text>
                                    )}
                                </For>
                                <g clip-path={`url(#${clipId})`}>
                                    <For each={chart().paths}>
                                        {series => (
                                            <>
                                                <Show when={series.fill}>
                                                    {fill => <path d={fill()} fill={colorOf(series.key)} fill-opacity="0.45"/>}
                                                </Show>
                                                <path d={series.stroke ?? ""} fill="none" stroke={colorOf(series.key)} stroke-width="1.5"/>
                                            </>
                                        )}
                                    </For>
                                    <Show when={chart().totalPath}>
                                        {path => <path d={path()} fill="none" class="stroke-muted-foreground" stroke-width="1" stroke-dasharray="2 2"/>}
                                    </Show>
                                    <Show when={chart().trend}>
                                        {trend => (
                                            <g pointer-events="none">
                                                <Show when={trend().targetVisible}>
                                                    <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={trend().targetY} y2={trend().targetY} class="stroke-muted-foreground" stroke-width="0.75" stroke-dasharray="1 4"/>
                                                </Show>
                                                <path d={trend().path} fill="none" class="stroke-foreground" stroke-width="1.5" stroke-dasharray="6 4"/>
                                                <Show when={trend().etaX}>
                                                    {etaX => <circle cx={etaX()} cy={trend().targetY} r="4" class="fill-background stroke-foreground" stroke-width="1.5"/>}
                                                </Show>
                                            </g>
                                        )}
                                    </Show>
                                </g>
                                <Show when={drag()}>
                                    {d => (
                                        <rect
                                            x={Math.min(d().from, d().to)}
                                            y={MARGIN.top}
                                            width={Math.abs(d().to - d().from)}
                                            height={HEIGHT - MARGIN.top - MARGIN.bottom}
                                            class="fill-foreground/10 stroke-foreground/40"
                                            pointer-events="none"
                                        />
                                    )}
                                </Show>
                                <Show when={hover()}>
                                    {h => (
                                        <g pointer-events="none">
                                            <line x1={h().x} x2={h().x} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} class="stroke-muted-foreground" stroke-dasharray="3 3"/>
                                            <For each={h().rows}>
                                                {row => <circle cx={h().x} cy={row.y} r="3" fill={colorOf(row.id)} class="stroke-background" stroke-width="1"/>}
                                            </For>
                                        </g>
                                    )}
                                </Show>
                            </svg>
                            <Show when={hover()}>
                                {h => (
                                    <div
                                        class="pointer-events-none absolute top-2 z-10 w-max min-w-40 max-w-80 whitespace-nowrap rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
                                        style={{
                                            left: `${(h().x / WIDTH) * 100}%`,
                                            transform: h().x > WIDTH / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
                                        }}
                                    >
                                        <div class="mb-1 font-medium">{formatTime(h().sample.t)}</div>
                                        <div class="space-y-0.5">
                                            <For each={h().rows.slice(0, TOOLTIP_LIMIT)}>
                                                {row => (
                                                    <div class="flex items-center gap-1.5">
                                                        <span class="inline-block size-2.5 shrink-0 rounded-sm" style={{"background-color": colorOf(row.id)}}/>
                                                        <span class="truncate">{labelOf(row.id)}</span>
                                                        <Show when={advanced()}>
                                                            <span class="shrink-0 pl-2 text-muted-foreground tabular-nums">
                                                                {row.phase === "resting" ? <Trans>resting</Trans> : row.phase === "gone" ? <Trans>away</Trans> : null}
                                                                {" "}{row.ratePerSecond.toFixed(2)}/s
                                                            </span>
                                                        </Show>
                                                        <span class="ml-auto pl-3 tabular-nums">{row.effort.toLocaleString(uiLocale())}</span>
                                                    </div>
                                                )}
                                            </For>
                                            <Show when={h().rows.length > TOOLTIP_LIMIT}>
                                                <div class="text-muted-foreground">+{h().rows.length - TOOLTIP_LIMIT}</div>
                                            </Show>
                                        </div>
                                    </div>
                                )}
                            </Show>
                        </div>
                        <Show when={chart().rates}>
                            {rates => (
                                <div class="space-y-1">
                                    <p class="text-xs text-muted-foreground"><Trans>Effort per second</Trans></p>
                                    <svg
                                        viewBox={`0 0 ${WIDTH} ${RATE_HEIGHT}`}
                                        class="w-full cursor-crosshair touch-pan-y select-none rounded-md border"
                                        role="img"
                                        {...pointerHandlers}
                                    >
                                        <For each={rates().yTicks}>
                                            {tick => (
                                                <g>
                                                    <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={tick.y} y2={tick.y} class="stroke-border"/>
                                                    <text x={MARGIN.left - 6} y={tick.y} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">
                                                        {tick.v}
                                                    </text>
                                                </g>
                                            )}
                                        </For>
                                        <g clip-path={`url(#${clipId})`}>
                                            <path d={rates().instant ?? ""} fill="none" class="stroke-muted-foreground" stroke-width="1" stroke-opacity="0.7"/>
                                            <path d={rates().expected ?? ""} fill="none" class="stroke-foreground" stroke-width="2"/>
                                        </g>
                                        <Show when={drag()}>
                                            {d => (
                                                <rect
                                                    x={Math.min(d().from, d().to)}
                                                    y={MARGIN.top}
                                                    width={Math.abs(d().to - d().from)}
                                                    height={RATE_HEIGHT - MARGIN.top - MARGIN.bottom}
                                                    class="fill-foreground/10 stroke-foreground/40"
                                                    pointer-events="none"
                                                />
                                            )}
                                        </Show>
                                        <Show when={hover()}>
                                            {h => <line x1={h().x} x2={h().x} y1={MARGIN.top} y2={RATE_HEIGHT - MARGIN.bottom} class="stroke-muted-foreground" stroke-dasharray="3 3" pointer-events="none"/>}
                                        </Show>
                                    </svg>
                                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span class="inline-flex items-center gap-1.5">
                                            <span class="inline-block h-0.5 w-4 bg-foreground"/>
                                            <Trans>Expected rate</Trans>
                                        </span>
                                        <span class="inline-flex items-center gap-1.5">
                                            <span class="inline-block h-px w-4 bg-muted-foreground"/>
                                            <Trans>Players hitting now</Trans>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </Show>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <For each={ids().slice(0, LEGEND_LIMIT)}>
                                {id => (
                                    <span class="inline-flex items-center gap-1.5">
                                        <span class="inline-block size-2.5 rounded-sm" style={{"background-color": colorOf(id)}}/>
                                        {labelOf(id)}
                                    </span>
                                )}
                            </For>
                            <Show when={ids().length > LEGEND_LIMIT}>
                                <span>+{ids().length - LEGEND_LIMIT}</span>
                            </Show>
                        </div>
                    </>
                )}
            </Show>
        </div>
    );
}
