/**
 * building/[id].tsx — every open craft in one building, addressed by the building *entity* id.
 */
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {ProgressBar} from "~/components/crafts/craft-columns";
import {OutputIcon} from "~/components/crafts/OutputIcon";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {Badge} from "~/components/ui/badge";
import {Card, CardContent} from "~/components/ui/card";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {createBountyAssignments} from "~/lib/crafts/bounty";
import {craftEntriesFrom} from "~/lib/crafts/entries";
import {createBuildingRelay} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {useLabel} from "~/lib/labels";

const BROWSE_HREF = "/tools/crafts/browse";

/** The building entity id from the URL; `null` for anything but a plain non-negative integer. */
function parseBuildingId(raw: string | undefined): bigint | null {
    if (!raw || !/^\d+$/.test(raw)) return null;
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}

export default function BuildingCrafts() {
    const params = useParams();
    const label = useLabel();

    const buildingId = createMemo(() => parseBuildingId(params.id as string | undefined));
    const relay = createBuildingRelay(buildingId);
    const bountyAssignments = createBountyAssignments();

    const entries = createMemo(() =>
        craftEntriesFrom(relay.snapshot(), bountyAssignments())
            .sort((a, b) => a.recipeName.localeCompare(b.recipeName, uiLocale())),
    );

    const buildingName = createMemo(() => {
        const descId = entries().at(0)?.buildingDescId;
        if (descId === undefined) return label(msg`Building`);
        return BitCraftTables.BuildingDesc.indexedBy("id")().get(descId)?.name ?? `Building #${descId}`;
    });
    const claimName = () => entries().find(entry => entry.claimName)?.claimName ?? null;

    return (
        <MainLayout
            title={buildingName()}
            ownHeading
            description="Live BitCraft crafts in a single building."
            navTitle={breadcrumb(BROWSE_HREF)}
        >
            <div class="mx-auto max-w-4xl space-y-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <div>
                        <h1 class="text-3xl font-bold text-foreground">{buildingName()}</h1>
                        <Show when={claimName()}>
                            {name => <p class="text-muted-foreground">{name()}</p>}
                        </Show>
                    </div>
                    <div class="ml-auto flex flex-row gap-2">
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Show
                    when={entries().length > 0}
                    fallback={
                        <p class="text-muted-foreground">
                            <Show when={buildingId() !== null} fallback={<Trans>That is not a building id.</Trans>}>
                                <Show when={relay.ready()} fallback={<Trans>Loading crafts…</Trans>}>
                                    <Trans>No open crafts in this building.</Trans>
                                </Show>
                            </Show>
                        </p>
                    }
                >
                    <div class="grid gap-3 sm:grid-cols-2">
                        <For each={entries()}>
                            {entry => (
                                <A href={`/tools/crafts/${entry.id}`} class="block">
                                    <Card class="h-full transition-colors hover:bg-muted/50">
                                        <CardContent class="flex items-start gap-3 p-4">
                                            <OutputIcon output={entry.output}/>
                                            <div class="flex min-w-0 flex-1 flex-col gap-1">
                                                <div class="flex items-center gap-2">
                                                    <span class="min-w-0 flex-1 truncate font-medium">{entry.output?.desc.name ?? entry.recipeName}</span>
                                                    <span class="text-muted-foreground">×{entry.count}</span>
                                                </div>
                                                <div class="flex flex-wrap items-center gap-2 text-sm">
                                                    <span class="text-muted-foreground">{entry.ownerName ?? "—"}</span>
                                                    <Show when={!entry.public}>
                                                        <Badge variant="secondary"><Trans>private</Trans></Badge>
                                                    </Show>
                                                    <Show when={entry.complete}>
                                                        <Badge variant="secondary"><Trans>complete</Trans></Badge>
                                                    </Show>
                                                </div>
                                                <ProgressBar entry={entry}/>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </A>
                            )}
                        </For>
                    </div>
                </Show>

                <p class="text-sm text-muted-foreground">
                    <A href={BROWSE_HREF} class="hover:underline">
                        <Trans>← Back to the craft browser</Trans>
                    </A>
                </p>
            </div>
        </MainLayout>
    );
}
