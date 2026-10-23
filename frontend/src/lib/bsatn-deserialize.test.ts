import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {AlgebraicType, BinaryReader, BinaryWriter, Timestamp} from "spacetimedb";

import {makeDeserializer} from "./bsatn-deserialize.ts";

const field = (name: string, algebraicType: AlgebraicType) => ({name, algebraicType});
const product = (...elements: ReturnType<typeof field>[]) => AlgebraicType.Product({elements});
const sum = (...variants: ReturnType<typeof field>[]) => AlgebraicType.Sum({variants});
const unit = product();

const rowType = product(
    field("id", AlgebraicType.I32),
    field("name", AlgebraicType.String),
    field("big", AlgebraicType.U64),
    field("ratio", AlgebraicType.F32),
    field("flag", AlgebraicType.Bool),
    field("blob", AlgebraicType.Array(AlgebraicType.U8)),
    field("maybe", sum(field("some", AlgebraicType.String), field("none", unit))),
    field("kind", sum(field("A", unit), field("B", AlgebraicType.I32), field("C", product(field("x", AlgebraicType.U8))))),
    field("at", product(field("__timestamp_micros_since_unix_epoch__", AlgebraicType.I64))),
    field("nested", AlgebraicType.Array(product(field("k", AlgebraicType.U16), field("tags", AlgebraicType.Array(AlgebraicType.String))))),
    field("empty", unit),
);

const rows = [
    {
        id: -7, name: "héllo", big: 2n ** 63n, ratio: 1.5, flag: true, blob: new Uint8Array([1, 2, 3]),
        maybe: "x", kind: {tag: "B", value: 42}, at: new Timestamp(1_700_000_000_000_000n),
        nested: [{k: 1, tags: ["a", "b"]}, {k: 2, tags: []}], empty: {},
    },
    {
        id: 0, name: "", big: 0n, ratio: 0, flag: false, blob: new Uint8Array(0),
        maybe: undefined, kind: {tag: "A", value: {}}, at: new Timestamp(0n),
        nested: [], empty: {},
    },
    {
        id: 2 ** 31 - 1, name: "z", big: 1n, ratio: -0.25, flag: false, blob: new Uint8Array([255]),
        maybe: undefined, kind: {tag: "C", value: {x: 9}}, at: new Timestamp(5n),
        nested: [{k: 65535, tags: ["only"]}], empty: {},
    },
];

describe("makeDeserializer", () => {
    it("decodes exactly what the SDK's deserializer decodes", () => {
        const tableType = AlgebraicType.Array(rowType);
        const writer = new BinaryWriter(256);
        AlgebraicType.makeSerializer(tableType)(writer, rows);
        const bytes = writer.getBuffer();

        const expected = AlgebraicType.makeDeserializer(tableType)(new BinaryReader(bytes));
        const actual = makeDeserializer(tableType)(new BinaryReader(bytes));

        assert.deepEqual(actual, rows);
        assert.deepEqual(actual, expected);
    });

    it("rejects out-of-range sum tags", () => {
        const type = sum(field("A", unit), field("B", unit));
        assert.throws(() => makeDeserializer(type)(new BinaryReader(new Uint8Array([2]))), /Invalid sum tag 2/);
    });

    it("rejects unresolved refs", () => {
        assert.throws(() => makeDeserializer(AlgebraicType.Ref(0)), /Ref/);
    });
});
