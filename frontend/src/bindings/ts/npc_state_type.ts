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
import { NpcType as __NpcType } from "./npc_type_type";

export type NpcState = {
  entityId: bigint,
  npcType: __NpcType,
  direction: number,
  buildingEntityId: bigint,
  nextActionTimestamp: Timestamp,
  moveDuration: number,
  startedMoving: bigint,
  previousBuildings: bigint[],
  traveling: boolean,
};

/**
 * A namespace for generated helper functions.
 */
export namespace NpcState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("entityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("npcType", __NpcType.getTypeScriptAlgebraicType()),
      new ProductTypeElement("direction", AlgebraicType.createI32Type()),
      new ProductTypeElement("buildingEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("nextActionTimestamp", AlgebraicType.createTimestampType()),
      new ProductTypeElement("moveDuration", AlgebraicType.createF32Type()),
      new ProductTypeElement("startedMoving", AlgebraicType.createU64Type()),
      new ProductTypeElement("previousBuildings", AlgebraicType.createArrayType(AlgebraicType.createU64Type())),
      new ProductTypeElement("traveling", AlgebraicType.createBoolType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: NpcState): void {
    NpcState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): NpcState {
    return NpcState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


