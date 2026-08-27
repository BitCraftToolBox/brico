import {msg} from "@lingui/core/macro";
import MainLayout from "~/components/MainLayout";
import NavSections from "~/components/NavSections";
import {useLabel} from "~/lib/labels";

const TITLE = msg`Database`;

export default function DatabaseHome() {
    const label = useLabel();
    return (
        <MainLayout
            title={label(TITLE)}
            description="Browse the BitCraft compendium: items, creatures, resources, buildings, skills, and more."
        >
            <NavSections groups={["Compendium", "Item Details", "Progression", "Character", "World"]}/>
        </MainLayout>
    );
}
