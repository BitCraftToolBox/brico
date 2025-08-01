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
import { ParametersPlayerMoveDesc } from "./parameters_player_move_desc_type";
import { MovementSpeed as __MovementSpeed } from "./movement_speed_type";

import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `parameters_player_move_desc`.
 *
 * Obtain a handle from the [`parametersPlayerMoveDesc`] property on [`RemoteTables`],
 * like `ctx.db.parametersPlayerMoveDesc`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.parametersPlayerMoveDesc.on_insert(...)`.
 */
export class ParametersPlayerMoveDescTableHandle {
  tableCache: TableCache<ParametersPlayerMoveDesc>;

  constructor(tableCache: TableCache<ParametersPlayerMoveDesc>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<ParametersPlayerMoveDesc> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `version` unique index on the table `parameters_player_move_desc`,
   * which allows point queries on the field of the same name
   * via the [`ParametersPlayerMoveDescVersionUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.parametersPlayerMoveDesc.version().find(...)`.
   *
   * Get a handle on the `version` unique index on the table `parameters_player_move_desc`.
   */
  version = {
    // Find the subscribed row whose `version` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: number): ParametersPlayerMoveDesc | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.version, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: ParametersPlayerMoveDesc, newRow: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: ParametersPlayerMoveDesc, newRow: ParametersPlayerMoveDesc) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
