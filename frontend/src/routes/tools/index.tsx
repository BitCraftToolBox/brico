import {msg} from "@lingui/core/macro";
import MainLayout from "~/components/MainLayout";
import NavSections from "~/components/NavSections";
import {useLabel} from "~/lib/labels";

const TITLE = msg`Toolbox`;

export default function ToolsHome() {
    const label = useLabel();
    return (
        <MainLayout
            title={label(TITLE)}
            description="Tools and utilities for BitCraft players: event timers, emblem editor, and more."
        >
            <NavSections groups={["Toolbox"]}/>
        </MainLayout>
    );
}
