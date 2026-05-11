import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolColumn, boolFilter, headerColumn, rowActions, tagColumn, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";

export const KnowledgeDefs: BitCraftToDataDef<SecondaryKnowledgeDesc> = {
    columns: [
        headerColumn<SecondaryKnowledgeDesc, any>({
            route: k => ["knowledge", k.id],
            prefixElement: k => {
                const scrollIdx = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId");
                const scroll = scrollIdx()?.get(k.id);
                if (!scroll) return <></>;
                const item = BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(scroll.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        tagColumn(undefined, {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(row.id);
                return scroll?.tag;
            }
        }),
        tagColumn("Title", {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(row.id);
                return scroll?.title;
            }
        }),
        boolColumn("Known By Default", {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(row.id);
                return scroll?.knownByDefault;
            }
        }),
        boolColumn("Auto Collect", {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(row.id);
                return scroll?.autoCollect;
            }
        }),
        statsColumn<SecondaryKnowledgeDesc>(undefined, {
            accessorFn: row => {
                const mod = BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")()?.get(row.id);
                return mod?.stats.length ? mod?.stats : undefined;
            }
        }),
        rowActions(undefined, "know", undefined, { accessorFn: k => BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(k.id)?.itemId?.toString() }),
    ],
    facetedFilters: [
        uniqueValuesFilter("Tag"),
        boolFilter("Known By Default"),
        boolFilter("Auto Collect"),
        statsFilter("Stats"),
    ],
    searchColumns: ["Name", "Description", "Title"],
};

