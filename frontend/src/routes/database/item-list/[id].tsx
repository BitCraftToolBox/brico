import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemListSourceIcon} from "~/components/shared/GameIcon";
import {absoluteUrl, ogImageForPage} from "~/lib/og-meta";
import {getItemListSource, ItemListSource} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {detailHref} from "~/lib/table-utils/column-builders";
import {itemListTab} from "~/lib/table-utils/detail-tab-builders";


export default function ItemListDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.ItemListDesc);
    const index = BitCraftTables.ItemListDesc.indexedBy("id");

    const itemList = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const source = createMemo((): ItemListSource => {
        const il = itemList();
        return getItemListSource(il);
    });
    /**
     * An item list whose owner is known is a duplicate of a tab that owner's page already renders in
     * full — so point the canonical there and let the ranking signals consolidate onto one URL.
     * Deliberately *not* a redirect (unlike the tool/food/weapon/equipment pages, see middleware.ts):
     * plenty of item lists are reached from the very page they'd redirect to — a creature's
     * Contribution Loot tab links lists owned by that same creature — so a redirect would bounce the
     * reader straight back where they came from. Lists with no resolvable owner stay canonical here,
     * which is what this page continues to exist for.
     */
    const canonicalOverride = createMemo(() => {
        const s = source();
        switch (s.type) {
            case "Item":
                return absoluteUrl(detailHref(["item", s.item.id]));
            case "Enemy":
                return s.enemy ? absoluteUrl(detailHref(["creature", s.enemy.enemyType])) : undefined;
        }
        return undefined;
    });

    const chatLink = createMemo(() => {
        const s = source();
        switch (s.type) {
            case "Item":
                return `(item=${s.item.id})`;
            case "Enemy":
                return s.enemy ? `(mob=${s.enemy.enemyType})` : undefined;
        }
        return undefined;
    })

    return (
        <DetailPageLayout
            title={itemList()?.name || `Item List #${params.id}`}
            breadcrumbHref="/database/item-list"
            canonicalOverride={canonicalOverride()}
            loading={isLoading() && !itemList()}
            name={itemList()?.name || `Item List #${params.id}`}
            tag={"Item List"}
            metaKind="item list"
            metaImage={ogImageForPage("Item Lists")}
            icon={<Show when={itemList()}>{il => <ItemListSourceIcon list={il()} noInteract={true}/>}</Show>}
            rawData={itemList()}
            spacetimeTable={BitCraftTables.ItemListDesc.spacetimeName}
            objectId={itemList()?.id}
            chatLink={chatLink()}
            tabs={[
                itemListTab(itemList()),
            ]}
        />
    );
}
