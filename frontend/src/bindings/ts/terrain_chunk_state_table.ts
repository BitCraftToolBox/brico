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
import { TerrainChunkState } from "./terrain_chunk_state_type";
import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `terrain_chunk_state`.
 *
 * Obtain a handle from the [`terrainChunkState`] property on [`RemoteTables`],
 * like `ctx.db.terrainChunkState`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.terrainChunkState.on_insert(...)`.
 */
export class TerrainChunkStateTableHandle {
  tableCache: TableCache<TerrainChunkState>;

  constructor(tableCache: TableCache<TerrainChunkState>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<TerrainChunkState> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `chunkIndex` unique index on the table `terrain_chunk_state`,
   * which allows point queries on the field of the same name
   * via the [`TerrainChunkStateChunkIndexUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.terrainChunkState.chunkIndex().find(...)`.
   *
   * Get a handle on the `chunkIndex` unique index on the table `terrain_chunk_state`.
   */
  chunkIndex = {
    // Find the subscribed row whose `chunkIndex` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): TerrainChunkState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.chunkIndex, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: TerrainChunkState) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: TerrainChunkState) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: TerrainChunkState) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: TerrainChunkState) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: TerrainChunkState, newRow: TerrainChunkState) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: TerrainChunkState, newRow: TerrainChunkState) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
