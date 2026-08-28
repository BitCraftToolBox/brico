import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {StatTable} from "~/components/shared/RelTablePresets";
import {checkStepHeight} from "~/lib/bitcraft-utils";
import {IconLink, ItemLink, pageIcon} from "~/lib/game-links";
import {surfaceTypeLabel} from "~/lib/game-strings";
import {ogImageForAsset} from "~/lib/og-meta";
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
        return index().get(id);
    });

    const collectible = createMemo(() => deployable() ? collectibleIndex().get(deployable()!.deployFromCollectibleId) : undefined);
    const itemDeed = createMemo(() => collectible() ? itemIndex().get(collectible()!.itemDeedId) : undefined);
    const pathfinding = createMemo(() => deployable() ? pathfindingIndex().get(deployable()!.pathfindingId) : undefined);
    const appearances = createMemo(() => {
        const dep = deployable();
        if (!dep) return [];
        const model = dep.modelAddress;
        const overrides = BitCraftTables.DeployableAppearanceOverrideDesc.get();
        return overrides?.filter(o => o.affectedModelAddress === model)
            .map(dao => collectibleIndex().get(dao.collectibleId))
            .filter((col): col is CollectibleDesc => !!col) ?? [];
    });

    const {labels: pathfindingLabels} = checkStepHeight(pathfinding);

    const detailGroups = createMemo((): DetailGroup[] => {
        const d = deployable();
        if (!d) return [];
        return [
            {
                properties: [
                    {label: msg`Occupants`, value: d.capacity},
                    {label: msg`Allow Hunting`, value: d.allowHunting},
                    {label: msg`Allow Gathering`, value: d.allowDriverExtract},
                    {label: msg`Show After Logout`, value: readableSeconds(undefinedIfZero(d.showForSecsAfterOwnerLogout))},
                ]
            },
            {
                heading: msg`Inventory`,
                properties: [
                    {label: msg`Item Slots`, value: d.storage > 0 ? `${d.storage} × ${d.itemSlotSize / 6000}` : "0"},
                    {label: msg`Cargo Slots`, value: d.stockpile > 0 ? `${d.stockpile} × ${d.cargoSlotSize / 6000}` : "0"},
                    {label: msg`Barter Slots`, value: undefinedIfZero(d.barter)},
                ],
            },
            {
                heading: msg`Movement`,
                properties: [
                    ...pathfindingLabels(),
                    {label: msg`Water Depth`, value: undefinedIfZero(pathfinding()?.maxWaterDepth)},
                    {label: msg`Can Auto Follow`, value: d.canAutoFollow},
                    {label: msg`Wind Multiplier`, value: undefinedIfZero(fixFloat(d.affectedByWind))},
                    {label: msg`Can Enter Portals`, value: d.canEnterPortals},
                    {label: msg`Mounting Radius`, value: d.mountingRadius},
                    {label: msg`Radius`, value: undefinedIfZero(d.radius)},
                ],
            },
            {
                heading: msg`Speed`,
                properties: [
                    ...(deployable()?.speed?.map((ms) => ({
                        label: surfaceTypeLabel(ms.surfaceType.tag),
                        value: undefinedIfZero(ms.speed),
                    })) ?? [])
                ]
            },
            {
                heading: msg`Placement`,
                properties: [
                    {label: msg`Placeable on Land`, value: d.placeableOnLand},
                    {label: msg`Placeable in Water`, value: d.placeableInWater},
                    {label: msg`Deploy time`, value: readableSeconds(undefinedIfZero(d.deployTime))},
                ],
            },
        ];
    });

    return (
        <DetailPageLayout
            title={deployable()?.name ?? `Deployable #${params.id}`}
            breadcrumbHref="/database/deployable"
            loading={isLoading() && !deployable()}
            icon={<Show when={collectible()}>{c => <CollectibleIcon collectible={c()} small={false} noInteract/>}</Show>}
            name={deployable()?.name ?? "Deployable not found"}
            tag={deployable()?.deployableType?.tag}
            metaKind="deployable"
            metaImage={ogImageForAsset(collectible()?.iconAssetName)}
            details={detailGroups()}
            rawData={deployable()}
            spacetimeTable={BitCraftTables.DeployableDesc.spacetimeName}
            objectId={deployable()?.id}
            chatLink={`(coll=${collectible()?.id})`}
            tabs={[
                {
                    id: "appearances",
                    label: msg`Appearances`,
                    count: appearances().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<CollectibleDesc>
                            data={appearances()} columns={[
                            {header: msg`Collectible`, cell: row => <CollectibleIcon collectible={row} small/>},
                            {header: msg`Name`, cell: row => <IconLink icon={pageIcon("Collection")} href={`/database/collectible/${row.id}`}>{row.name}</IconLink>},
                        ]}
                        />
                    )
                },
                {
                    id: "stats",
                    label: msg`Stats`,
                    count: deployable()?.stats?.length ?? 0,
                    showWhenEmpty: false,
                    content: () => <StatTable data={deployable()!.stats}/>,
                },
                ...(collectible() ? [collectiblesTab([collectible()!])] : []),
                {
                    id: "deed",
                    label: msg`Item Deed`,
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
