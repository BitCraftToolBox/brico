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
import { EmpireState } from "./empire_state_type";
import { OffsetCoordinatesSmallMessage as __OffsetCoordinatesSmallMessage } from "./offset_coordinates_small_message_type";

import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `empire_state`.
 *
 * Obtain a handle from the [`empireState`] property on [`RemoteTables`],
 * like `ctx.db.empireState`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.empireState.on_insert(...)`.
 */
export class EmpireStateTableHandle {
  tableCache: TableCache<EmpireState>;

  constructor(tableCache: TableCache<EmpireState>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<EmpireState> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `entityId` unique index on the table `empire_state`,
   * which allows point queries on the field of the same name
   * via the [`EmpireStateEntityIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.empireState.entityId().find(...)`.
   *
   * Get a handle on the `entityId` unique index on the table `empire_state`.
   */
  entityId = {
    // Find the subscribed row whose `entityId` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): EmpireState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.entityId, col_val)) {
          return row;
        }
      }
    },
  };
  /**
   * Access to the `capitalBuildingEntityId` unique index on the table `empire_state`,
   * which allows point queries on the field of the same name
   * via the [`EmpireStateCapitalBuildingEntityIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.empireState.capitalBuildingEntityId().find(...)`.
   *
   * Get a handle on the `capitalBuildingEntityId` unique index on the table `empire_state`.
   */
  capitalBuildingEntityId = {
    // Find the subscribed row whose `capitalBuildingEntityId` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): EmpireState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.capitalBuildingEntityId, col_val)) {
          return row;
        }
      }
    },
  };
  /**
   * Access to the `name` unique index on the table `empire_state`,
   * which allows point queries on the field of the same name
   * via the [`EmpireStateNameUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.empireState.name().find(...)`.
   *
   * Get a handle on the `name` unique index on the table `empire_state`.
   */
  name = {
    // Find the subscribed row whose `name` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: string): EmpireState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.name, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: EmpireState) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: EmpireState) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: EmpireState) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: EmpireState) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: EmpireState, newRow: EmpireState) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: EmpireState, newRow: EmpireState) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
