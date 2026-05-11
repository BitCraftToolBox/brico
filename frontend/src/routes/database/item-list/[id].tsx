import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemListSourceIcon} from "~/components/shared/GameIcon";
import {getItemListSource, ItemListSource} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {itemListTab} from "~/lib/table-utils/detail-tab-builders";


export default function ItemListDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.ItemListDesc);
    const index = BitCraftTables.ItemListDesc.indexedBy("id");

    const itemList = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const source = createMemo((): ItemListSource => {
        const il = itemList();
        return getItemListSource(il);
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
            loading={isLoading() && !itemList()}
            name={itemList()?.name || `Item List #${params.id}`}
            tag={"Item List"}
            icon={<Show when={itemList()}>{il => <ItemListSourceIcon list={il()} noInteract={true}/>}</Show>}
            rawData={itemList()}
            spacetimeTable={BitCraftTables.ItemListDesc.st_name}
            objectId={itemList()?.id}
            chatLink={chatLink()}
            tabs={[
                itemListTab(itemList()),
            ]}
        />
    );
}
