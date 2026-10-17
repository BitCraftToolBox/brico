/**
 * The tab lists shared by the two "tabs as pages" groups under `/account` — kept as functions
 * (called from inside each page's render), not module-level constants, since the JSX labels they
 * build are real DOM-backed elements: reusing one across the several independent page mounts that
 * reference the same group would move rather than recreate its underlying nodes.
 */
import {Trans} from "@lingui/solid/macro";
import type {RouteTab} from "~/components/shared/RouteTabHeader";

export function accountTabs(): RouteTab[] {
    return [
        {label: <Trans>Profile</Trans>, href: "/account/profile"},
        {label: <Trans>Notifications</Trans>, href: "/account/notifications"},
        {label: <Trans>Settings</Trans>, href: "/account/settings"},
    ];
}

export function bountyTabs(): RouteTab[] {
    return [
        {label: <Trans>Overview</Trans>, href: "/account/bounties"},
        {label: <Trans>Bounty rules</Trans>, href: "/account/bounty-rules"},
        {label: <Trans>My payouts</Trans>, href: "/account/payouts"},
        {label: <Trans>Payouts I owe</Trans>, href: "/account/payees"},
        {label: <Trans>Loyalty rewards</Trans>, href: "/account/loyalty"},
    ];
}
