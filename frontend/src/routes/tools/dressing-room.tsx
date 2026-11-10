/**
 * Dressing Room — preview any combination of equipment and character customization on the 3D character.
 *
 * Route: /tools/dressing-room
 */

import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import MainLayout from "~/components/MainLayout";
import DressingRoom from "~/components/model-viewer/DressingRoom";
import {breadcrumbCurrent} from "~/lib/game-links";

export default function DressingRoomTool() {
    const {_} = useLingui();
    return (
        <MainLayout
            title={_(msg`Dressing Room`)}
            ownHeading
            description="Try on BitCraft equipment, cosmetics and customization options on a 3D character with Brico.app's Dressing Room."
            navTitle={breadcrumbCurrent("/tools/dressing-room")}
        >
            <div class="flex flex-col gap-4 px-4 pb-6">
                <h1 class="text-center text-xl font-bold"><Trans>Dressing Room</Trans></h1>
                <DressingRoom/>
            </div>
        </MainLayout>
    );
}
