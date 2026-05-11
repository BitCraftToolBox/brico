import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {TravelerTradePanel} from "~/components/shared/RecipeDisplay";
import {AchievementLink, LinkedList, SkillLinkById} from "~/lib/game-links";
import {getTravelerNpcName, getTravelerTradeName} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

const MAX_INT32 = 2147483647;

export default function TravelerTradeDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.TravelerTradeOrderDesc);
    const index = BitCraftTables.TravelerTradeOrderDesc.indexedBy("id");
    const achievementIndex = BitCraftTables.AchievementDesc.indexedBy("id");

    const trade = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const npcDesc = createMemo(() => {
        const t = trade();
        if (!t) return undefined;
        const tagOrdinal = BitCraftTables.TravelerTradeOrderDesc.tagToOrdinal("traveler");
        const npcOrdinal = tagOrdinal.get(t.traveler.tag);
        if (npcOrdinal === undefined) return undefined;
        return BitCraftTables.NpcDesc.indexedBy("npcType")()?.get(npcOrdinal);
    });

    const npcName = createMemo(() => getTravelerNpcName(trade()?.traveler.tag ?? ""));
    const tradeName = createMemo(() => trade() ? getTravelerTradeName(trade()!) : `Trade #${params.id}`);

    const levelReqsEl = createMemo(() => {
        const t = trade();
        if (!t?.levelRequirements?.length) return undefined;
        return (
            <LinkedList>
                {t.levelRequirements.map(req => (
                    <SkillLinkById skillId={req.skillId} level={`Lv. ${req.level}`}/>
                ))}
            </LinkedList>
        );
    });

    const achievementReqsEl = createMemo(() => {
        const t = trade();
        if (!t?.achievementRequirements?.length) return undefined;
        return (
            <LinkedList>
                {t.achievementRequirements.map(id => {
                    const ach = achievementIndex()?.get(id);
                    return <AchievementLink id={id} name={ach?.name}/>;
                })}
            </LinkedList>
        );
    });

    return (
        <DetailPageLayout
            title={tradeName()}
            loading={isLoading() && !trade()}
            icon={npcDesc() ? <FontIcon codepoint={npcDesc()!.iconAddress} class="size-16"/> : undefined}
            name={`${npcName()} Trade`}
            description={tradeName()}
            details={[
                {label: "Traveler", value: npcName()},
                {label: "Starting Stock", value: trade() && trade()!.startingStock !== MAX_INT32 ? trade()!.startingStock : undefined},
                {label: "Always Offered", value: trade()?.alwaysOffered === false ? "No" : undefined},
                {label: "Level Requirements", value: levelReqsEl()},
                {label: "Achievement Requirements", value: achievementReqsEl()},
                {label: "Hide If Requirements Not Met", value: trade()?.hideIfRequirementsAreNotMet === true ? "Yes" : undefined},
            ]}
            summaryContent={() => trade() ? <TravelerTradePanel trade={trade()!}/> : <></>}
            rawData={trade()}
            spacetimeTable={BitCraftTables.TravelerTradeOrderDesc.st_name}
            objectId={trade()?.id}
        />
    );
}

