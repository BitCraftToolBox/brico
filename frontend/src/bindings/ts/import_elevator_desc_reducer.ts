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

import { ElevatorDesc as __ElevatorDesc } from "./elevator_desc_type";

export type ImportElevatorDesc = {
  records: __ElevatorDesc[],
};

/**
 * A namespace for generated helper functions.
 */
export namespace ImportElevatorDesc {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("records", AlgebraicType.createArrayType(__ElevatorDesc.getTypeScriptAlgebraicType())),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: ImportElevatorDesc): void {
    ImportElevatorDesc.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): ImportElevatorDesc {
    return ImportElevatorDesc.getTypeScriptAlgebraicType().deserialize(reader);
  }

}

