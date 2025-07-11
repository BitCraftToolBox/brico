// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

// This was generated using spacetimedb cli version 1.2.0 (commit dev).

/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
import {
  AlgebraicType,
  AlgebraicValue,
  BinaryReader,
  BinaryWriter,
  ConnectionId,
  DbConnectionBuilder,
  DbConnectionImpl,
  Identity,
  ProductType,
  ProductTypeElement,
  SubscriptionBuilderImpl,
  SumType,
  SumTypeVariant,
  TableCache,
  TimeDuration,
  Timestamp,
  deepEqual,
  type CallReducerFlags,
  type DbContext,
  type ErrorContextInterface,
  type Event,
  type EventContextInterface,
  type ReducerEventContextInterface,
  type SubscriptionEventContextInterface,
} from "@clockworklabs/spacetimedb-sdk";
// A namespace for generated variants and helper functions.
export namespace PlayerActionResult {
  // These are the generated variant types for each variant of the tagged union.
  // One type is generated per variant and will be used in the `value` field of
  // the tagged union.
  export type Success = { tag: "Success" };
  export type TimingFail = { tag: "TimingFail" };
  export type Fail = { tag: "Fail" };
  export type Cancel = { tag: "Cancel" };

  // Helper functions for constructing each variant of the tagged union.
  // ```
  // const foo = Foo.A(42);
  // assert!(foo.tag === "A");
  // assert!(foo.value === 42);
  // ```
  export const Success = { tag: "Success" };
  export const TimingFail = { tag: "TimingFail" };
  export const Fail = { tag: "Fail" };
  export const Cancel = { tag: "Cancel" };

  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createSumType([
      new SumTypeVariant("Success", AlgebraicType.createProductType([])),
      new SumTypeVariant("TimingFail", AlgebraicType.createProductType([])),
      new SumTypeVariant("Fail", AlgebraicType.createProductType([])),
      new SumTypeVariant("Cancel", AlgebraicType.createProductType([])),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: PlayerActionResult): void {
      PlayerActionResult.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): PlayerActionResult {
      return PlayerActionResult.getTypeScriptAlgebraicType().deserialize(reader);
  }

}

// The tagged union or sum type for the algebraic type `PlayerActionResult`.
export type PlayerActionResult = PlayerActionResult.Success | PlayerActionResult.TimingFail | PlayerActionResult.Fail | PlayerActionResult.Cancel;

export default PlayerActionResult;

