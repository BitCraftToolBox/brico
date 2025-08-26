import {Component, ComponentProps, splitProps} from "solid-js";
import {ResourceDesc} from "~/bindings/src";
import {cleanAssetPath, Rarities, Tiers} from "~/lib/bitcraft-utils";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {cn} from "~/lib/utils";
import {TierIcon} from "~/components/bitcraft/misc";
import {BitCraftTables} from "~/lib/spacetime";
import {useDetailDialog} from "~/lib/contexts";

type ResourceIconProps = ComponentProps<"div"> & {
    res: number | ResourceDesc
    small?: boolean
    noInteract?: boolean
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
    const [local, others] = splitProps(props, ["class", "res", "small", "noInteract"]);
    const small = typeof local.small === "undefined" ? true : local.small;
    const noInteract = local.noInteract || false;

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

    const dialog = useDetailDialog();

    return (
        <Tooltip disabled={noInteract}>
            <TooltipTrigger onclick={(ev: MouseEvent) => {
                if (noInteract) return;
                dialog.setContent(["ResourceDesc", resource]);
                dialog.setOpen(true);
                ev.stopPropagation();
            }}>
                <div
                    class={cn(`rounded border-3 ${borderColor} ${bgColor} ${divW} ${divH}`, local.class)}
                    {...others}
                >
                    <img src={path} alt={resource.name}
                         onerror={(e) => (e.target as HTMLImageElement).src = "/assets/Unknown.webp"} />
                </div>
            </TooltipTrigger>
            <TooltipContent class={`border-1 ${borderColor}`}>
                {resource.name} <TierIcon tier={resource.tier}/>, {resource.rarity.tag}
            </TooltipContent>
        </Tooltip>
    )
}