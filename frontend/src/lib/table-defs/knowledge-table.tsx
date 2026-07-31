import {msg} from "@lingui/core/macro";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {sourceRow} from "~/lib/data-translation";
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
                const scroll = scrollIdx().get(k.id);
                if (!scroll) return <></>;
                const item = BitCraftTables.ItemDesc.indexedBy("id")().get(scroll.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        // `sourceRow` on the *scroll* row: tagColumn un-translates the row it is given, but these
        // accessors reach into a different table, so the English value has to come from here.
        tagColumn(undefined, {
            accessorFn: row => {
                const scroll = sourceRow(BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(row.id));
                return scroll?.tag ?? "";
            }
        }),
        tagColumn("Title", {
            accessorFn: row => {
                const scroll = sourceRow(BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(row.id));
                return scroll?.title ?? "";
            }
        }, msg`Title`),
        boolColumn("Known By Default", {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(row.id);
                return scroll?.knownByDefault;
            }
        }, msg`Known By Default`),
        boolColumn("Auto Collect", {
            accessorFn: row => {
                const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(row.id);
                return scroll?.autoCollect;
            }
        }, msg`Auto Collect`),
        statsColumn<SecondaryKnowledgeDesc>(undefined, {
            accessorFn: row => {
                const mod = BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")().get(row.id);
                return mod?.stats.length ? mod?.stats : undefined;
            }
        }),
        rowActions(undefined, "know", undefined, { accessorFn: k => BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(k.id)?.itemId?.toString() }),
    ],
    facetedFilters: [
        uniqueValuesFilter("Tag", msg`Tag`),
        boolFilter("Known By Default", msg`Known By Default`),
        boolFilter("Auto Collect", msg`Auto Collect`),
        statsFilter(),
    ],
    searchColumns: ["Name", "Description", "Title"],
};

