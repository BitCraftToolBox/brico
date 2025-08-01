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
export type HerdState = {
  entityId: bigint,
  enemyAiParamsDescId: number,
  currentPopulation: number,
  ignoreEagerness: boolean,
  populationVariance: number[],
};

/**
 * A namespace for generated helper functions.
 */
export namespace HerdState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("entityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("enemyAiParamsDescId", AlgebraicType.createI32Type()),
      new ProductTypeElement("currentPopulation", AlgebraicType.createI32Type()),
      new ProductTypeElement("ignoreEagerness", AlgebraicType.createBoolType()),
      new ProductTypeElement("populationVariance", AlgebraicType.createArrayType(AlgebraicType.createF32Type())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: HerdState): void {
    HerdState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): HerdState {
    return HerdState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


