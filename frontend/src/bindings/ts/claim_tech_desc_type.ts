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
import { ItemStack as __ItemStack } from "./item_stack_type";

export type ClaimTechDesc = {
  id: number,
  description: string,
  tier: number,
  suppliesCost: number,
  researchTime: number,
  requirements: number[],
  input: __ItemStack[],
  members: number,
  area: number,
  supplies: number,
  xpToMintHexCoin: number,
};

/**
 * A namespace for generated helper functions.
 */
export namespace ClaimTechDesc {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("id", AlgebraicType.createI32Type()),
      new ProductTypeElement("description", AlgebraicType.createStringType()),
      new ProductTypeElement("tier", AlgebraicType.createI32Type()),
      new ProductTypeElement("suppliesCost", AlgebraicType.createI32Type()),
      new ProductTypeElement("researchTime", AlgebraicType.createI32Type()),
      new ProductTypeElement("requirements", AlgebraicType.createArrayType(AlgebraicType.createI32Type())),
      new ProductTypeElement("input", AlgebraicType.createArrayType(__ItemStack.getTypeScriptAlgebraicType())),
      new ProductTypeElement("members", AlgebraicType.createI32Type()),
      new ProductTypeElement("area", AlgebraicType.createI32Type()),
      new ProductTypeElement("supplies", AlgebraicType.createI32Type()),
      new ProductTypeElement("xpToMintHexCoin", AlgebraicType.createU32Type()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: ClaimTechDesc): void {
    ClaimTechDesc.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): ClaimTechDesc {
    return ClaimTechDesc.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


