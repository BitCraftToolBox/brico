import {MAP_DATA_CDN_BASE} from "~/lib/constants";

export interface HeatmapPoint {
    x: number;
    y: number;
    intensity: number;
}

function isHeatmapPoint(value: unknown): value is HeatmapPoint {
    const p = value as Partial<HeatmapPoint> | null;
    return !!p && typeof p === "object"
        && typeof p.x === "number" && typeof p.y === "number" && typeof p.intensity === "number";
}

/** Fetches and validates a heatmap point array from the map data CDN. Resolves to [] on any failure. */
export async function fetchHeatmapPoints(path: string): Promise<HeatmapPoint[]> {
    try {
        const response = await fetch(`${MAP_DATA_CDN_BASE}${path}`);
        if (!response.ok) return [];
        const json = await response.json();
        return Array.isArray(json) ? json.filter(isHeatmapPoint) : [];
    } catch (error) {
        console.log("Error fetching heatmap data:", error);
        return [];
    }
}

export function resourceHeatmapPath(resourceId: number): string {
    return `/heatmaps/resources/${resourceId}.json`;
}

export function herdHeatmapPath(enemyType: number): string {
    return `/heatmaps/herds/${enemyType}.json`;
}
