import {CargoDesc, ItemDesc, ItemType} from "~/bindings/ts";
import {renderItemDescDialog} from "~/components/details/itemdesc-details";
import {DialogContent, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TbCopy} from 'solid-icons/tb'
import {renderBuildingDialog} from "~/components/details/buildingdesc-details";


export function renderDialog(content: [string, any]) {
    const [contentType, stObject] = content;
    if (!contentType) return <></>;
    switch (contentType) {
        case "raw": return (
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Raw Details <TbCopy class="inline" onclick={() => {
                        // noinspection JSIgnoredPromiseFromCall
                        window.navigator.clipboard.writeText(JSON.stringify(stObject, null, 2));
                    }}/></DialogTitle>
                </DialogHeader>
                <pre>{JSON.stringify(stObject, null, 2)}</pre>
            </DialogContent>
        )
        case "ItemDesc": return renderItemDescDialog(stObject as ItemDesc, ItemType.Item.tag);
        case "CargoDesc": return renderItemDescDialog(stObject as CargoDesc, ItemType.Cargo.tag);
        case "BuildingDesc": return renderBuildingDialog(stObject as BuildingDesc);
        default: return <></>
    }
}