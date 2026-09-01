import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {TbOutlineExternalLink as IconExternal} from "solid-icons/tb";
import MainLayout from "~/components/MainLayout.tsx";
import RouteTabHeader from "~/components/shared/RouteTabHeader.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {bountyTabs} from "~/lib/account/route-tabs.tsx";
import {breadcrumb} from "~/lib/game-links.tsx";

const CraftBrowserLink = () => (
    <A href="/tools/crafts/browse" class="underline hover:text-foreground"><Trans>Craft Browser</Trans></A>
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
                <RouteTabHeader title={<Trans>Bounty payouts</Trans>} tabs={bountyTabs()}/>

                <Card>
                    <CardHeader>
                        <CardTitle><Trans>What are bounties?</Trans></CardTitle>
                        <CardDescription>
                            <Trans>
                                Bounties let craft owners reward other players for helping finish their crafts. An owner attaches a
                                bounty to a craft — a rate of currency per unit of effort — and every player who contributes to that
                                craft earns a share automatically, in proportion to how much effort they actually put in. Someone who
                                does twice the work earns twice the payout.
                            </Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-2 text-sm text-muted-foreground">
                        <p>
                            <Trans>
                                Today, bounties are paid in Hex Coin. This is a <strong>trust-based ledger</strong>, not an
                                automatic in-game transfer: the site keeps track of what's earned, but the actual
                                Hex Coin still has to change hands in-game. Only work on bounties from owners you trust to
                                pay you, and only mark a bounty as paid once you've actually sent the currency.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                Trust-less bounties, where payment is held in escrow and guaranteed automatically, are coming soon via
                                {" "}<a href="https://stelo.finance/" target="_blank" class="underline">Stelo <IconExternal class="inline size-3.5"/></a>.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                You can browse every craft that currently has a bounty attached, see the offered rates, and even get notifications in the <CraftBrowserLink/>.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle><Trans>For craft owners</Trans></CardTitle>
                        <CardDescription>
                            <Trans>Reward players who help you finish crafts.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-2 text-sm text-muted-foreground">
                        <p>
                            <Trans>
                                You can only attach bounties to crafts you started yourself, or crafts sitting in a claim you own.
                                There are two ways to do it:
                            </Trans>
                        </p>
                        <ul class="list-disc space-y-1 pl-5">
                            <li>
                                <Trans>
                                    <strong>One at a time:</strong> find the craft in the <CraftBrowserLink/>, open it, and add a
                                    bounty directly from the craft's page.
                                </Trans>
                            </li>
                            <li>
                                <Trans>
                                    <strong>Automatically, with rules:</strong> on the <em>Bounty rules</em> tab, set up filters
                                    (by claim, item, skill/tier, and more) and every new craft that matches gets a bounty
                                    assigned the moment it appears, with no manual work on your part. If more than one rule matches a
                                    craft, the highest-priority rule wins. You can reorder your rules to control which one takes
                                    precedence.
                                </Trans>
                            </li>
                        </ul>
                        <p>
                            <Trans>
                                You can also mark bounties as private. These won't be visible to anyone else browsing crafts, but
                                they'll still be calculated and the payouts will show in the totals for both you and the crafter.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                Want to reward a specific player a bit extra — a trusted regular, a claim officer, and so on?
                                The <em>Loyalty rewards</em> tab lets you set a payout multiplier for individual payees, on top of
                                whatever their bounty already pays.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                The <em>Payouts I owe</em> tab shows a running total of what you owe each contributor. Once you've
                                paid someone in-game, record it there so the ledger stays accurate.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle><Trans>For contributors</Trans></CardTitle>
                        <CardDescription>
                            <Trans>Get paid for helping with other players' crafts.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-2 text-sm text-muted-foreground">
                        <p>
                            <Trans>
                                Browse the <CraftBrowserLink/> and look for crafts with a bounty attached. Just contribute effort to
                                the craft as normal — there's nothing extra to sign up for. Your share of the bounty is tracked
                                automatically as you go, based on how much effort you've put in relative to the craft's total.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                The <em>My payouts</em> tab shows what you've earned from every owner you've contributed to, and how
                                much of that has actually been paid out.
                            </Trans>
                        </p>
                        <p>
                            <Trans>
                                Remember that today's bounties are an honor system: the ledger tracks what you're owed, but the
                                owner still has to trade you Hex Coin in-game. Only put in real effort on bounties from
                                owners you trust to follow through.
                            </Trans>
                        </p>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
