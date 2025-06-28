import {Component, ComponentProps, splitProps} from "solid-js";
import {BuildingDesc} from "~/bindings/ts";
import {cleanAssetPath, getBuildingTier, Tiers} from "~/lib/bitcraft-utils";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {cn} from "~/lib/utils";
import {BitCraftTables} from "~/lib/spacetime";
import {useDetailDialog} from "~/lib/contexts";

type BuildingIconProps = ComponentProps<"div"> & {
    building: number | BuildingDesc
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

export const BuildingIcon: Component<BuildingIconProps> = (props: BuildingIconProps) => {
    const [local, others] = splitProps(props, ["class", "building", "small", "noInteract"]);
    const small = typeof local.small === "undefined" ? true : local.small;
    const noInteract = local.noInteract || false;

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

    const bgColor = Tiers.getBackgroundColorClass(getBuildingTier(building));
    const path = building.iconAssetName
        ? "/assets/" + cleanAssetPath(building.iconAssetName) + ".webp"
        : "/assets/Unknown.webp";

    const dialog = useDetailDialog();

    return (
        <Tooltip disabled={noInteract}>
            <TooltipTrigger onclick={(ev: MouseEvent) => {
                if (noInteract) return;
                dialog.setContent(["BuildingDesc", building]);
                dialog.setOpen(true);
                ev.stopPropagation();
            }}>
                <div
                    class={cn(`rounded border-3 ${bgColor} ${divW} ${divH}`, local.class)}
                    {...others}
                >
                    <img src={path} alt={building.name}/>
                </div>
            </TooltipTrigger>
            <TooltipContent class={`border-1 ${bgColor}`}>
                {building.name}
            </TooltipContent>
        </Tooltip>
    )
}