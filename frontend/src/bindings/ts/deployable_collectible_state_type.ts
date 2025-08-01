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
import { OffsetCoordinatesSmallMessage as __OffsetCoordinatesSmallMessage } from "./offset_coordinates_small_message_type";

export type DeployableCollectibleState = {
  deployableEntityId: bigint,
  ownerEntityId: bigint,
  collectibleId: number,
  deployableDescId: number,
  location: __OffsetCoordinatesSmallMessage | undefined,
};

/**
 * A namespace for generated helper functions.
 */
export namespace DeployableCollectibleState {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("deployableEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("ownerEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("collectibleId", AlgebraicType.createI32Type()),
      new ProductTypeElement("deployableDescId", AlgebraicType.createI32Type()),
      new ProductTypeElement("location", AlgebraicType.createOptionType(__OffsetCoordinatesSmallMessage.getTypeScriptAlgebraicType())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: DeployableCollectibleState): void {
    DeployableCollectibleState.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): DeployableCollectibleState {
    return DeployableCollectibleState.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


