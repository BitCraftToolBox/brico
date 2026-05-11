import {useNavigate, useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ItemStackTable} from "~/components/shared/RelTablePresets";
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
        return index()?.get(id);
    });

    const requirements = createMemo(() => {
        const t = tech();
        if (!t?.requirements?.length) return [];
        const idx = index();
        if (!idx) return [];
        return t.requirements.map(id => idx.get(id)).filter((v): v is ClaimTechDesc => !!v);
    });

    const unlocksTechs = createMemo(() => {
        const t = tech();
        if (!t?.unlocksTechs?.length) return [];
        const idx = index();
        if (!idx) return [];
        return t.unlocksTechs.map(id => idx.get(id)).filter((v): v is ClaimTechDesc => !!v);
    });

    const claimTechColumns = [
        {header: "Tech", cell: (row: ClaimTechDesc) => <span>{row.name}</span>},
        {header: "Tier", cell: (row: ClaimTechDesc) => <span>{row.tier}</span>},
    ];

    return (
        <DetailPageLayout
            title={tech()?.name ?? `Claim Tech #${params.id}`}
            loading={isLoading() && !tech()}
            name={tech()?.name ?? "Claim research not found"}
            tier={tech()?.tier}
            description={tech()?.description}
            details={[
                {
                    heading: "Cost",
                    properties: [
                        {label: "Supply Cost", value: tech()?.suppliesCost},
                        {label: "Research Time", value: readableSeconds(undefinedIfZero(tech()?.researchTime))},
                    ]
                },
                {
                    heading: "Unlocks",
                    properties: [
                        {label: "Members", value: undefinedIfZero(tech()?.members)},
                        {label: "Area", value: undefinedIfZero(tech()?.area)},
                        {label: "Supplies", value: undefinedIfZero(tech()?.supplies)},
                        {label: "XP to Mint HexCoin", value: undefinedIfZero(tech()?.xpToMintHexCoin)},
                    ]
                }
            ]}
            rawData={tech()}
            spacetimeTable={BitCraftTables.ClaimTechDesc.st_name}
            objectId={tech()?.id}
            tabs={[
                {id: "cost", label: "Item Cost", count: tech()?.input?.length ?? 0, content: () => <ItemStackTable data={tech()!.input}/>},
                {
                    id: "requirements",
                    label: "Requirements",
                    count: requirements().length,
                    content: () => <RelTable<ClaimTechDesc> data={requirements()} columns={claimTechColumns} onRowClick={(row) => navigate(`/database/claim-research/${row.id}`)}/>
                },
                {
                    id: "unlocks",
                    label: "Unlocks Techs",
                    count: unlocksTechs().length,
                    content: () => <RelTable<ClaimTechDesc> data={unlocksTechs()} columns={claimTechColumns} onRowClick={(row) => navigate(`/database/claim-research/${row.id}`)}/>
                },
            ]}
        />
    );
}

