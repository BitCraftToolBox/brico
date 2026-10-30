import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemListSourceIcon} from "~/components/shared/GameIcon";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {chatLink} from "~/lib/chat-links";
import {absoluteUrl, ogImageForPage} from "~/lib/og-meta";
import {getItemListOwner, getItemListSources} from "~/lib/relations";
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

    const owner = createMemo(() => getItemListOwner(getItemListSources(itemList())));
    /**
     * An item list with a single owner (see getItemListOwner) is a duplicate of a tab that owner's
     * page already renders in full.
     * Deliberately *not* a redirect (unlike the tool/food/weapon/equipment pages, see middleware.ts):
     * plenty of item lists are reached from the very page they'd redirect to, so a redirect would bounce
     * the reader straight back where they came from. Lists with no resolvable owner stay canonical here,
     * which is what this page continues to exist for.
     */
    const canonicalOverride = createMemo(() => {
        const o = owner();
        switch (o?.type) {
            case "Item":
                return absoluteUrl(detailHref(["item", o.item.id]));
            case "Enemy":
                return absoluteUrl(detailHref(["creature", o.enemy.enemyType]));
        }
        return undefined;
    });

    const ownerChatLink = createMemo(() => {
        const o = owner();
        switch (o?.type) {
            case "Item":
                return chatLink("item", o.item.id);
            case "Enemy":
                return chatLink("mob", o.enemy.enemyType);
        }
        return undefined;
    });

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
            chatLink={ownerChatLink()}
            tabs={[
                itemListTab(itemList(), true),
            ]}
        />
    );
}
