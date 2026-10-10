import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {TbOutlineExternalLink as IconExternal} from "solid-icons/tb";
import MainLayout from "~/components/MainLayout.tsx";
import RouteTabHeader from "~/components/shared/RouteTabHeader.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {bountyTabs} from "~/lib/account/route-tabs.tsx";
import {CurrencyLabel} from "~/lib/crafts/filter-condition.tsx";
import {breadcrumb} from "~/lib/game-links.tsx";

const CraftBrowserLink = () => (
    <A href="/tools/crafts/browse" class="underline hover:text-foreground"><Trans>Craft Browser</Trans></A>
);

const ProfileLink = () => (
    <A href="/account/profile" class="underline hover:text-foreground"><Trans>profile</Trans></A>
);

const SteloLink = () => (
    <a href="https://stelo.finance/" target="_blank" class="underline hover:text-foreground">
        Stelo <IconExternal class="inline size-4"/>
    </a>
);

export default function BountyOverviewPage() {
    const {_} = useLingui();
    return (
        <MainLayout
            title={_(msg`Bounties`)}
            hideSearch
            ownHeading
            description="Assign bounties to your crafts and get paid for contributing."
            navTitle={breadcrumb("/account", msg`Bounties`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader title={<Trans>Craft Bounties</Trans>} tabs={bountyTabs()}/>

                <Card>
                    <CardHeader>
                        <CardTitle class="text-xl"><Trans>What are bounties?</Trans></CardTitle>
                        <CardDescription class="text-base">
                            <Trans>
                                A bounty rewards players for contributing to crafts. Everyone who helps earns a share
                                in proportion to their effort.
                            </Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-3 text-base text-muted-foreground">
                        <p><Trans>Bounties can be paid in two main ways:</Trans></p>
                        <ul class="list-disc space-y-2 pl-5">
                            <li>
                                <Trans>
                                    <strong><CurrencyLabel currency={"hex-coin"}/></strong> is a trust-based ledger. The site tracks what's owed, but the owner
                                    pays in-game and records it. Only work for owners you trust.
                                </Trans>
                            </li>
                            <li>
                                <Trans>
                                    <strong><CurrencyLabel currency={"stelo-hex-coin"}/></strong> is placed into escrow via <SteloLink/>. The owner's funds are locked
                                    up front and paid out automatically, so you don't need to trust them.
                                </Trans>
                            </li>
                        </ul>
                        <p>
                            <Trans>
                                Browse crafts with bounties, compare rates and set up notifications in the <CraftBrowserLink/>.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle class="text-xl"><Trans>For contributors</Trans></CardTitle>
                        <CardDescription class="text-base">
                            <Trans>Get paid for helping with other players' crafts.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-3 text-base text-muted-foreground">
                        <p>
                            <Trans>
                                Find crafts with a bounty in the <CraftBrowserLink/> and contribute as usual. There's nothing
                                to sign up for; your share is tracked automatically.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                <em>My payouts</em> shows what you've earned and what has been paid.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                For Stelo Hex Coin, link a wallet on your <ProfileLink/> to receive payouts. They are sent in
                                batches about once a day. <strong>If you have no wallet linked, payouts are converted to the
                                trust-backed Hex Coin ledger after a few days.</strong> Brico.app no longer guarantees payouts
                                after this rollover. Link a wallet before work on escrow-backed crafts pays out to avoid this.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                Hex Coin bounties are an honor system: the owner still has to pay you in-game, so only
                                work for owners you trust.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle class="text-xl"><Trans>For craft owners</Trans></CardTitle>
                        <CardDescription class="text-base">
                            <Trans>Reward players who help you finish crafts.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-3 text-base text-muted-foreground">
                        <p>
                            <Trans>
                                You can add bounties to crafts you started or that sit in a claim you own:
                            </Trans>
                        </p>
                        <ul class="list-disc space-y-2 pl-5">
                            <li>
                                <Trans>
                                    <strong>One at a time:</strong> open the craft in the <CraftBrowserLink/> and set a bounty
                                    on its page.
                                </Trans>
                            </li>
                            <li>
                                <Trans>
                                    <strong>Automatically:</strong> create filters on the <em>Bounty rules</em> tab. New matching
                                    crafts get a bounty as soon as they appear, and the highest-priority matching rule wins.
                                    Rules only apply to crafts without a bounty; edit a single craft directly to change it.
                                </Trans>
                            </li>
                        </ul>
                        <p>
                            <Trans>
                                <strong>Paying with Stelo:</strong> link a wallet on your <ProfileLink/> and pick it
                                as the funding wallet on each rule or craft. The funds for the craft's remaining effort are
                                held in escrow before the bounty starts. If you lower or remove the bounty, or the craft
                                ends, whatever is unspent is refunded to that wallet.
                                The <em>My bounties</em> tab shows each craft's funding status, and you can enable alerts
                                for funding problems in your account settings.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                Bounties can be private: rates hidden from other players but totals still shown in payouts.
                                The <em>Loyalty rewards</em> tab allows adding a bonus for specific players. For Stelo currencies,
                                the bonus isn't placed in escrow, but pulled from your wallet when paying out. If that fails you'll
                                be alerted and it's retried at the next payout.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                <em>Payouts I owe</em> shows what you owe each contributor. For Hex Coin, record each payment
                                there once you've paid in-game. Stelo payments are made and recorded automatically.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
