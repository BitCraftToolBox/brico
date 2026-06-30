import {useNavigate, useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {breadcrumb, IconLink} from "~/lib/game-links";
import {prospectingForBiome} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function BiomeDetail() {
    const params = useParams();
    const navigate = useNavigate();
    const isLoading = useTablesLoading(BitCraftTables.BiomeDesc);
    const index = BitCraftTables.BiomeDesc.indexedBy("biomeType");

    const biome = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const prospectingEntries = createMemo(() => {
        const b = biome();
        if (!b) return [];
        return prospectingForBiome(b.biomeType);
    });

    return (
        <DetailPageLayout
            title={biome()?.name ?? `Biome #${params.id}`}
            breadcrumb={breadcrumb("/database/biome")}
            loading={isLoading() && !biome()}
            name={biome()?.name ?? "Biome not found"}
            description={biome()?.description}
            details={[
                {label: "Hazard Level", value: biome()?.hazardLevel},
                {label: "Disallow Player Build", value: biome()?.disallowPlayerBuild},
            ]}
            rawData={biome()}
            spacetimeTable={BitCraftTables.BiomeDesc.st_name}
            objectId={biome()?.biomeType}
            tabs={[
                {
                    id: "prospecting", label: "Prospecting", count: prospectingEntries().length,
                    content: () => (
                        <RelTable<ProspectingDesc>
                            data={prospectingEntries()}
                            columns={[
                                {header: "Name", cell: (row) => (
                                    <IconLink href={`/database/prospecting/${row.id}`} icon={<FontIcon codepoint={row.iconAssetPath} class="size-4 inline"/>}>
                                        {row.name}
                                    </IconLink>
                                )},
                                {header: "Description", cell: (row) => <span class="text-muted-foreground text-xs">{row.description}</span>},
                            ]}
                        />
                    ),
                },
            ]}
        />
    );
}
