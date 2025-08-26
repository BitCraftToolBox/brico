import {BuildingDesc, CargoDesc, ItemDesc, ItemType, ResourceDesc} from "~/bindings/src";
import {renderItemDescDialog} from "~/components/details/itemdesc-details";
import {DialogContent, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TbCopy} from 'solid-icons/tb'
import {renderBuildingDialog} from "~/components/details/buildingdesc-details";
import {renderResourceDialog} from "~/components/details/resourcedesc-details";

export function renderDialog(content: [string, any]) {
    const [contentType, stObject] = content;
    if (!contentType) return <></>;
    let childContent;
    switch (contentType) {
        case "raw":
            childContent = (
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Raw Details <TbCopy class="inline" onclick={() => {
                            // noinspection JSIgnoredPromiseFromCall
                            window.navigator.clipboard.writeText(JSON.stringify(stObject, null, 2));
                        }}/></DialogTitle>
                    </DialogHeader>
                    <pre>{JSON.stringify(stObject, null, 2)}</pre>
                </DialogContent>
            );
            break;
        case "ItemDesc":
            childContent = renderItemDescDialog(stObject as ItemDesc, ItemType.Item.tag);
            break;
        case "CargoDesc":
            childContent = renderItemDescDialog(stObject as CargoDesc, ItemType.Cargo.tag);
            break;
        case "BuildingDesc":
            childContent = renderBuildingDialog(stObject as BuildingDesc);
            break;
        case "ResourceDesc":
            childContent = renderResourceDialog(stObject as ResourceDesc);
            break;
        default:
            childContent = null;
    }
    if (!childContent) return <>Not found/not yet implemented.</>;
    return childContent;
}