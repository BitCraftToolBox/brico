import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {WeaponTypeDesc} from "~/bindings/src/weapon_type_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {BuffTable} from "~/components/shared/RelTablePresets";
import {ogImageForCodepoint} from "~/lib/og-meta";
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
        return index().get(id);
    });

    const weaponTypes = createMemo(() => {
        const a = action();
        if (!a?.weaponTypeRequirements?.length) return [];
        const idx = weaponTypeIndex();
        return a.weaponTypeRequirements.map(id => idx.get(id)).filter((v): v is WeaponTypeDesc => !!v);
    });

    const mapBuffEffects = (effects: BuffEffect[]) => {
        const idx = buffIndex();
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
            breadcrumbHref="/database/combat"
            breadcrumbTitle={msg`Combat Action`}
            loading={isLoading() && !action()}
            name={action()?.name ?? "Combat action not found"}
            icon={<Show when={action()?.iconAssetName}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            description={action()?.description}
            metaKind="combat action"
            metaImage={ogImageForCodepoint(action()?.iconAssetName)}
            details={[
                {
                    properties: [
                        {label: msg`Player Ability`, value: action()?.learnedByPlayer},
                        {label: msg`Weapon Type`, value: weaponTypes().length > 0 ? weaponTypes().map(wt => wt.name).join(", ") : undefined},
                        {label: msg`Auto-cast`, value: action()?.autoCast},
                        {label: msg`Is Self Targeting`, value: action()?.isSelfTargeting ? true : undefined},
                    ]
                },
                {
                    heading: msg`Combat Stats`,
                    properties: [
                        {label: msg`Stamina Use`, value: action() ? fixFloat(action()!.staminaUse) : undefined},
                        {label: msg`Max Range`, value: action()?.maxRange},
                        {label: msg`Strength Multiplier`, value: action() ? `${fixFloat(action()!.strengthMultiplier)}x` : undefined},
                        {label: msg`Accuracy Multiplier`, value: action() ? `${fixFloat(action()!.accuracyMultiplier)}x` : undefined},
                        {label: msg`Lead In Time`, value: action() ? fixFloat(action()!.leadInTime) : undefined},
                        {label: msg`Inaction Time`, value: action() ? undefinedIfZero(fixFloat(action()!.inactionTime)) : undefined},
                        {label: msg`Projectile Speed`, value: action()?.projectileSpeed},
                        {label: msg`Weapon Durability Lost`, value: action() ? undefinedIfZero(fixFloat(action()!.weaponDurabilityLost)) : undefined},
                    ]
                },
                {
                    heading: msg`Cooldown`,
                    properties: [
                        {label: msg`Cooldown`, value: action() ? fixFloat(action()!.cooldown) : undefined},
                        {label: msg`Global Cooldown`, value: action() ? fixFloat(action()!.globalCooldown) : undefined},
                        {label: msg`Ignores Global Cooldown`, value: action()?.ignoreGlobalCooldown},
                    ]
                },
                {
                    heading: msg`Threat`,
                    properties: [
                        {label: msg`Base Threat`, value: action() ? fixFloat(action()!.baseThreat) : undefined},
                        {label: msg`Threat Per Damage`, value: action() ? fixFloat(action()!.threatPerDamage) : undefined},
                        {label: msg`Is Taunt`, value: action()?.isTauntAction},
                    ]
                },

            ]}
            rawData={action()}
            spacetimeTable={BitCraftTables.CombatActionDesc.spacetimeName}
            objectId={action()?.id}
            tabs={[
                {id: "self-buffs", label: msg`Self Buffs`, count: selfBuffs().length, content: () => <BuffTable data={selfBuffs()}/>},
                {id: "target-buffs", label: msg`Target Buffs`, count: targetBuffs().length, content: () => <BuffTable data={targetBuffs()}/>},
            ]}
        />
    );
}
