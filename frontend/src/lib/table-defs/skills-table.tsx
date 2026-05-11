import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const SkillDefs: BitCraftToDataDef<SkillDesc> = {
    columns: [
        headerColumn<SkillDesc, any>({
            route: skill => ["skill", skill.id],
            prefixElement: skill => (
                <FontIcon codepoint={skill.iconAssetName}/>
            )
        }),
        descriptionColumn(),
        {id: "Title", accessorKey: "title"},
        {
            id: "Category",
            accessorKey: "skillCategory.tag",
            filterFn: includedIn<SkillDesc>(),
        },
        {id: "Max Level", accessorKey: "maxLevel", filterFn: "inNumberRange"},
        rowActions(undefined, "prof"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Category"),
        rangeFilter("Max Level"),
    ],
    searchColumns: ["Name", "Description", "Title"],
};
