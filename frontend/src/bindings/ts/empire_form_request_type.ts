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
export type EmpireFormRequest = {
  buildingEntityId: bigint,
  empireName: string,
  iconId: number,
  shapeId: number,
  color1Id: number,
  color2Id: number,
};

/**
 * A namespace for generated helper functions.
 */
export namespace EmpireFormRequest {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("buildingEntityId", AlgebraicType.createU64Type()),
      new ProductTypeElement("empireName", AlgebraicType.createStringType()),
      new ProductTypeElement("iconId", AlgebraicType.createI32Type()),
      new ProductTypeElement("shapeId", AlgebraicType.createI32Type()),
      new ProductTypeElement("color1Id", AlgebraicType.createI32Type()),
      new ProductTypeElement("color2Id", AlgebraicType.createI32Type()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: EmpireFormRequest): void {
    EmpireFormRequest.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): EmpireFormRequest {
    return EmpireFormRequest.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


