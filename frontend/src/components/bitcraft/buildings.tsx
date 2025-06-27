import {Component, ComponentProps, splitProps} from "solid-js";
import {BuildingDesc} from "~/bindings/ts";
import {cleanAssetPath, Tiers} from "~/lib/bitcraft-utils";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {cn} from "~/lib/utils";
import {BitCraftTables} from "~/lib/spacetime";

type BuildingIconProps = ComponentProps<"div"> & {
    building: number | BuildingDesc
    small?: boolean
}

const height = "h-[130px]";
const width = "w-[130px]";
const heightSmall = "h-[65px]";
const widthSmall = "w-[65px]";

function getWidth(isSmall: boolean) {
    return isSmall ? widthSmall : width;
}

function getHeight(isSmall: boolean) {
    return isSmall ? heightSmall : height;
}

export const BuildingIcon: Component<BuildingIconProps> = (props: BuildingIconProps) => {
    const [local, others] = splitProps(props, ["class", "building", "small"]);
    const small = typeof local.small === "undefined" ? true : local.small;

    let building: BuildingDesc;
    let divW: typeof width | typeof widthSmall;
    let divH: typeof height | typeof heightSmall;

    if (typeof local.building === "number") {
        building = BitCraftTables.BuildingDesc.indexedBy("id")!()!.get(local.building)!;
    } else {
        building = local.building;
    }
    divW = getWidth(small);
    divH = getHeight(small);

    // TODO where do buildings get their tier?
    // it shows in the build menu but I can't see it in the building desc or construction recipe (outside of lvl/material requirements)
    const bgColor = Tiers.getBackgroundColorClass(0);
    const path = building.iconAssetName
        ? "/assets/" + cleanAssetPath(building.iconAssetName) + ".webp"
        : "/assets/Unknown.webp";
    return (
        <Tooltip>
            <TooltipTrigger>
                <div
                    class={cn(`rounded border-3 ${bgColor} ${divW} ${divH}`, local.class)}
                    {...others}
                >
                    <img src={path} alt={building.name}/>
                </div>
            </TooltipTrigger>
            <TooltipContent class={`border-1`}>
                {building.name}
            </TooltipContent>
        </Tooltip>
    )
}