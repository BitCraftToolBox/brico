import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {WeaponTypeDesc} from "~/bindings/src/weapon_type_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {BuffTable} from "~/components/shared/RelTablePresets";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, undefinedIfZero} from "~/lib/utils";

export default function CombatDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.CombatActionDesc);
    const index = BitCraftTables.CombatActionDesc.indexedBy("id");
    const weaponTypeIndex = BitCraftTables.WeaponTypeDesc.indexedBy("id");
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");

    const action = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const weaponTypes = createMemo(() => {
        const a = action();
        if (!a?.weaponTypeRequirements?.length) return [];
        const idx = weaponTypeIndex();
        if (!idx) return [];
        return a.weaponTypeRequirements.map(id => idx.get(id)).filter((v): v is WeaponTypeDesc => !!v);
    });

    const mapBuffEffects = (effects: BuffEffect[]) => {
        const idx = buffIndex();
        if (!idx) return [];
        return effects.map((be) => {
            let buffDesc = idx.get(be.buffId);
            return ({
                ...be,
                duration: be.duration ?? buffDesc?.duration,
                label: buffDesc?.description ?? `Buff #${be.buffId}`
            });
        });
    }

    const selfBuffs = createMemo(() => {
        const a = action();
        if (!a || !a.selfBuffs?.length) return [];
        return mapBuffEffects(a.selfBuffs);
    });

    const targetBuffs = createMemo(() => {
        const a = action();
        if (!a || !a.targetBuffs?.length) return [];
        return mapBuffEffects(a.targetBuffs);
    });

    return (
        <DetailPageLayout
            title={action()?.name ?? `Combat Action #${params.id}`}
            loading={isLoading() && !action()}
            name={action()?.name ?? "Combat action not found"}
            description={action()?.description}
            details={[
                {
                    properties: [
                        {label: "Player Ability", value: action()?.learnedByPlayer},
                        {label: "Weapon Type", value: weaponTypes().length > 0 ? weaponTypes().map(wt => wt.name).join(", ") : undefined},
                        {label: "Auto-cast", value: action()?.autoCast},
                        {label: "Is Self Targeting", value: action()?.isSelfTargeting ? true : undefined},
                    ]
                },
                {
                    heading: "Combat Stats",
                    properties: [
                        {label: "Stamina Use", value: action() ? fixFloat(action()!.staminaUse) : undefined},
                        {label: "Max Range", value: action()?.maxRange},
                        {label: "Strength Multiplier", value: action() ? `${fixFloat(action()!.strengthMultiplier)}x` : undefined},
                        {label: "Accuracy Multiplier", value: action() ? `${fixFloat(action()!.accuracyMultiplier)}x` : undefined},
                        {label: "Lead In Time", value: action() ? fixFloat(action()!.leadInTime) : undefined},
                        {label: "Inaction Time", value: action() ? undefinedIfZero(fixFloat(action()!.inactionTime)) : undefined},
                        {label: "Projectile Speed", value: action()?.projectileSpeed},
                        {label: "Weapon Durability Lost", value: action() ? undefinedIfZero(fixFloat(action()!.weaponDurabilityLost)) : undefined},
                    ]
                },
                {
                    heading: "Cooldown",
                    properties: [
                        {label: "Cooldown", value: action() ? fixFloat(action()!.cooldown) : undefined},
                        {label: "Global Cooldown", value: action() ? fixFloat(action()!.globalCooldown) : undefined},
                        {label: "Ignores Global Cooldown", value: action()?.ignoreGlobalCooldown},
                    ]
                },
                {
                    heading: "Threat",
                    properties: [
                        {label: "Base Threat", value: action() ? fixFloat(action()!.baseThreat) : undefined},
                        {label: "Threat Per Damage", value: action() ? fixFloat(action()!.threatPerDamage) : undefined},
                        {label: "Is Taunt", value: action()?.isTauntAction},
                    ]
                },

            ]}
            rawData={action()}
            spacetimeTable={BitCraftTables.CombatActionDesc.st_name}
            objectId={action()?.id}
            tabs={[
                {id: "self-buffs", label: "Self Buffs", count: selfBuffs().length, content: () => <BuffTable data={selfBuffs()}/>},
                {id: "target-buffs", label: "Target Buffs", count: targetBuffs().length, content: () => <BuffTable data={targetBuffs()}/>},
            ]}
        />
    );
}
