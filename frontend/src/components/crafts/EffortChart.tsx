/**
 * EffortChart — per-contributor effort over time as lines or stacked areas, with a completion estimate.
 */
import {Trans} from "@lingui/solid/macro";
import {scaleLinear, scaleTime} from "d3-scale";
import {area, line, type SeriesPoint, stack} from "d3-shape";
import {createMemo, createSignal, For, Show} from "solid-js";
import {Tabs, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {type EffortSample, estimateCompletion} from "~/lib/crafts/effort-history";
import {uiLocale} from "~/lib/i18n";
import {readableSeconds} from "~/lib/utils";

const WIDTH = 800;
const HEIGHT = 280;
const MARGIN = {top: 12, right: 12, bottom: 24, left: 48};
const LEGEND_LIMIT = 10;
const TOOLTIP_LIMIT = 10;

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
}) {
    const [mode, setMode] = createSignal<ChartMode>("stacked");
    /** Time (epoch ms) of the sample under the pointer; tracked by time, not index, so it survives the history being trimmed. */
    const [hoverT, setHoverT] = createSignal<number | null>(null);

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
        const layers = stack<EffortSample, string>().keys(keys).value((d, key) => d.efforts[key] ?? 0)(samples);
        const yMax = stacked
            ? Math.max(...layers.at(-1)!.map(point => point[1]))
            : Math.max(...samples.flatMap(sample => keys.map(key => sample.efforts[key] ?? 0)));

        const x = scaleTime()
            .domain([samples[0].t, samples.at(-1)!.t])
            .range([MARGIN.left, WIDTH - MARGIN.right]);
        const y = scaleLinear()
            .domain([0, Math.max(yMax, 1)]).nice()
            .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

        const rawLine = (key: string) => line<EffortSample>().x(d => x(d.t)).y(d => y(d.efforts[key] ?? 0))(samples);
        const stackedLine = line<SeriesPoint<EffortSample>>().x(d => x(d.data.t)).y(d => y(d[1]));
        const stackedArea = area<SeriesPoint<EffortSample>>().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1]));
        const paths = keys.map((key, index) => ({
            key,
            stroke: stacked ? stackedLine(layers[index]) : rawLine(key),
            fill: stacked ? stackedArea(layers[index]) : null,
        }));

        return {
            x,
            y,
            stacked,
            paths,
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
            return {id, effort, y: chart.y(chart.stacked ? running : effort)};
        });
        return {sample, x: chart.x(sample.t), rows};
    });

    const onPointerMove = (event: PointerEvent & {currentTarget: SVGSVGElement}) => {
        const chart = geometry();
        if (!chart) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
        setHoverT(chart.x.invert(viewX).getTime());
    };

    const estimate = createMemo(() => estimateCompletion(props.samples, props.effortTotal));
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
                        return e.kind === "stalled"
                            ? <Trans>Estimated completion: No recent progress.</Trans>
                            : <Trans>Estimated completion: Collecting data…</Trans>;
                    })()}
                </p>
                <Tabs value={mode()} onChange={value => setMode(value as ChartMode)}>
                    <TabsList>
                        <TabsTrigger value="lines"><Trans>Lines</Trans></TabsTrigger>
                        <TabsTrigger value="stacked"><Trans>Stacked</Trans></TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <Show
                when={geometry()}
                fallback={<p class="text-sm text-muted-foreground"><Trans>Collecting samples…</Trans></p>}
            >
                {chart => (
                    <>
                        <div class="relative">
                            <svg
                                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                                class="w-full rounded-md border"
                                role="img"
                                onPointerMove={onPointerMove}
                                onPointerLeave={() => setHoverT(null)}
                            >
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
                                        class="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
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
