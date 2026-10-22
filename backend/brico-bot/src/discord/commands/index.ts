/**
 * index.ts — every registered command leaf; command registration and interaction dispatch both
 * read this array.
 */
import {commandModeCommand} from "./admin.ts";
import {clearCommand} from "./clear.ts";
import {fundingNotifySetupCommand} from "./funding.ts";
import {linkCommand} from "./link.ts";
import {craftsNotifySetupCommand, notifyLinkCommand, notifyUnlinkCommand} from "./notify.ts";
import {payRecordCommand, paySteloCommand} from "./pay.ts";
import type {LeafCommand} from "./registry.ts";
import {craftsDisplayLimitCommand, craftsDisplayStickyCommand} from "./watch-display-options.ts";
import {craftsDisplayCommand, craftsDisplayRemoveCommand} from "./watch.ts";

export const commands: LeafCommand[] = [
    linkCommand,
    commandModeCommand,
    clearCommand,
    notifyLinkCommand,
    notifyUnlinkCommand,
    craftsDisplayCommand,
    craftsDisplayLimitCommand,
    craftsDisplayStickyCommand,
    craftsDisplayRemoveCommand,
    craftsNotifySetupCommand,
    fundingNotifySetupCommand,
    payRecordCommand,
    paySteloCommand,
];
