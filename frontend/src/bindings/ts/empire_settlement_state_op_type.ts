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
import { EmpireSettlementState as __EmpireSettlementState } from "./empire_settlement_state_type";

// A namespace for generated variants and helper functions.
export namespace EmpireSettlementStateOp {
  // These are the generated variant types for each variant of the tagged union.
  // One type is generated per variant and will be used in the `value` field of
  // the tagged union.
  export type Insert = { tag: "Insert", value: __EmpireSettlementState };
  export type Delete = { tag: "Delete", value: __EmpireSettlementState };

  // Helper functions for constructing each variant of the tagged union.
  // ```
  // const foo = Foo.A(42);
  // assert!(foo.tag === "A");
  // assert!(foo.value === 42);
  // ```
  export const Insert = (value: __EmpireSettlementState): EmpireSettlementStateOp => ({ tag: "Insert", value });
  export const Delete = (value: __EmpireSettlementState): EmpireSettlementStateOp => ({ tag: "Delete", value });

  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createSumType([
      new SumTypeVariant("Insert", __EmpireSettlementState.getTypeScriptAlgebraicType()),
      new SumTypeVariant("Delete", __EmpireSettlementState.getTypeScriptAlgebraicType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: EmpireSettlementStateOp): void {
      EmpireSettlementStateOp.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): EmpireSettlementStateOp {
      return EmpireSettlementStateOp.getTypeScriptAlgebraicType().deserialize(reader);
  }

}

// The tagged union or sum type for the algebraic type `EmpireSettlementStateOp`.
export type EmpireSettlementStateOp = EmpireSettlementStateOp.Insert | EmpireSettlementStateOp.Delete;

export default EmpireSettlementStateOp;

