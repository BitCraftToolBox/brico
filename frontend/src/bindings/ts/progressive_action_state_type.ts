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
export type ProgressiveActionState = {
  entityId: bigint,
  buildingEntityId: bigint,
  functionType: number,
  progress: number,
  recipeId: number,
  craftCount: number,
  lastCritOutcome: number,
  ownerEntityId: bigint,
  lockExpiration: Timestamp,
  preparation: boolean,
};

/**
 * A namespace for generated helper functions.
 */
export namespace ProgressiveActionState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("entityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("buildingEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("functionType", AlgebraicType.createI32Type()),
      new ProductTypeElement("progress", AlgebraicType.createI32Type()),
      new ProductTypeElement("recipeId", AlgebraicType.createI32Type()),
      new ProductTypeElement("craftCount", AlgebraicType.createI32Type()),
      new ProductTypeElement("lastCritOutcome", AlgebraicType.createI32Type()),
      new ProductTypeElement("ownerEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("lockExpiration", AlgebraicType.createTimestampType()),
      new ProductTypeElement("preparation", AlgebraicType.createBoolType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: ProgressiveActionState): void {
    ProgressiveActionState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): ProgressiveActionState {
    return ProgressiveActionState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


