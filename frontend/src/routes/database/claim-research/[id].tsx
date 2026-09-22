import {msg} from "@lingui/core/macro";
import {useNavigate, useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {ogImageForPage} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {readableSeconds, undefinedIfZero} from "~/lib/utils";

export default function ClaimResearchDetail() {
    const params = useParams();
    const navigate = useNavigate();
    const isLoading = useTablesLoading(BitCraftTables.ClaimTechDesc);
    const index = BitCraftTables.ClaimTechDesc.indexedBy("id");

    const tech = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const requirements = createMemo(() => {
        const t = tech();
        if (!t?.requirements?.length) return [];
        const idx = index();
        return t.requirements.map(id => idx.get(id)).filter((v): v is ClaimTechDesc => !!v);
    });

    const unlocksTechs = createMemo(() => {
        const t = tech();
        if (!t?.unlocksTechs?.length) return [];
        const idx = index();
        return t.unlocksTechs.map(id => idx.get(id)).filter((v): v is ClaimTechDesc => !!v);
    });

    const claimTechColumns = [
        {header: msg`Tech`, cell: (row: ClaimTechDesc) => <span>{row.name}</span>},
        {header: msg`Tier`, cell: (row: ClaimTechDesc) => <span>{row.tier}</span>},
    ];

    return (
        <DetailPageLayout
            title={tech()?.name ?? `Claim Tech #${params.id}`}
            breadcrumbHref="/database/claim-research"
            loading={isLoading() && !tech()}
            name={tech()?.name ?? "Claim research not found"}
            tier={tech()?.tier}
            description={tech()?.description}
            metaKind="claim research"
            metaImage={ogImageForPage("Claim Research")}
            details={[
                {
                    heading: msg`Cost`,
                    properties: [
                        {label: msg`Item Cost`, value: tech()?.input.length ? () => <ItemStackArray stacks={tech()!.input} class="justify-start py-2"/> : "None"},
                        {label: msg`Supply Cost`, value: tech()?.suppliesCost},
                        {label: msg`Research Time`, value: readableSeconds(undefinedIfZero(tech()?.researchTime))},
                    ]
                },
                {
                    heading: msg`Unlocks`,
                    properties: [
                        {label: msg`Members`, value: undefinedIfZero(tech()?.members)},
                        {label: msg`Area`, value: undefinedIfZero(tech()?.area)},
                        {label: msg`Supplies`, value: undefinedIfZero(tech()?.supplies)},
                        {label: msg`XP to mint Hex Coin`, value: undefinedIfZero(tech()?.xpToMintHexCoin)},
                    ]
                }
            ]}
            rawData={tech()}
            spacetimeTable={BitCraftTables.ClaimTechDesc.spacetimeName}
            objectId={tech()?.id}
            tabs={[
                {
                    id: "requirements",
                    label: msg`Requirements`,
                    count: requirements().length,
                    content: () => <RelTable<ClaimTechDesc> data={requirements()} columns={claimTechColumns} onRowClick={(row) => navigate(`/database/claim-research/${row.id}`)}/>
                },
                {
                    id: "unlocks",
                    label: msg`Unlocks Techs`,
                    count: unlocksTechs().length,
                    showWhenEmpty: false,
                    content: () => <RelTable<ClaimTechDesc> data={unlocksTechs()} columns={claimTechColumns} onRowClick={(row) => navigate(`/database/claim-research/${row.id}`)}/>
                },
            ]}
        />
    );
}

