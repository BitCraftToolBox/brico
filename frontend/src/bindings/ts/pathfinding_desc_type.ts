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
import { PathfindingTraversalOption as __PathfindingTraversalOption } from "./pathfinding_traversal_option_type";

export type PathfindingDesc = {
  id: number,
  canWalkOnLand: boolean,
  canSwim: boolean,
  requiresTransitions: boolean,
  minWaterDepth: number,
  maxWaterDepth: number,
  maxSwimHeightDelta: number,
  avoidLight: boolean,
  climbUpOptions: __PathfindingTraversalOption[],
  climbDownOptions: __PathfindingTraversalOption[],
};

/**
 * A namespace for generated helper functions.
 */
export namespace PathfindingDesc {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("id", AlgebraicType.createI32Type()),
      new ProductTypeElement("canWalkOnLand", AlgebraicType.createBoolType()),
      new ProductTypeElement("canSwim", AlgebraicType.createBoolType()),
      new ProductTypeElement("requiresTransitions", AlgebraicType.createBoolType()),
      new ProductTypeElement("minWaterDepth", AlgebraicType.createI32Type()),
      new ProductTypeElement("maxWaterDepth", AlgebraicType.createI32Type()),
      new ProductTypeElement("maxSwimHeightDelta", AlgebraicType.createI32Type()),
      new ProductTypeElement("avoidLight", AlgebraicType.createBoolType()),
      new ProductTypeElement("climbUpOptions", AlgebraicType.createArrayType(__PathfindingTraversalOption.getTypeScriptAlgebraicType())),
      new ProductTypeElement("climbDownOptions", AlgebraicType.createArrayType(__PathfindingTraversalOption.getTypeScriptAlgebraicType())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: PathfindingDesc): void {
    PathfindingDesc.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): PathfindingDesc {
    return PathfindingDesc.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


