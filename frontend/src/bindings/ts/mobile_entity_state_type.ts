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
export type MobileEntityState = {
  entityId: bigint,
  chunkIndex: bigint,
  timestamp: bigint,
  locationX: number,
  locationZ: number,
  destinationX: number,
  destinationZ: number,
  dimension: number,
  isRunning: boolean,
  pad1: number,
  pad2: number,
  pad3: number,
};

/**
 * A namespace for generated helper functions.
 */
export namespace MobileEntityState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("entityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("chunkIndex", AlgebraicType.createU64Type()),
      new ProductTypeElement("timestamp", AlgebraicType.createU64Type()),
      new ProductTypeElement("locationX", AlgebraicType.createI32Type()),
      new ProductTypeElement("locationZ", AlgebraicType.createI32Type()),
      new ProductTypeElement("destinationX", AlgebraicType.createI32Type()),
      new ProductTypeElement("destinationZ", AlgebraicType.createI32Type()),
      new ProductTypeElement("dimension", AlgebraicType.createU32Type()),
      new ProductTypeElement("isRunning", AlgebraicType.createBoolType()),
      new ProductTypeElement("pad1", AlgebraicType.createU8Type()),
      new ProductTypeElement("pad2", AlgebraicType.createU8Type()),
      new ProductTypeElement("pad3", AlgebraicType.createU8Type()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: MobileEntityState): void {
    MobileEntityState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): MobileEntityState {
    return MobileEntityState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


