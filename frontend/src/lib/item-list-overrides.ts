/**
 * Lists referenced by several items, or by both an item and an enemy, whose real owner is fixed by
 * hand: an item id selects that item (the others are unused), "Enemy" selects the enemy contribution
 * rows. Lists absent from the map use every source.
 *
 * Dependency-free so scripts/check-item-lists.mjs can import it.
 */
export const ITEM_LIST_SOURCE_OVERRIDES = new Map<number, number | "Enemy">([
    [1096831250, 1753489769], // T6 Starbulb -> "Ambrosial Mashed Bulbs Output" (not the misspelled duplicate)
    [4220036, 3220037],       // Tier 4 Animal Output -> Fine Animal Output
    [6110016, 6220029],       // Tier 6 Baitfish Drop -> T6 Baitfish Output
    [6090001, 6220028],       // Tier 6 Fiber Drop -> T6 Fiber Output
    [6130004, 6220034],       // Tier 6 Flower Drop -> T6 Flower Output
    [6110017, 6220030],       // Tier 6 Lakefish Drop -> T6 Lakefish Output
    [6040001, 6220026],       // Tier 6 Rock Drop -> T6 Rock Output
    [6110019, 6220035],       // Tier 6 Seashell Drop -> T6 Seashell Output
    [1361142135, "Enemy"],    // Tier 3 Animal Output - SwiftCervusGold
    [1928461575, "Enemy"],    // Tier 3 Animal Output - SwiftCervusBronze
    [19845393, "Enemy"],      // Giant Skitch Gold Contribution
    [1953126603, "Enemy"],    // Giant Skitch Bronze Contribution
    [1814750683, "Enemy"],    // Giant Skitch Silver Contribution
    [1224355349, "Enemy"],    // Giant Skitch Low Contribution
]);
