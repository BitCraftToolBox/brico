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
export type EmpireRankDesc = {
  rank: number,
  title: string,
  maxCount: number | undefined,
  permissions: boolean[],
};

/**
 * A namespace for generated helper functions.
 */
export namespace EmpireRankDesc {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("rank", AlgebraicType.createI32Type()),
      new ProductTypeElement("title", AlgebraicType.createStringType()),
      new ProductTypeElement("maxCount", AlgebraicType.createOptionType(AlgebraicType.createI32Type())),
      new ProductTypeElement("permissions", AlgebraicType.createArrayType(AlgebraicType.createBoolType())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: EmpireRankDesc): void {
    EmpireRankDesc.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): EmpireRankDesc {
    return EmpireRankDesc.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


