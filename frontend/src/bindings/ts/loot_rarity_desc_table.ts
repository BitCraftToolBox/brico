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
import { LootRarityDesc } from "./loot_rarity_desc_type";
import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `loot_rarity_desc`.
 *
 * Obtain a handle from the [`lootRarityDesc`] property on [`RemoteTables`],
 * like `ctx.db.lootRarityDesc`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.lootRarityDesc.on_insert(...)`.
 */
export class LootRarityDescTableHandle {
  tableCache: TableCache<LootRarityDesc>;

  constructor(tableCache: TableCache<LootRarityDesc>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<LootRarityDesc> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `id` unique index on the table `loot_rarity_desc`,
   * which allows point queries on the field of the same name
   * via the [`LootRarityDescIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.lootRarityDesc.id().find(...)`.
   *
   * Get a handle on the `id` unique index on the table `loot_rarity_desc`.
   */
  id = {
    // Find the subscribed row whose `id` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: number): LootRarityDesc | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.id, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: LootRarityDesc) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: LootRarityDesc) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: LootRarityDesc) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: LootRarityDesc) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: LootRarityDesc, newRow: LootRarityDesc) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: LootRarityDesc, newRow: LootRarityDesc) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
