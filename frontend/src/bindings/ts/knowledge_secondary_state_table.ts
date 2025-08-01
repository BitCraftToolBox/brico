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
import { KnowledgeSecondaryState } from "./knowledge_secondary_state_type";
import { KnowledgeEntry as __KnowledgeEntry } from "./knowledge_entry_type";

import { type EventContext, type Reducer, RemoteReducers, RemoteTables } from ".";

/**
 * Table handle for the table `knowledge_secondary_state`.
 *
 * Obtain a handle from the [`knowledgeSecondaryState`] property on [`RemoteTables`],
 * like `ctx.db.knowledgeSecondaryState`.
 *
 * Users are encouraged not to explicitly reference this type,
 * but to directly chain method calls,
 * like `ctx.db.knowledgeSecondaryState.on_insert(...)`.
 */
export class KnowledgeSecondaryStateTableHandle {
  tableCache: TableCache<KnowledgeSecondaryState>;

  constructor(tableCache: TableCache<KnowledgeSecondaryState>) {
    this.tableCache = tableCache;
  }

  count(): number {
    return this.tableCache.count();
  }

  iter(): Iterable<KnowledgeSecondaryState> {
    return this.tableCache.iter();
  }
  /**
   * Access to the `entityId` unique index on the table `knowledge_secondary_state`,
   * which allows point queries on the field of the same name
   * via the [`KnowledgeSecondaryStateEntityIdUnique.find`] method.
   *
   * Users are encouraged not to explicitly reference this type,
   * but to directly chain method calls,
   * like `ctx.db.knowledgeSecondaryState.entityId().find(...)`.
   *
   * Get a handle on the `entityId` unique index on the table `knowledge_secondary_state`.
   */
  entityId = {
    // Find the subscribed row whose `entityId` column value is equal to `col_val`,
    // if such a row is present in the client cache.
    find: (col_val: bigint): KnowledgeSecondaryState | undefined => {
      for (let row of this.tableCache.iter()) {
        if (deepEqual(row.entityId, col_val)) {
          return row;
        }
      }
    },
  };

  onInsert = (cb: (ctx: EventContext, row: KnowledgeSecondaryState) => void) => {
    return this.tableCache.onInsert(cb);
  }

  removeOnInsert = (cb: (ctx: EventContext, row: KnowledgeSecondaryState) => void) => {
    return this.tableCache.removeOnInsert(cb);
  }

  onDelete = (cb: (ctx: EventContext, row: KnowledgeSecondaryState) => void) => {
    return this.tableCache.onDelete(cb);
  }

  removeOnDelete = (cb: (ctx: EventContext, row: KnowledgeSecondaryState) => void) => {
    return this.tableCache.removeOnDelete(cb);
  }

  // Updates are only defined for tables with primary keys.
  onUpdate = (cb: (ctx: EventContext, oldRow: KnowledgeSecondaryState, newRow: KnowledgeSecondaryState) => void) => {
    return this.tableCache.onUpdate(cb);
  }

  removeOnUpdate = (cb: (ctx: EventContext, onRow: KnowledgeSecondaryState, newRow: KnowledgeSecondaryState) => void) => {
    return this.tableCache.removeOnUpdate(cb);
  }}
