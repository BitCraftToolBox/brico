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
import { PlayerHousingState } from "./player_housing_state_type";
import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `player_housing_state`.
 *
 * Obtain a handle from the [`playerHousingState`] property on [`RemoteTables`],
 * like `ctx.db.playerHousingState`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.playerHousingState.on_insert(...)`.
 */
export class PlayerHousingStateTableHandle {
  tableCache: TableCache<PlayerHousingState>;

  constructor(tableCache: TableCache<PlayerHousingState>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<PlayerHousingState> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `entityId` unique index on the table `player_housing_state`,
   * which allows point queries on the field of the same name
   * via the [`PlayerHousingStateEntityIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.playerHousingState.entityId().find(...)`.
   *
   * Get a handle on the `entityId` unique index on the table `player_housing_state`.
   */
  entityId = {
    // Find the subscribed row whose `entityId` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): PlayerHousingState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.entityId, col_val)) {
          return row;
        }
      }
    },
  };
  /**
   * Access to the `networkEntityId` unique index on the table `player_housing_state`,
   * which allows point queries on the field of the same name
   * via the [`PlayerHousingStateNetworkEntityIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.playerHousingState.networkEntityId().find(...)`.
   *
   * Get a handle on the `networkEntityId` unique index on the table `player_housing_state`.
   */
  networkEntityId = {
    // Find the subscribed row whose `networkEntityId` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): PlayerHousingState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.networkEntityId, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: PlayerHousingState) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: PlayerHousingState) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: PlayerHousingState) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: PlayerHousingState) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: PlayerHousingState, newRow: PlayerHousingState) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: PlayerHousingState, newRow: PlayerHousingState) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
