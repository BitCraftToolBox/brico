/**
 * index.tsx — `/account`, a landing page linking to the six account-related tabbed pages. Also the
 * real target of the "Account" breadcrumb section (see `~/lib/game-links.tsx`'s
 * `breadcrumbSection`) — every other `/account/*` page's crumb already pointed here, so this used
 * to be a bare redirect to `/account/profile`; now it's somewhere worth landing.
 *
 * Laid out like `NavSections` (see `routes/database/index.tsx`) but not built on it: these pages
 * aren't registered in `~/lib/sidebar-items.ts` (none of them belong in the sidebar), so there's no
 * `SidebarGroupDef` to pull from — just a small fixed list of icon links per tab group.
 *
 * The sidebar's own account icon skips this page, linking straight to `/account/profile` (or
 * `/account/notifications` when there's an unread badge) — see `app-sidebar.tsx`.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import type {IconTypes} from "solid-icons";
import {
    TbOutlineBell as IconNotifications,
    TbOutlineGift as IconLoyaltyRewards,
    TbOutlineInfoCircle as IconBountyOverview,
    TbOutlineReceipt2 as IconPayeesOwed,
    TbOutlineSettings as IconSettings,
    TbOutlineTarget as IconBountyRules,
    TbOutlineUserCircle as IconProfile,
    TbOutlineWallet as IconPayouts,
} from "solid-icons/tb";
import {For, type JSX} from "solid-js";
import MainLayout from "~/components/MainLayout";

interface AccountLink {
    label: JSX.Element;
    href: string;
    icon: IconTypes;
}

interface AccountSection {
    title: JSX.Element;
    items: AccountLink[];
}

function sections(): AccountSection[] {
    return [
        {
            title: <Trans>Account</Trans>,
            items: [
                {label: <Trans>Profile</Trans>, href: "/account/profile", icon: IconProfile},
                {label: <Trans>Notifications</Trans>, href: "/account/notifications", icon: IconNotifications},
                {label: <Trans>Settings</Trans>, href: "/account/settings", icon: IconSettings},
            ],
        },
        {
            title: <Trans>Bounty payouts</Trans>,
            items: [
                {label: <Trans>Overview</Trans>, href: "/account/bounties", icon: IconBountyOverview},
                {label: <Trans>Bounty rules</Trans>, href: "/account/bounty-rules", icon: IconBountyRules},
                {label: <Trans>My payouts</Trans>, href: "/account/payouts", icon: IconPayouts},
                {label: <Trans>Payouts I owe</Trans>, href: "/account/payees", icon: IconPayeesOwed},
                {label: <Trans>Loyalty rewards</Trans>, href: "/account/loyalty", icon: IconLoyaltyRewards},
            ],
        },
    ];
}

export default function AccountHome() {
    const {_} = useLingui();
    return (
        <MainLayout title={_(msg`Account`)} hideSearch description="Manage your Brico's Toolbox account, notifications, and bounty payouts.">
            <div class="flex flex-col gap-8 max-w-4xl mx-auto w-full">
                <For each={sections()}>
                    {(section) => (
                        <section>
                            <h2 class="text-lg font-semibold mb-3 border-b pb-1">{section.title}</h2>
                            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                <For each={section.items}>
                                    {(item) => (
                                        <A
                                            href={item.href}
                                            class="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center hover:bg-accent/60 transition-colors"
                                        >
                                            {item.icon({class: "size-10 shrink-0"})}
                                            <span class="text-xs leading-tight line-clamp-2 w-full">{item.label}</span>
                                        </A>
                                    )}
                                </For>
                            </div>
                        </section>
                    )}
                </For>
            </div>
        </MainLayout>
    );
}
