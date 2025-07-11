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
import { SurfaceType as __SurfaceType } from "./surface_type_type";
import { SkillType as __SkillType } from "./skill_type_type";
import { BuffCategory as __BuffCategory } from "./buff_category_type";
import { ProgressiveActionStatus as __ProgressiveActionStatus } from "./progressive_action_status_type";
import { ChatChannel as __ChatChannel } from "./chat_channel_type";
import { Permission as __Permission } from "./permission_type";
import { PermissionGroup as __PermissionGroup } from "./permission_group_type";

export type TheGreatPlaceHolderTable = {
  placeholderId: bigint,
  placeholderSkillType: __SkillType,
  placeholderBuffCategory: __BuffCategory,
  placeholder: __ProgressiveActionStatus,
  placeholderWaterBodyType: __SurfaceType,
  chatChannel: __ChatChannel,
  permission: __Permission,
  permissionGroup: __PermissionGroup,
};

/**
 * A namespace for generated helper functions.
 */
export namespace TheGreatPlaceHolderTable {
  /**
  * A function which returns this type represented as an AlgebraicType.
  * This function is derived from the AlgebraicType used to generate this type.
  */
  export function getTypeScriptAlgebraicType(): AlgebraicType {
    return AlgebraicType.createProductType([
      new ProductTypeElement("placeholderId", AlgebraicType.createU64Type()),
      new ProductTypeElement("placeholderSkillType", __SkillType.getTypeScriptAlgebraicType()),
      new ProductTypeElement("placeholderBuffCategory", __BuffCategory.getTypeScriptAlgebraicType()),
      new ProductTypeElement("placeholder", __ProgressiveActionStatus.getTypeScriptAlgebraicType()),
      new ProductTypeElement("placeholderWaterBodyType", __SurfaceType.getTypeScriptAlgebraicType()),
      new ProductTypeElement("chatChannel", __ChatChannel.getTypeScriptAlgebraicType()),
      new ProductTypeElement("permission", __Permission.getTypeScriptAlgebraicType()),
      new ProductTypeElement("permissionGroup", __PermissionGroup.getTypeScriptAlgebraicType()),
    ]);
  }

  export function serialize(writer: BinaryWriter, value: TheGreatPlaceHolderTable): void {
    TheGreatPlaceHolderTable.getTypeScriptAlgebraicType().serialize(writer, value);
  }

  export function deserialize(reader: BinaryReader): TheGreatPlaceHolderTable {
    return TheGreatPlaceHolderTable.getTypeScriptAlgebraicType().deserialize(reader);
  }

}


