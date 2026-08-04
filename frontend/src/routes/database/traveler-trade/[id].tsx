import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {TravelerTradePanel} from "~/components/shared/RecipeDisplay";
import {AchievementLink, LinkedList, SkillLinkById} from "~/lib/game-links";
import {ogImageForCodepoint} from "~/lib/og-meta";
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
        return index().get(id);
    });

    const npcDesc = createMemo(() => {
        const t = trade();
        if (!t) return undefined;
        const tagOrdinal = BitCraftTables.TravelerTradeOrderDesc.tagToOrdinal("traveler");
        const npcOrdinal = tagOrdinal.get(t.traveler.tag);
        if (npcOrdinal === undefined) return undefined;
        return BitCraftTables.NpcDesc.indexedBy("npcType")().get(npcOrdinal);
    });

    const npcName = createMemo(() => getTravelerNpcName(trade()?.traveler.tag ?? ""));
    const tradeName = createMemo(() => trade() ? getTravelerTradeName(trade()!) : `Trade #${params.id}`);

    // Return render thunks (not pre-built elements): building this JSX inside the memo, off the
    // render path, drifts Solid's SSR hydration ids and crashes the bot path. DetailPageLayout
    // invokes the thunk where it renders the value.
    const levelReqsEl = createMemo(() => {
        const t = trade();
        if (!t?.levelRequirements?.length) return undefined;
        const reqs = t.levelRequirements;
        return () => (
            <LinkedList>
                {reqs.map(req => (
                    <SkillLinkById skillId={req.skillId} level={`Lv. ${req.level}`}/>
                ))}
            </LinkedList>
        );
    });

    const achievementReqsEl = createMemo(() => {
        const t = trade();
        if (!t?.achievementRequirements?.length) return undefined;
        const reqs = t.achievementRequirements;
        return () => (
            <LinkedList>
                {reqs.map(id => {
                    const ach = achievementIndex()?.get(id);
                    return <AchievementLink id={id} name={ach?.name}/>;
                })}
            </LinkedList>
        );
    });

    return (
        <DetailPageLayout
            title={tradeName()}
            breadcrumbHref="/database/traveler-trade"
            loading={isLoading() && !trade()}
            icon={npcDesc() ? <FontIcon codepoint={npcDesc()!.iconAddress} class="size-16"/> : undefined}
            name={`${npcName()} Trade`}
            description={tradeName()}
            defaultTab="summary"
            metaKind="traveler trade"
            metaImage={ogImageForCodepoint(npcDesc()?.iconAddress)}
            details={[
                {label: msg`Traveler`, value: npcName()},
                {label: msg`Starting Stock`, value: trade() && trade()!.startingStock !== MAX_INT32 ? trade()!.startingStock : undefined},
                {label: msg`Always Offered`, value: trade()?.alwaysOffered === false ? "No" : undefined},
                {label: msg`Level Requirements`, value: levelReqsEl()},
                {label: msg`Achievement Requirements`, value: achievementReqsEl()},
                {label: msg`Hide If Requirements Not Met`, value: trade()?.hideIfRequirementsAreNotMet === true ? "Yes" : undefined},
            ]}
            summaryContent={() => trade() ? <TravelerTradePanel trade={trade()!}/> : <></>}
            rawData={trade()}
            spacetimeTable={BitCraftTables.TravelerTradeOrderDesc.spacetimeName}
            objectId={trade()?.id}
        />
    );
}

