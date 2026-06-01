import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {StatTable} from "~/components/shared/RelTablePresets";
import {checkStepHeight} from "~/lib/bitcraft-utils";
import {breadcrumb, IconLink, ItemLink, pageIcon} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {collectiblesTab} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat, readableSeconds, undefinedIfZero} from "~/lib/utils";

export default function DeployableDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.DeployableDesc);
    const index = BitCraftTables.DeployableDesc.indexedBy("id");
    const collectibleIndex = BitCraftTables.CollectibleDesc.indexedBy("id");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const pathfindingIndex = BitCraftTables.PathfindingDesc.indexedBy("id");

    const deployable = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const collectible = createMemo(() => deployable() ? collectibleIndex()?.get(deployable()!.deployFromCollectibleId) : undefined);
    const itemDeed = createMemo(() => collectible() ? itemIndex()?.get(collectible()!.itemDeedId) : undefined);
    const pathfinding = createMemo(() => deployable() ? pathfindingIndex()?.get(deployable()!.pathfindingId) : undefined);
    const appearances = createMemo(() => {
        const dep = deployable();
        if (!dep) return [];
        const model = dep.modelAddress;
        const overrides = BitCraftTables.DeployableAppearanceOverrideDesc.get();
        const collectibles = BitCraftTables.CollectibleDesc.indexedBy("id")();
        return overrides?.filter(o => o.affectedModelAddress === model)
            .map(dao => collectibles.get(dao.collectibleId))
            .filter((col): col is CollectibleDesc => !!col) ?? [];
    });

    const {labels: pathfindingLabels} = checkStepHeight(pathfinding);

    const detailGroups = createMemo((): DetailGroup[] => {
        const d = deployable();
        if (!d) return [];
        return [
            {
                properties: [
                    {label: "Occupants", value: d.capacity},
                    {label: "Allow Hunting", value: d.allowHunting},
                    {label: "Allow Gathering", value: d.allowDriverExtract},
                    {label: "Show After Logout", value: readableSeconds(undefinedIfZero(d.showForSecsAfterOwnerLogout))},
                ]
            },
            {
                heading: "Inventory",
                properties: [
                    {label: "Item Slots", value: d.storage > 0 ? `${d.storage} × ${d.itemSlotSize / 6000}` : "0"},
                    {label: "Cargo Slots", value: d.stockpile > 0 ? `${d.stockpile} × ${d.cargoSlotSize / 6000}` : "0"},
                    {label: "Barter Slots", value: undefinedIfZero(d.barter)},
                ],
            },
            {
                heading: "Movement",
                properties: [
                    ...pathfindingLabels(),
                    {label: "Water Depth", value: undefinedIfZero(pathfinding()?.maxWaterDepth)},
                    {label: "Can Auto Follow", value: d.canAutoFollow},
                    {label: "Wind Multiplier", value: undefinedIfZero(fixFloat(d.affectedByWind))},
                    {label: "Can Enter Portals", value: d.canEnterPortals},
                    {label: "Mounting Radius", value: d.mountingRadius},
                    {label: "Radius", value: undefinedIfZero(d.radius)},
                ],
            },
            {
                heading: "Speed",
                properties: [
                    ...(deployable()?.speed?.map((ms) => ({
                        label: ms.surfaceType.tag,
                        value: undefinedIfZero(ms.speed),
                    })) ?? [])
                ]
            },
            {
                heading: "Placement",
                properties: [
                    {label: "Placeable on Land", value: d.placeableOnLand},
                    {label: "Placeable in Water", value: d.placeableInWater},
                    {label: "Deploy time", value: readableSeconds(undefinedIfZero(d.deployTime))},
                ],
            },
        ];
    });

    return (
        <DetailPageLayout
            title={deployable()?.name ?? `Deployable #${params.id}`}
            breadcrumb={breadcrumb("/database/deployable")}
            loading={isLoading() && !deployable()}
            icon={<Show when={collectible()}>{c => <CollectibleIcon collectible={c()} small={false} noInteract/>}</Show>}
            name={deployable()?.name ?? "Deployable not found"}
            tag={deployable()?.deployableType?.tag}
            details={detailGroups()}
            rawData={deployable()}
            spacetimeTable={BitCraftTables.DeployableDesc.st_name}
            objectId={deployable()?.id}
            chatLink={`(col=${collectible()?.id})`}
            tabs={[
                {
                    id: "appearances",
                    label: "Appearances",
                    count: appearances().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<CollectibleDesc>
                            data={appearances()} columns={[
                            {header: "Collectible", cell: row => <CollectibleIcon collectible={row} small/>},
                            {header: "Name", cell: row => <IconLink icon={pageIcon("Collection")} href={`/database/collectible/${row.id}`}>{row.name}</IconLink>},
                        ]}
                        />
                    )
                },
                {
                    id: "stats",
                    label: "Stats",
                    count: deployable()?.stats?.length ?? 0,
                    showWhenEmpty: false,
                    content: () => <StatTable data={deployable()!.stats}/>,
                },
                ...(collectible() ? [collectiblesTab([collectible()!])] : []),
                {
                    id: "deed",
                    label: "Item Deed",
                    count: itemDeed() ? 1 : 0,
                    content: () => (
                        <Show when={itemDeed()}>
                            {d => <div class="p-1">
                                <ItemLink id={d().id} name={d().name}/>
                            </div>}
                        </Show>
                    ),
                },
            ]}
        />
    );
}
