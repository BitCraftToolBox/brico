import {msg} from "@lingui/core/macro";
import {CellContext} from "@tanstack/solid-table";
import {JSX} from "solid-js";
import {SkillCategory} from "~/bindings/src/skill_category_type";
import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {skillCategoryLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
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
        {id: "Title", meta: {label: gameText(msg`Title`)}, accessorKey: "title"},
        {
            id: "Category",
            meta: {label: msg`Category`},
            accessorKey: "skillCategory.tag",
            cell: (props: CellContext<any, SkillCategory["tag"]>): JSX.Element => skillCategoryLabel(props.getValue()),
            filterFn: includedIn<SkillDesc>(),
        },
        {id: "Max Level", meta: {label: msg`Max Level`}, accessorKey: "maxLevel", filterFn: "inNumberRange"},
        rowActions(undefined, "prof"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Category", msg`Category`),
        rangeFilter("Max Level", msg`Max Level`),
    ],
    searchColumns: ["Name", "Description", "Title"],
};
