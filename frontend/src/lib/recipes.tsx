import {BitCraftTables} from "~/lib/spacetime";
import {CargoDesc, CraftingRecipeDesc, ExtractionRecipeDesc, ItemDesc, ItemType, ResourceDesc} from "~/bindings/src";


function getRecipes(
    recipes: CraftingRecipeDesc[],
    recipeMap: Map<number, [string, CraftingRecipeDesc]>,
    itemData: Map<any, ItemDesc>,
    cargoData: Map<any, CargoDesc>
) {
    recipes.forEach((recipe) => {
        const mainOutput = recipe.craftedItemStacks.at(0)!;
        const mainInput = recipe.consumedItemStacks.at(0)!
        if (!mainOutput) {
            return; // there is an empty recipe, but it's not linked to anything anyway
        }
        const mainOutputItem = mainOutput.itemType.tag === ItemType.Item.tag
            ? itemData.get(mainOutput.itemId) : cargoData.get(mainOutput.itemId);
        const mainInputItem = mainInput.itemType.tag === ItemType.Item.tag
            ? itemData.get(mainInput.itemId) : cargoData.get(mainInput.itemId);
        const friendlyName = recipe.name
            .replace("{0}", mainOutputItem?.name || "{0}")
            .replace("{1}", mainInputItem?.name || "{1}");
        recipeMap.set(recipe.id, [friendlyName, recipe]);
    })
}

function getExtractions(
    extractionsData: ExtractionRecipeDesc[],
    extractionMap: Map<number, [string, ExtractionRecipeDesc]>,
    resourceData: Map<any, ResourceDesc>,
    cargoData: Map<any, CargoDesc>
) {
    extractionsData?.forEach((extraction) => {
        const resource = extraction.resourceId;
        const cargo = extraction.cargoId;
        const name = resource ? resourceData.get(resource)?.name : cargoData.get(cargo)?.name;
        extractionMap.set(extraction.id, [extraction.verbPhrase + " " + (name ?? "Unknown"), extraction]);
    })
}

export function getRecipeMaps(item: ItemDesc | CargoDesc, itemType: string): {
    useRecipe: Map<number, [string, CraftingRecipeDesc]>
    acquireRecipe: Map<number, [string, CraftingRecipeDesc]>
    useExtraction: Map<number, [string, ExtractionRecipeDesc]>
    acquireExtraction: Map<number, [string, ExtractionRecipeDesc]>
} {
    const itemDescIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const cargoDescIndex = BitCraftTables.CargoDesc.indexedBy("id");
    const resourceDescIndex = BitCraftTables.ResourceDesc.indexedBy("id");

    const itemData = itemDescIndex && itemDescIndex()!;
    const cargoData = cargoDescIndex && cargoDescIndex()!;
    const resourceData = resourceDescIndex && resourceDescIndex()!;

    const recipesIndex = BitCraftTables.CraftingRecipeDesc.findByItemStacks(item.id, itemType);
    const extractionsIndex = BitCraftTables.ExtractionRecipeDesc.findByItemStacks(item.id, itemType);

    const recipesData = recipesIndex && recipesIndex();
    const extractionsData = extractionsIndex && extractionsIndex();

    const inputRecipeMap = new Map<number, [string, CraftingRecipeDesc]>();
    const outputRecipeMap = new Map<number, [string, CraftingRecipeDesc]>();
    const [inputRecipes, outputRecipes] = recipesData!;
    getRecipes(inputRecipes, inputRecipeMap, itemData!, cargoData!);
    getRecipes(outputRecipes, outputRecipeMap, itemData!, cargoData!);

    const inputExtractionMap = new Map<number, [string, ExtractionRecipeDesc]>();
    const outputExtractionMap = new Map<number, [string, ExtractionRecipeDesc]>();
    const [inputExtractions, outputExtractions] = extractionsData!;
    getExtractions(inputExtractions, inputExtractionMap, resourceData!, cargoData!);
    getExtractions(outputExtractions, outputExtractionMap, resourceData!, cargoData!);

    return {
        useRecipe: inputRecipeMap,
        acquireRecipe: outputRecipeMap,
        useExtraction: inputExtractionMap,
        acquireExtraction: outputExtractionMap
    }
}

export function getResourceExtraction(res: ResourceDesc) {
    const cargoDescIndex = BitCraftTables.CargoDesc.indexedBy("id");
    const resourceDescIndex = BitCraftTables.ResourceDesc.indexedBy("id");

    const cargoData = cargoDescIndex && cargoDescIndex()!;
    const resourceData = resourceDescIndex && resourceDescIndex()!;

    const extractionsIndex = BitCraftTables.ExtractionRecipeDesc.indexedBy("resourceId");

    const extraction = extractionsIndex!()!.get(res.id);

    if (extraction) {
        const resource = extraction.resourceId;
        const cargo = extraction.cargoId;
        const name = resource ? resourceData!.get(resource)?.name : cargoData!.get(cargo)?.name;
        return [extraction.id, [extraction.verbPhrase + " " + (name ?? "Unknown"), extraction]] as [number, [string, ExtractionRecipeDesc]];
    }
    return undefined;
}