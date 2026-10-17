/**
 * load.ts — reads a static BitCraft game-data table straight off disk.
 */
import {readFile} from "node:fs/promises";
import path from "node:path";
import {AlgebraicType, BinaryReader} from "spacetimedb";

/**
 * Deserializes one `<name>.bsatn` file (an array of `itemType`) from `dir`.
 *
 * Mirrors `frontend/src/lib/bitcraft-data.ts`'s `fetchBSATNFrom`, but without the fetch.
 */
export async function loadGameDataTable<T>(dir: string, name: string, itemType: AlgebraicType): Promise<T[]> {
    const filePath = path.join(dir, `${name}.bsatn`);
    const buffer = await readFile(filePath);
    const reader = new BinaryReader(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    return AlgebraicType.makeDeserializer(AlgebraicType.Array(itemType))(reader) as T[];
}
