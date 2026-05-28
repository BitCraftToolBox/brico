import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {CombatActionTable} from "~/components/shared/RelTablePresets";
import {breadcrumb} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

export default function WeaponDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.WeaponDesc);
    const index = BitCraftTables.WeaponDesc.indexedBy("itemId");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const weaponTypeIndex = BitCraftTables.WeaponTypeDesc.indexedBy("id");

    const weapon = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const item = createMemo(() => weapon() ? itemIndex()?.get(weapon()!.itemId) : undefined);
    const weaponType = createMemo(() => weapon() ? weaponTypeIndex()?.get(weapon()!.weaponType) : undefined);

    const combatActions = createMemo(() => {
        const w = weapon();
        if (!w) return [];
        const all = BitCraftTables.CombatActionDesc.get();
        if (!all) return [];
        return all.filter((a: CombatActionDesc) => a.weaponTypeRequirements?.includes(w.weaponType));
    });

    return (
        <DetailPageLayout
            title={item()?.name ?? `Weapon #${params.id}`}
            breadcrumb={breadcrumb("/database/weapon")}
            loading={isLoading() && !weapon()}
            icon={<Show when={item()}>{(i) =>
                <GameIcon name={i().name} iconAsset={i().iconAssetName} shape="tall"
                          small={false} tier={i().tier} rarity={i().rarity} noInteract/>
            }</Show>}
            name={item()?.name ?? `Weapon #${params.id}`}
            tier={weapon()?.tier}
            rarity={item()?.rarity?.tag}
            tag={weaponType()?.name}
            details={[
                {label: "Min Damage", value: weapon()?.minDamage},
                {label: "Max Damage", value: weapon()?.maxDamage},
                {label: "Cooldown", value: weapon() ? fixFloat(weapon()!.cooldown) : undefined},
                {label: "Stamina Mult", value: weapon() ? `${fixFloat(weapon()!.staminaUseMultiplier)}x` : undefined},
                {label: "Hunting", value: weaponType()?.hunting},
            ]}
            rawData={weapon()}
            spacetimeTable={BitCraftTables.WeaponDesc.st_name}
            objectId={weapon()?.itemId}
            chatLink={`(item=${item()?.id})`}
            tabs={[
                {id: "combat", label: "Combat Actions", count: combatActions().length, content: () => <CombatActionTable data={combatActions()}/>},
            ]}
        />
    );
}

