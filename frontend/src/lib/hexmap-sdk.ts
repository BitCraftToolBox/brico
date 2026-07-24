import {MAP_EMBED_SERVER} from "~/lib/constants";

export interface HexMapHeatmapPoint {
    x: number;
    y: number;
    intensity: number;
}

export interface HexMapInstance {
    createLayer(id: string, options?: { label?: string; visible?: boolean; opacity?: number }): HexMapInstance;
    clearLayers(): HexMapInstance;
    addHeatmap(options: { layer: string; id?: string; points: HexMapHeatmapPoint[]; color?: number; radius?: number }): HexMapInstance;
    flyTo(x: number, y: number, options?: { zoom?: number; duration?: number }): HexMapInstance;
    fitBounds(x1: number, y1: number, x2: number, y2: number, options?: { padding?: number }): HexMapInstance;
    whenReady(): Promise<HexMapInstance>;
    destroy(): void;
}

interface HexMapStatic {
    create(container: HTMLElement, options: {
        server: string;
        theme?: "dark" | "light";
        showMinimap?: boolean;
        showControls?: boolean;
        builtinPacks?: string[] | "all" | "none";
    }): HexMapInstance;
}

declare global {
    interface Window {
        HexMap: {
            HexMap?: HexMapStatic;
        }
    }
}

let sdkPromise: Promise<HexMapStatic> | undefined;

/** Loads the HexMap embed SDK script once (cached across calls) and resolves with the global. */
export function loadHexMapSdk(): Promise<HexMapStatic> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("HexMap SDK can only be loaded in the browser"));
    }
    if (window.HexMap?.HexMap) return Promise.resolve(window.HexMap.HexMap);
    if (!sdkPromise) {
        sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `${MAP_EMBED_SERVER}/sdk.js`;
            script.async = true;
            script.onload = () => window.HexMap?.HexMap ? resolve(window.HexMap.HexMap) : reject(new Error("HexMap SDK failed to initialize"));
            script.onerror = () => reject(new Error("Failed to load HexMap SDK script"));
            document.head.appendChild(script);
        });
    }
    return sdkPromise;
}

export function hexColorToNumber(hex: string): number {
    return parseInt(hex.replace("#", ""), 16);
}
