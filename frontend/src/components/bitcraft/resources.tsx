import {Component, ComponentProps, splitProps} from "solid-js";
import {ResourceDesc} from "~/bindings/ts";
import {cleanAssetPath, Rarities, Tiers} from "~/lib/bitcraft-utils";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {cn} from "~/lib/utils";
import {TierIcon} from "~/components/bitcraft/misc";
import {BitCraftTables} from "~/lib/spacetime";

type ResourceIconProps = ComponentProps<"div"> & {
    res: number | ResourceDesc
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

export const ResourceIcon: Component<ResourceIconProps> = (props: ResourceIconProps) => {
    const [local, others] = splitProps(props, ["class", "res", "small"]);
    const small = typeof local.small === "undefined" ? true : local.small;

    let resource: ResourceDesc;
    let divW: typeof width | typeof widthSmall;
    let divH: typeof height | typeof heightSmall;

    if (typeof local.res === "number") {
        resource = BitCraftTables.ResourceDesc.indexedBy("id")!()!.get(local.res)!;
    } else {
        resource = local.res;
    }
    divW = getWidth(small);
    divH = getHeight(small);

    const bgColor = Tiers.getBackgroundColorClass(resource.tier);
    const borderColor = Rarities.getBorderColorClass(resource.rarity);
    const path = resource.iconAssetName
        ? "/assets/" + cleanAssetPath(resource.iconAssetName) + ".webp"
        : "/assets/Unknown.webp";
    return (
        // <div class="flex flex-col justify-center">
        <Tooltip>
            <TooltipTrigger>
                <div
                    class={cn(`rounded border-3 ${borderColor} ${bgColor} ${divW} ${divH}`, local.class)}
                    {...others}
                >
                    <img src={path} alt={resource.name}/>
                </div>
            </TooltipTrigger>
            <TooltipContent class={`border-1 ${borderColor}`}>
                {resource.name} <TierIcon tier={resource.tier}/>, {resource.rarity as unknown as string /* TODO .tag */}
            </TooltipContent>
        </Tooltip>
        // </div>
    )
}