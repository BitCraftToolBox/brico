import {type AlgebraicType, BinaryReader, ConnectionId, Identity, TimeDuration, Timestamp, Uuid} from "spacetimedb";

type Deserializer = (reader: BinaryReader) => any;

const SPECIAL_PRODUCTS: Record<string, Deserializer> = {
    __time_duration_micros__: r => new TimeDuration(r.readI64()),
    __timestamp_micros_since_unix_epoch__: r => new Timestamp(r.readI64()),
    __identity__: r => new Identity(r.readU256()),
    __connection_id__: r => new ConnectionId(r.readU128()),
    __uuid__: r => new Uuid(r.readU128()),
};

const PRIMITIVES: Record<string, Deserializer> = {
    String: r => r.readString(),
    Bool: r => r.readBool(),
    I8: r => r.readI8(),
    U8: r => r.readU8(),
    I16: r => r.readI16(),
    U16: r => r.readU16(),
    I32: r => r.readI32(),
    U32: r => r.readU32(),
    I64: r => r.readI64(),
    U64: r => r.readU64(),
    I128: r => r.readI128(),
    U128: r => r.readU128(),
    I256: r => r.readI256(),
    U256: r => r.readU256(),
    F32: r => r.readF32(),
    F64: r => r.readF64(),
};

/**
 * Drop-in for the SDK's `AlgebraicType.makeDeserializer` that composes closures instead of
 * generating code with `Function(...)`, which Cloudflare Workers disallow. Output is
 * identical to the SDK's. `Ref` types are unsupported: the type must be fully inlined.
 */
export function makeDeserializer(ty: AlgebraicType): Deserializer {
    switch (ty.tag) {
        case "Product": {
            const elements = ty.value.elements;
            if (elements.length === 0) return () => ({});
            if (elements.length === 1 && Object.hasOwn(SPECIAL_PRODUCTS, elements[0].name!)) {
                return SPECIAL_PRODUCTS[elements[0].name!];
            }
            const names = elements.map(e => e.name!);
            const fields = elements.map(e => makeDeserializer(e.algebraicType));
            return reader => {
                const row: Record<string, any> = {};
                for (let i = 0; i < names.length; i++) row[names[i]] = fields[i](reader);
                return row;
            };
        }
        case "Sum": {
            const variants = ty.value.variants;
            if (variants.length === 2 && variants[0].name === "some" && variants[1].name === "none") {
                const some = makeDeserializer(variants[0].algebraicType);
                return reader => {
                    const tag = reader.readU8();
                    if (tag === 0) return some(reader);
                    if (tag === 1) return undefined;
                    throw new Error(`Invalid option tag ${tag}`);
                };
            }
            if (variants.length === 2 && variants[0].name === "ok" && variants[1].name === "err") {
                const ok = makeDeserializer(variants[0].algebraicType);
                const err = makeDeserializer(variants[1].algebraicType);
                return reader => {
                    const tag = reader.readU8();
                    if (tag === 0) return {ok: ok(reader)};
                    if (tag === 1) return {err: err(reader)};
                    throw new Error(`Invalid result tag ${tag}`);
                };
            }
            const names = variants.map(v => v.name!);
            const payloads = variants.map(v => makeDeserializer(v.algebraicType));
            return reader => {
                const tag = reader.readU8();
                if (tag >= names.length) throw new Error(`Invalid sum tag ${tag}`);
                return {tag: names[tag], value: payloads[tag](reader)};
            };
        }
        case "Array": {
            if (ty.value.tag === "U8") return reader => reader.readUInt8Array();
            const element = makeDeserializer(ty.value);
            return reader => {
                const length = reader.readU32();
                const out = new Array(length);
                for (let i = 0; i < length; i++) out[i] = element(reader);
                return out;
            };
        }
        case "Ref":
            throw new Error("Cannot deserialize Ref types without a typespace");
        default:
            return PRIMITIVES[ty.tag];
    }
}
