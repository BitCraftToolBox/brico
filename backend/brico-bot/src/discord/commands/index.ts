/**
 * index.ts — every registered command leaf; command registration and interaction dispatch both
 * read this array.
 */
import {commandModeCommand} from "./admin.ts";
import {clearCommand} from "./clear.ts";
import {linkCommand} from "./link.ts";
import {watchNotifyLinkCommand, watchNotifySetupCommand, watchNotifyUnlinkCommand} from "./notify.ts";
import type {LeafCommand} from "./registry.ts";
import {watchDisplayLimitCommand, watchDisplayStickyCommand} from "./watch-display-options.ts";
import {watchDisplayCommand, watchDisplayRemoveCommand} from "./watch.ts";

export const commands: LeafCommand[] = [
    linkCommand,
    commandModeCommand,
    clearCommand,
    watchDisplayCommand,
    watchDisplayLimitCommand,
    watchDisplayStickyCommand,
    watchDisplayRemoveCommand,
    watchNotifyLinkCommand,
    watchNotifyUnlinkCommand,
    watchNotifySetupCommand,
];
