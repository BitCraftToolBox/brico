import {TbOutlineClipboardCheck, TbOutlineExternalLink} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from "solid-js";
import type {Rarity} from "~/bindings/src/rarity_type";
import type {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import MainLayout from "~/components/MainLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {BitCraftTables} from "~/lib/spacetime";
import {readableSeconds} from "~/lib/utils";
import {DbConnection, type EventContext, type SubscriptionHandle, tables} from "~/relay";
import type {GrowthTimer} from "~/relay/types";

const RELAY_URI = import.meta.env.VITE_RELAY_HOST as string ?? "https://st.prism.brico.app";
const RELAY_MODULE = import.meta.env.VITE_RELAY_MODULE as string ?? "prism-relay";

const SOUTH_REGION_ID = 3;
const WEST_REGION_ID = 11;
const EAST_REGION_ID = 15;
const NORTH_REGION_ID = 23;
const TRACKED_REGION_IDS = [SOUTH_REGION_ID, WEST_REGION_ID, EAST_REGION_ID, NORTH_REGION_ID] as const;
const MYTHIC_RARITY: Rarity = {tag: "Mythic"};

type EventTimer = {
    entityId: bigint;
    resource: ResourceDesc;
    endTimestamp: GrowthTimer["endTimestamp"];
    x: number;
    z: number;
};

function formatEndTimestamp(timestamp: GrowthTimer["endTimestamp"]): string {
    try {
        return timestamp.toDate().toLocaleString();
    } catch {
        return timestamp.toISOString();
    }
}

function isActiveEvent(timer: EventTimer): boolean {
    return !timer.resource.name.toLowerCase().includes("inactive");
}

function getClosestInactiveEvent(timers: EventTimer[]): EventTimer | null {
    let closest: EventTimer | null = null;
    for (const timer of timers) {
        if (isActiveEvent(timer)) continue;
        if (!closest || timer.endTimestamp.toMillis() < closest.endTimestamp.toMillis()) {
            closest = timer;
        }
    }
    return closest;
}

function getEventMapLink(timer: EventTimer): string {
    return `https://bitcraftmap.com/?center=${Math.floor(timer.z / 3)},${Math.floor(timer.x / 3)}&zoom=-3#{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"turnLayerOn":"eventsLayer"}}]}`;
}

function getCopyChatText(timer: EventTimer): string {
    const coordZ = Math.floor(timer.z / 3);
    const coordX = Math.floor(timer.x / 3);
    const nowMs = Date.now();
    const endMs = Number(timer.endTimestamp.toMillis());
    const timing = isActiveEvent(timer)
        ? "now active!"
        : `in ${readableSeconds((endMs - nowMs) / 1000, true)}.`;
    return `World event at (coord=${coordZ},${coordX}) ${timing}`;
}

function getTimeLeftText(timer: EventTimer, nowMs: number): string {
    const endMs = Number(timer.endTimestamp.toMillis());
    if (endMs <= nowMs) return "now active!";
    return readableSeconds((endMs - nowMs) / 1000) ?? "0s";
}

function CopyChatLinkButton(props: { content: string }) {
    const [contentCopied, setContentCopied] = createSignal(false);
    const copyContent = () => {
        if (props.content) {
            navigator.clipboard.writeText(props.content).then(() => {
                setContentCopied(true);
                setTimeout(() => setContentCopied(false), 1500);
            });
        }
    };

    return (
        <button class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={copyContent}>
            <Show
                when={contentCopied()}
                fallback={<>Copy Chat Link <FontIcon codepoint="FFE0" class="size-3 inline"/></>}
            >
                <>Copied! <TbOutlineClipboardCheck class="size-3 inline"/></>
            </Show>
        </button>
    );
}

export default function Events() {
    const [northTimers, setNorthTimers] = createSignal<EventTimer[]>([]);
    const [westTimers, setWestTimers] = createSignal<EventTimer[]>([]);
    const [eastTimers, setEastTimers] = createSignal<EventTimer[]>([]);
    const [southTimers, setSouthTimers] = createSignal<EventTimer[]>([]);
    const [connected, setConnected] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [nowMs, setNowMs] = createSignal(Date.now());

    let connection: DbConnection | null = null;
    let subscription: SubscriptionHandle | null = null;
    let nowInterval: ReturnType<typeof setInterval> | null = null;

    function setTimersForRegion(regionId: number, timers: EventTimer[]) {
        switch (regionId) {
            case NORTH_REGION_ID:
                setNorthTimers(timers);
                break;
            case WEST_REGION_ID:
                setWestTimers(timers);
                break;
            case EAST_REGION_ID:
                setEastTimers(timers);
                break;
            case SOUTH_REGION_ID:
                setSouthTimers(timers);
                break;
            default:
                break;
        }
    }

    function refreshRegionTimers(conn: DbConnection, regionId: number) {
        if (!TRACKED_REGION_IDS.includes(regionId as (typeof TRACKED_REGION_IDS)[number])) {
            return;
        }
        const resourceById = BitCraftTables.ResourceDesc.indexedBy("id")();
        const timers: EventTimer[] = [];
        for (const row of conn.db.growth_timers.iter()) {
            if (row.regionId !== regionId) continue;
            const resource = resourceById.get(row.resourceId);
            if (!resource || resource.tag !== "World Event") continue;
            timers.push({
                entityId: row.entityId,
                resource,
                endTimestamp: row.endTimestamp,
                x: row.x,
                z: row.z,
            });
        }
        timers.sort((a, b) => {
            const aMs = a.endTimestamp.toMillis();
            const bMs = b.endTimestamp.toMillis();
            if (aMs === bMs) return 0;
            return aMs < bMs ? -1 : 1;
        });
        setTimersForRegion(regionId, timers);
    }

    function refreshAllRegionTimers(conn: DbConnection) {
        for (const regionId of TRACKED_REGION_IDS) {
            refreshRegionTimers(conn, regionId);
        }
    }

    function shouldSkipRealtimeEvent(ctx: EventContext): boolean {
        return ctx.event.tag === "SubscribeApplied";
    }

    function handleGrowthInsert(ctx: EventContext, row: GrowthTimer) {
        if (shouldSkipRealtimeEvent(ctx) || !connection) return;
        refreshRegionTimers(connection, row.regionId as number);
    }

    function handleGrowthDelete(ctx: EventContext, row: GrowthTimer) {
        if (shouldSkipRealtimeEvent(ctx) || !connection) return;
        refreshRegionTimers(connection, row.regionId as number);
    }

    function handleGrowthUpdate(ctx: EventContext, oldRow: GrowthTimer, row: GrowthTimer) {
        if (shouldSkipRealtimeEvent(ctx) || !connection) return;
        const oldRegion = oldRow.regionId as number;
        const newRegion = row.regionId as number;
        refreshRegionTimers(connection, oldRegion);
        if (oldRegion !== newRegion) {
            refreshRegionTimers(connection, newRegion);
        }
    }

    onMount(() => {
        nowInterval = setInterval(() => setNowMs(Date.now()), 1000);

        if (!RELAY_URI || !RELAY_MODULE) {
            setError("Missing relay config. Set VITE_RELAY_HOST and VITE_RELAY_MODULE.");
            return;
        }

        const tokenKey = `prism:${RELAY_URI}/${RELAY_MODULE}/auth_token`;

        connection = DbConnection.builder()
            .withUri(RELAY_URI)
            .withDatabaseName(RELAY_MODULE)
            .withToken(localStorage.getItem(tokenKey) ?? undefined)
            .onConnect((conn, _identity, token) => {
                localStorage.setItem(tokenKey, token);
                setConnected(true);
                setError(null);

                conn.db.growth_timers.onInsert(handleGrowthInsert);
                conn.db.growth_timers.onDelete(handleGrowthDelete);
                conn.db.growth_timers.onUpdate(handleGrowthUpdate);

                subscription = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        refreshAllRegionTimers(conn);
                    })
                    .onError((ctx) => {
                        setError(ctx.event ? `Subscription error: ${String(ctx.event)}` : "Subscription error.");
                    })
                    .subscribe([
                        // The relay bindings expose this table as growth_timers (same role as growth_state).
                        tables.growth_timers.where(r =>
                            r.regionId.eq(SOUTH_REGION_ID)
                                .or(r.regionId.eq(WEST_REGION_ID))
                                .or(r.regionId.eq(EAST_REGION_ID))
                                .or(r.regionId.eq(NORTH_REGION_ID))
                        )
                    ]);
            })
            .onDisconnect((ctx) => {
                setConnected(false);
                if (ctx.event) {
                    setError(`Disconnected: ${String(ctx.event)}`);
                }
            })
            .onConnectError((ctx) => {
                setConnected(false);
                setError(ctx.event ? `Connection error: ${String(ctx.event)}` : "Connection error.");
            })
            .build();
    });

    createEffect(() => {
        BitCraftTables.ResourceDesc.get();
        if (connection?.isActive) {
            refreshAllRegionTimers(connection);
        }
    });

    onCleanup(() => {
        if (nowInterval !== null) {
            clearInterval(nowInterval);
            nowInterval = null;
        }
        subscription?.unsubscribe();
        subscription = null;
        if (connection) {
            connection.disconnect();
            connection = null;
        }
        setConnected(false);
    });

    const globalHighlight = createMemo(() => {
        const allTimers = [
            ...northTimers(),
            ...westTimers(),
            ...eastTimers(),
            ...southTimers(),
        ];
        const activeEntityIds = new Set(allTimers.filter(isActiveEvent).map(timer => timer.entityId));
        const closestInactive = activeEntityIds.size === 0 ? getClosestInactiveEvent(allTimers) : null;
        return {
            activeEntityIds,
            closestInactiveEntityId: closestInactive?.entityId ?? null,
        };
    });

    const regionCards = createMemo(() => {
        const buildRegionCard = (title: string, positionClass: string, timers: () => EventTimer[]) => {
            return {
                title,
                positionClass,
                timers,
            };
        };
        return [
            buildRegionCard("Northern Islands", "lg:col-start-2 lg:row-start-1", northTimers),
            buildRegionCard("Southern Islands", "lg:col-start-2 lg:row-start-3", southTimers),
            buildRegionCard("Western Islands", "lg:col-start-1 lg:row-start-2", westTimers),
            buildRegionCard("Eastern Islands", "lg:col-start-3 lg:row-start-2", eastTimers),
        ];
    });

    return (
        <MainLayout title="Uncharted Islands Events" hideSearch>
            <div class="w-full px-4 pb-6">
                <h1 class="text-4xl font-bold mb-2 text-foreground text-center">Uncharted Islands Events</h1>
                <p class="text-center text-sm text-muted-foreground mb-8">
                    Relay status: {connected() ? "Connected" : "Disconnected"}
                </p>
                <Show when={error()}>
                    {(err) => (
                        <p class="text-sm text-destructive text-center mb-6">{err()}</p>
                    )}
                </Show>

                <div class="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-3 gap-4 lg:gap-6 max-w-6xl mx-auto">
                    <For each={regionCards()}>
                        {(region) => (
                            <section class={`rounded-lg border border-border bg-card p-4 ${region.positionClass}`}>
                                <h2 class="text-lg font-semibold text-foreground mb-3">{region.title}</h2>
                                <div class="flex flex-col gap-3">
                                    <For each={region.timers()} fallback={<p class="text-sm text-muted-foreground">No active world events.</p>}>
                                        {(timer) => (
                                            <div
                                                class={`flex items-center gap-3 rounded-md border bg-background/40 p-2 ${
                                                    globalHighlight().activeEntityIds.has(timer.entityId)
                                                        ? "border-green-600"
                                                        : globalHighlight().closestInactiveEntityId === timer.entityId
                                                            ? "border-blue-600"
                                                            : "border-border/70"
                                                }`}
                                            >
                                                <GameIcon
                                                    name={timer.resource.name}
                                                    iconAsset="GeneratedIcons/Other/GeneratedIcons/Other/Buildings/Crafting/Bank"
                                                    shape="square"
                                                    small
                                                    noInteract
                                                    rarity={MYTHIC_RARITY}
                                                    tier={-1}
                                                />
                                                <div class="flex flex-col min-w-0">
                                                    <span class="text-sm font-medium text-foreground">{timer.resource.name}</span>
                                                    <Tooltip>
                                                        <TooltipTrigger as="span" class="text-xs text-muted-foreground w-fit cursor-help">
                                                            {getTimeLeftText(timer, nowMs())}
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {formatEndTimestamp(timer.endTimestamp)}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    <a
                                                        href={getEventMapLink(timer)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                    >
                                                        <span>View Map</span>
                                                        <TbOutlineExternalLink class="w-3 h-3"/>
                                                    </a>
                                                    <CopyChatLinkButton content={getCopyChatText(timer)}/>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </section>
                        )}
                    </For>
                </div>
            </div>
        </MainLayout>
    );
}