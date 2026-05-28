import {useColorMode} from "@kobalte/core";
import {type Component, createEffect, createSignal, on, onCleanup, onMount, Show} from "solid-js";
import {Portal} from "solid-js/web";
import type {CargoDesc} from "~/bindings/src/cargo_desc_type";
import type {ItemDesc} from "~/bindings/src/item_desc_type";
import type {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {CargoIcon, ItemIcon} from "~/components/shared/GameIcon";
import {getAssetURL, Tiers} from "~/lib/bitcraft-utils";
import {useSettings} from "~/lib/settings";
import {BitCraftTables} from "~/lib/spacetime";

const CHEST_ASSET = "GeneratedIcons/Other/Buildings/Storage/ChestSmallT4";
const KEY_ASSET = "GeneratedIcons/Cargo/Brico'sBigKey";
const CHEST_TIER = 4;

type LootResult =
    | { type: "item"; item: ItemDesc }
    | { type: "cargo"; cargo: CargoDesc };

function rollItemList(list: ItemListDesc): LootResult | null {
    if (!list.possibilities.length) return null;
    const itemIdx = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargoIdx = BitCraftTables.CargoDesc.indexedBy("id")();

    const total = list.possibilities.reduce((s, p) => s + p.probability, 0);
    let r = Math.random() * total;

    for (const poss of list.possibilities) {
        r -= poss.probability;
        if (r <= 0 && poss.items.length > 0) {
            const stack = poss.items[Math.floor(Math.random() * poss.items.length)];
            if (stack.itemType.tag === ItemType.Cargo.tag) {
                const cargo = cargoIdx?.get(stack.itemId);
                return cargo ? { type: "cargo", cargo } : null;
            }
            const item = itemIdx?.get(stack.itemId);
            return item ? { type: "item", item } : null;
        }
    }

    // Floating-point edge case: pick the last possibility
    const last = list.possibilities.at(-1);
    if (last?.items.length) {
        const stack = last.items[0];
        if (stack.itemType.tag === ItemType.Cargo.tag) {
            const cargo = cargoIdx?.get(stack.itemId);
            return cargo ? { type: "cargo", cargo } : null;
        }
        const item = itemIdx?.get(stack.itemId);
        return item ? { type: "item", item } : null;
    }
    return null;
}

type AnimPhase =
    | "idle"          // modal closed
    | "start"         // modal open; chest at original page position, no transition yet
    | "moving"        // chest sliding to screen center + scaling up
    | "shaking"       // chest shake animation plays
    | "key-in"        // key slides from off-left to center
    | "fading"        // chest + key fade out
    | "item-show"     // item icon fades in
    | "done";         // rolled (or original) item fully visible

export interface BricoLootBoxProps {
    loot: readonly [itemId: number, itemType: ItemType["tag"], itemListId: number | undefined][] | "hat";
}

function pickRandomHatId(): number | null {
    const all = BitCraftTables.EquipmentDesc.get();
    if (!all?.length) return null;
    const hats = all.filter((e) => e.slots.some((s) => s.tag === "HeadClothing"));
    if (!hats.length) return null;
    return hats[Math.floor(Math.random() * hats.length)].itemId;
}

export const BricoLootBox: Component<BricoLootBoxProps> = (props) => {
    const [phase, setPhase] = createSignal<AnimPhase>("idle");

    const [lootResult, setLootResult] = createSignal<LootResult | null>(null);
    const [showResult, setShowResult] = createSignal(false);
    const [resolvedItemId, setResolvedItemId] = createSignal<[number | null, ItemType["tag"] | null]>([null, null]);
    const [chestOrigin, setChestOrigin] = createSignal<DOMRect | null>(null);
    const [keyAtCenter, setKeyAtCenter] = createSignal(false);

    const { colorMode } = useColorMode();

    let anchorRef: HTMLDivElement | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const after = (ms: number, fn: () => void) => {
        timers.push(setTimeout(fn, ms));
    };

    const close = () => {
        while (timers.length) clearTimeout(timers.pop()!);
        setPhase("idle");
        setLootResult(null);
        setShowResult(false);
        setResolvedItemId([null, null]);
        setKeyAtCenter(false);
    };

    onCleanup(close);

    // Inject animation keyframes into <head> once
    onMount(() => {
        if (document.getElementById("brico-loot-box-keyframes")) return;
        const style = document.createElement("style");
        style.id = "brico-loot-box-keyframes";
        style.textContent = `
            @keyframes bricoChestShake {
                0%,  100% { transform: rotate(0deg)   scale(1); }
                12%        { transform: rotate(-12deg) scale(1.08); }
                28%        { transform: rotate(12deg)  scale(0.95); }
                44%        { transform: rotate(-10deg) scale(1.08); }
                60%        { transform: rotate(10deg)  scale(0.95); }
                76%        { transform: rotate(-6deg)  scale(1); }
                90%        { transform: rotate(6deg)   scale(1); }
            }
            @keyframes bricoFadeIn {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    });

    createEffect(on(phase, (p) => {
        if (p === "key-in") {
            setKeyAtCenter(false);
            // Wait two animation frames so the element mounts at left:-220px first,
            // then the style change triggers the CSS transition.
            requestAnimationFrame(() => requestAnimationFrame(() => setKeyAtCenter(true)));
        }
    }));

    const openLootBox = () => {
        if (phase() !== "idle") return;

        // Resolve target item + item list at click time
        let targetItemId: number | null;
        let targetItemType: "Item" | "Cargo" | null;
        let targetListId: number | undefined;

        if (props.loot === "hat") {
            targetItemId = pickRandomHatId();
            targetItemType = "Item";
            targetListId = undefined; // no rolling in hat mode
        } else {
            [targetItemId, targetItemType, targetListId] = props.loot[Math.floor(Math.random() * props.loot.length)];
        }

        if (targetItemId === null) return; // data not loaded yet

        setResolvedItemId([targetItemId, targetItemType]);

        if (targetListId) {
            const list = BitCraftTables.ItemListDesc.indexedBy("id")()?.get(targetListId);
            if (list) setLootResult(rollItemList(list));
        }

        setChestOrigin(anchorRef?.getBoundingClientRect() ?? null);
        setPhase("start");

        // Two rAFs: first ensures "start" renders at original pos (no transition),
        // second triggers "moving" so the CSS transition kicks in.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            setPhase("moving");

            after(600, () => {   // chest arrived at center
                setPhase("shaking");

                after(780, () => { // shake done
                    setPhase("key-in");

                    after(680, () => { // key arrived at center
                        setPhase("fading");

                        after(720, () => { // fade done
                            setPhase("item-show");

                            if (lootResult()) {
                                after(550, () => {
                                    // Trigger crossfade — both icons already rendered & cached.
                                    setShowResult(true);
                                    setPhase("done");
                                });
                            } else {
                                after(550, () => setPhase("done"));
                            }
                        });
                    });
                });
            });
        }));
    };

    const p = phase;
    const isOpen = () => p() !== "idle";
    const showChest = () => ["start", "moving", "shaking", "key-in", "fading"].includes(p());
    const showKey = () => ["key-in", "fading"].includes(p());
    const showItem = () => ["item-show", "done"].includes(p());

    const chestWrapperStyle = () => {
        const origin = chestOrigin();
        if (p() === "start" && origin) {
            // Sit exactly where the anchor is — no transition yet.
            return {
                left: `${origin.left + origin.width / 2}px`,
                top: `${origin.top + origin.height / 2}px`,
                transform: "translate(-50%, -50%) scale(1)",
                opacity: "1",
                transition: "none",
            } satisfies Record<string, string>;
        }
        // Center of screen, scaled up.
        const transition = p() === "moving"
            ? "left 0.55s cubic-bezier(0.34,1.56,0.64,1), top 0.55s cubic-bezier(0.34,1.56,0.64,1), transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease"
            : "opacity 0.7s ease";
        return {
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%) scale(2.5)",
            opacity: p() === "fading" ? "0" : "1",
            transition,
        } satisfies Record<string, string>;
    };

    const keyStyle = () => ({
        top: "50%",
        left: keyAtCenter() ? "50%" : "-220px",
        transform: keyAtCenter()
            ? "translate(-50%, -50%) scale(-1)"
            : "translateY(-50%) scale(-1)",
        transition: "left 0.55s cubic-bezier(0.34,1.56,0.64,1), transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.7s ease",
        opacity: p() === "fading" ? "0" : "1",
    } satisfies Record<string, string>);

    const frameSrc = () => {
        const theme = colorMode() === "dark" ? "dark" : "light";
        return `/assets/Frames/creaturebuildingresource-frame-common-${theme}.webp`;
    };

    const chestIconSrc = () => getAssetURL(CHEST_ASSET);
    const keyIconSrc = () => getAssetURL(KEY_ASSET);
    const baseItem: () => LootResult | null = () => {
        const [id, type] = resolvedItemId();
        if (id === null || type === null) return null;
        if (type === "Cargo") {
            const cargo = BitCraftTables.CargoDesc.indexedBy("id")().get(id);
            return cargo ? {type: "cargo", cargo} : null;
        } else {
            const item = BitCraftTables.ItemDesc.indexedBy("id")()?.get(id);
            return item ? {type: "item", item} : null;
        }
    };

    const ChestGraphic: Component = () => (
        <div class="relative w-[130px] h-[130px]">
            <img
                src={chestIconSrc()}
                alt=""
                class={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain w-[120px] h-[120px] ${Tiers.getBackgroundColorClass(CHEST_TIER)}`}
                onerror={(e) => ((e.target as HTMLImageElement).src = "/assets/Unknown.webp")}
            />
            <img src={frameSrc()} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-fill pointer-events-none" />
        </div>
    );

    return (
        <>
            <div
                ref={anchorRef}
                class="inline-block cursor-pointer select-none"
                title="Open Brico's Loot Box!"
                onClick={openLootBox}
            >
                <ChestGraphic />
            </div>

            <Show when={isOpen()}>
                <Portal>
                    <div
                        class="fixed inset-0 z-200 bg-black/50"
                        onClick={close}
                    />

                    <Show when={(!lootResult() || !showResult()) && (lootResult() || !showItem())}>
                        <div
                            class="fixed z-205 rounded-full"
                            style={{
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: "440px",
                                height: "440px",
                            }}
                        />
                    </Show>

                    <Show when={!showResult()}>
                        <div
                            aria-hidden="true"
                            style={{
                                position: "fixed",
                                left: "-9999px",
                                top: "-9999px",
                                "pointer-events": "none",
                            }}
                        >
                            <Show when={baseItem()}>
                                {(base) => {
                                    const r = base();
                                    return r.type === "item"
                                        ? <ItemIcon item={r.item} small={false} noInteract />
                                        : <CargoIcon cargo={r.cargo} small={false} noInteract />;
                                }}
                            </Show>
                            <Show when={lootResult()}>
                                {(result) => {
                                    const r = result();
                                    return r.type === "item"
                                        ? <ItemIcon item={r.item} small={false} noInteract />
                                        : <CargoIcon cargo={r.cargo} small={false} noInteract />;
                                }}
                            </Show>
                        </div>
                    </Show>

                    <Show when={showChest()}>
                        <div
                            class="fixed z-201 pointer-events-none"
                            style={chestWrapperStyle()}
                        >
                            <div
                                style={p() === "shaking"
                                    ? { animation: "bricoChestShake 0.78s ease-in-out" }
                                    : {}}
                            >
                                <ChestGraphic />
                            </div>
                        </div>
                    </Show>

                    <Show when={showKey()}>
                        <div
                            class="fixed z-202 pointer-events-none"
                            style={keyStyle()}
                        >
                            <img
                                src={keyIconSrc()}
                                alt=""
                                class="h-[130px] object-contain drop-shadow-xl"
                                onerror={(e) => ((e.target as HTMLImageElement).src = "/assets/Unknown.webp")}
                            />
                        </div>
                    </Show>

                    <Show when={showItem()}>
                        <div
                            class="fixed z-203"
                            style={{
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) scale(2)",
                            }}
                        >
                            <div style={{
                                opacity: showResult() ? "0" : "1",
                                transition: "opacity 1.35s ease",
                            }}>
                                <Show when={baseItem()}>
                                    {(base) => {
                                        const b = base();
                                        return b.type === "item"
                                            ? <ItemIcon item={b.item} small={false} noInteract={false}/>
                                            : <CargoIcon cargo={b.cargo} small={false} noInteract={false}/>
                                    }}
                                </Show>
                            </div>
                        </div>
                        <div
                            class="fixed z-204"
                            style={{
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) scale(2)",
                            }}
                        >
                            <Show when={showResult()}>
                                {(_) => {
                                    const r = lootResult();
                                    if (!r) return null;
                                    return (
                                        <div
                                            style={{ animation: "bricoFadeIn 1.35s ease forwards" }}
                                        >
                                            {r.type === "item"
                                                ? <ItemIcon item={r.item} small={false} noInteract={false}/>
                                                : <CargoIcon cargo={r.cargo} small={false} noInteract={false}/>}
                                        </div>
                                    );
                                }}
                            </Show>
                        </div>
                    </Show>
                </Portal>
            </Show>
        </>
    );
};

const loots = [
    [1086855799, "Item", 350062593], // party cracker
    [2139638761, "Cargo", 680933968], // coralith
    // mythic t6 hit
    [1622627516, "Item", 1314539293],
    [181836937, "Item", 1382641800],
    [1842291395, "Item", 1805096279],
    [728775056, "Item", 1961805011],
    [2131376186, "Item", 301762718],
    [344316277, "Item", 1937464382],
    [543901453, "Item", 1727211074],
    [324749347, "Item", 419624005],
    [1621360975, "Item", 47017052],
    [703977568, "Item", 1951110683],
    [734826989, "Item", 985942955],
    [654478483, "Item", 671064082],
    // pets
    [732153593, "Item", 443433079],
    [1737177184, "Item", 1652088973],
    [148829439, "Item", 480652210],
    [393519126, "Item", 250724294],
    [65289865, "Item", 1311143196]
] as [number, ItemType["tag"], number | undefined][];

export const lootTab = () => {
    const { tf2Mode, r9Mode } = useSettings();
    return {
        id: 'brico-loot',
        label: r9Mode() ? "Jamba" : "Loot",
        content: () => {
            const loot = tf2Mode() ? "hat" : loots;
            return (
                <div class="flex w-full justify-center">
                    <BricoLootBox loot={loot}/>
                </div>
            );
        }
    }
};