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
import { Pocket as __Pocket } from "./pocket_type";

export type InventoryState = {
  entityId: bigint,
  pockets: __Pocket[],
  inventoryIndex: number,
  cargoIndex: number,
  ownerEntityId: bigint,
  playerOwnerEntityId: bigint,
};

/**
 * A namespace for generated helper functions.
 */
export namespace InventoryState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("entityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("pockets", AlgebraicType.createArrayType(__Pocket.getTypeScriptAlgebraicType())),
      new ProductTypeElement("inventoryIndex", AlgebraicType.createI32Type()),
      new ProductTypeElement("cargoIndex", AlgebraicType.createI32Type()),
      new ProductTypeElement("ownerEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("playerOwnerEntityId", AlgebraicType.createU64Type()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: InventoryState): void {
    InventoryState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): InventoryState {
    return InventoryState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


