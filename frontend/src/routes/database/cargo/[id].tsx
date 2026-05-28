import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {ItemType} from "~/bindings/src/item_type_type";
import {lootTab} from "~/components/fun/BricoLootBox";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {CargoIcon} from "~/components/shared/GameIcon";
import {breadcrumb} from "~/lib/game-links";
import {interactionsInvolvingItem, placementsConsumingItem} from "~/lib/placeables";
import {
    constructionRecipesConsuming,
    conversionRecipesConsuming,
    conversionRecipesProducing,
    craftingRecipesConsuming,
    craftingRecipesProducing,
    deconstructionRecipesProducing,
    extractionRecipesConsuming,
    questsRequiringItem,
    questsRewardingItem,
    questsWithStageConditionItem,
    resourcesYielding,
    travelerTasksRequiring,
    travelerTasksRewarding,
    travelerTradesOffering,
    travelerTradesRequiring,
} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {
    constructionCombinedTab,
    conversionTab,
    craftedFromTab,
    craftsIntoTab,
    depletionTab,
    enemyDropsTab,
    extractionTab,
    itemListsTab,
    placeableInteractionsTab,
    placeablePlacementTab,
    questRequirementsTab,
    questRewardsTab,
    travelerTasksTab,
    travelerTradesTab,
} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat, readableSeconds} from "~/lib/utils";
import {questDropAugmentedLists} from "~/routes/database/item/[id]";

export default function CargoDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.CargoDesc);
    const { easterEggs } = useSettings();
    const cargoIndex = BitCraftTables.CargoDesc.indexedBy("id");
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const cargo = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return cargoIndex()?.get(id);
    });

    const knowledgeName = createMemo(() => {
        const c = cargo();
        if (!c?.secondaryKnowledgeId) return undefined;
        return knowledgeIndex()?.get(c.secondaryKnowledgeId)?.name;
    });

    // ─── Per-type recipe/relationship finders ───────────────────

    const cargoType = ItemType.Cargo.tag;
    const cargoId = () => cargo()?.id;

    const craftedFrom = createMemo(() => cargoId() != null ? craftingRecipesProducing(cargoId()!, cargoType) : []);
    const craftsInto = createMemo(() => cargoId() != null ? craftingRecipesConsuming(cargoId()!, cargoType) : []);
    const extractionUses = createMemo(() => cargoId() != null ? extractionRecipesConsuming(cargoId()!, cargoType) : []);
    const constructsInto = createMemo(() => cargoId() != null ? constructionRecipesConsuming(cargoId()!, cargoType) : []);
    const deconstructedFrom = createMemo(() => cargoId() != null ? deconstructionRecipesProducing(cargoId()!, cargoType) : []);
    const conversionInputs = createMemo(() => cargoId() != null ? conversionRecipesConsuming(cargoId()!, cargoType) : []);
    const conversionOutputs = createMemo(() => cargoId() != null ? conversionRecipesProducing(cargoId()!, cargoType) : []);
    const taskRequires = createMemo(() => cargoId() != null ? travelerTasksRequiring(cargoId()!, cargoType) : []);
    const taskRewards = createMemo(() => cargoId() != null ? travelerTasksRewarding(cargoId()!, cargoType) : []);
    const tradeRequires = createMemo(() => cargoId() != null ? travelerTradesRequiring(cargoId()!, cargoType) : []);
    const tradeOffers = createMemo(() => cargoId() != null ? travelerTradesOffering(cargoId()!, cargoType) : []);
    const depletionSources = createMemo(() => cargoId() != null ? resourcesYielding(cargoId()!, cargoType) : []);
    const {extractionDrops, enemyDrops, inItemLists} = questDropAugmentedLists(cargoId, cargoType);

    const questRequires = createMemo(() => {
        if (cargoId() == null) return [];
        const byReq = questsRequiringItem(cargoId()!, cargoType);
        const byCondition = questsWithStageConditionItem(cargoId()!, cargoType);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewards = createMemo(() => cargoId() != null ? questsRewardingItem(cargoId()!, cargoType) : []);

    const placeablePlacements = createMemo(() => cargoId() != null ? placementsConsumingItem(cargoId()!, cargoType) : []);
    const placeableInteractions = createMemo(() => cargoId() != null ? interactionsInvolvingItem(cargoId()!, cargoType) : []);

    return (
        <DetailPageLayout
            title={cargo()?.name ?? `Cargo #${params.id}`}
            breadcrumb={breadcrumb("/database/cargo")}
            loading={isLoading() && !cargo()}
            icon={<Show when={cargo()}>{(c) =>
                <CargoIcon cargo={c()} small={false} noInteract/>
            }</Show>}
            iconIsWide={true}
            name={cargo()?.name ?? "Cargo not found"}
            tier={cargo()?.tier}
            rarity={cargo()?.rarity?.tag}
            description={cargo()?.description}
            tag={cargo()?.tag}
            details={[
                {label: "Volume", value: cargo()?.volume},
                {label: "Pick Up Time", value: readableSeconds(fixFloat(cargo()?.pickUpTime))},
                {label: "Place Time", value: readableSeconds(fixFloat(cargo()?.placeTime))},
                {label: "Movement Modifier", value: cargo()?.movementModifier ? `${fixFloat(cargo()!.movementModifier)}x` : undefined},
                {label: "Blocks Path", value: cargo()?.blocksPath},
                {label: "Not Pickupable", value: cargo()?.notPickupable ? true : undefined},
                //{label: "Despawn Time", value: readableSeconds(fixFloat(cargo()?.despawnTime))}, // game doesn't actually use this anymore, cargo are just DroppedItems now
                {label: "Knowledge", value: knowledgeName()},
            ]}
            rawData={cargo()}
            spacetimeTable={BitCraftTables.CargoDesc.st_name}
            objectId={cargo()?.id}
            chatLink={`(cargo=${cargo()?.id})`}
            tabs={!cargo() ? [] : [
                craftedFromTab(craftedFrom()),
                craftsIntoTab(craftsInto()),
                extractionTab(extractionDrops(), extractionUses()),
                depletionTab(extractionDrops(), extractionUses(), depletionSources()),
                enemyDropsTab(enemyDrops()),
                constructionCombinedTab(constructsInto(), deconstructedFrom()),
                conversionTab(conversionInputs(), conversionOutputs()),
                travelerTasksTab(taskRewards(), taskRequires()),
                travelerTradesTab(tradeOffers(), tradeRequires()),
                itemListsTab(inItemLists()),
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewards()),
                placeablePlacementTab(placeablePlacements()),
                placeableInteractionsTab(placeableInteractions()),
                ...(cargo()?.id === 92169812 && easterEggs() ? [lootTab()] : [])
            ]}
        />
    );
}
