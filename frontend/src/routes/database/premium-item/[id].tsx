import {CollectibleDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon, GameIcon} from "~/components/shared/GameIcon";
import {HexiteShardPrice} from "~/components/shared/HexiteShardPrice.tsx";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {CollectibleLink} from "~/lib/game-links";
import {collectibleTypeLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
import {ogImageForAsset} from "~/lib/og-meta";
import {premiumItemTypeLabel, premiumItemTypes} from "~/lib/premium-items";

export default function PremiumItemDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.PremiumItemDesc, BitCraftTables.CollectibleDesc);
    const index = BitCraftTables.PremiumItemDesc.indexedBy("id");
    const collectibleIndex = BitCraftTables.CollectibleDesc.indexedBy("id");

    const item = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const types = createMemo(() => {
        const p = item();
        return p ? premiumItemTypes(p) : [];
    });

    // One row per distinct collectible, in first-seen order, with how many times it is included.
    const collectibles = createMemo(() => {
        const p = item();
        if (!p) return [];
        const idx = collectibleIndex();
        const quantities = new Map<number, number>();
        for (const id of p.collectibleIds) quantities.set(id, (quantities.get(id) ?? 0) + 1);
        return [...quantities].flatMap(([id, quantity]) => {
            const collectible = idx.get(id);
            return collectible ? [{collectible, quantity}] : [];
        });
    });

    return (
        <DetailPageLayout
            title={item()?.name ?? `Premium Item #${params.id}`}
            breadcrumbHref="/database/premium-item"
            breadcrumbTitle={msg`Premium Item`}
            loading={isLoading() && !item()}
            icon={<Show when={item()}>{p => <GameIcon name={p().name} iconAsset={p().imageAddress} shape="square" small={false} noInteract/>}</Show>}
            name={item()?.name ?? "Premium item not found"}
            description={item()?.description}
            tag={types().length ? types().map(premiumItemTypeLabel).join(", ") : undefined}
            metaKind="premium item"
            metaImage={ogImageForAsset(item()?.imageAddress)}
            details={[
                {label: msg`Price`, value: item() ? () => <HexiteShardPrice amount={item()!.price}/> : undefined},
                {label: msg`Base Price`, value: item() ? () => <HexiteShardPrice amount={item()!.basePrice}/> : undefined},
                {label: msg`Quantity`, value: item()?.quantity},
                {label: msg`Enabled`, value: item()?.isEnabled},
                {label: msg`Sort Priority`, value: item()?.sortingPriority},
            ]}
            rawData={item()}
            spacetimeTable={BitCraftTables.PremiumItemDesc.spacetimeName}
            objectId={item()?.id}
            tabs={[
                {
                    id: "collectibles",
                    label: msg`Collectibles`,
                    count: collectibles().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<{collectible: CollectibleDesc, quantity: number}> data={collectibles()} columns={[
                            {
                                header: gameText(msg`Collectible`),
                                cell: ({collectible: c}) => c.iconAssetName ? <CollectibleIcon collectible={c} small/> : <></>,
                                class: "w-10",
                            },
                            {header: gameText(msg`Name`), cell: ({collectible: c}) => <CollectibleLink id={c.id} name={c.name} showIcon={false}/>},
                            {header: msg`Type`, cell: ({collectible: c}) => <span>{collectibleTypeLabel(c.collectibleType.tag)}</span>},
                            {header: msg`Quantity`, cell: ({quantity}) => <span>{quantity}</span>},
                        ]}/>
                    ),
                },
            ]}
        />
    );
}
