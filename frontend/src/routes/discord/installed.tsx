/** `/discord/installed`, the static onboarding page `brico-bot`'s `/discord/install/callback` redirects to. */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {useSearchParams} from "@solidjs/router";
import {Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {useAccount} from "~/lib/account/state";

export default function DiscordInstalledPage() {
    const {_} = useLingui();
    const [searchParams] = useSearchParams();
    const {isLoggedIn, login} = useAccount();

    const error = () => {
        const raw = searchParams.error;
        return Array.isArray(raw) ? raw[0] : raw;
    };

    return (
        <MainLayout title={_(msg`Brico.app Discord Bot`)} hideSearch ownHeading noTitleSuffix>
            <div class="max-w-xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <Card>
                    <CardHeader>
                        <Show
                            when={!error()}
                            fallback={<>
                                <CardTitle class="text-destructive"><Trans>Couldn't add Brico</Trans></CardTitle>
                                <CardDescription>{error()}</CardDescription>
                            </>}
                        >
                            <CardTitle><Trans>Brico.app is now in your Discord server</Trans></CardTitle>
                            <CardDescription>
                                <Trans>A few commands to finish setting it up:</Trans>
                            </CardDescription>
                        </Show>
                    </CardHeader>
                    <Show when={!error()}>
                        <CardContent class="flex flex-col gap-4">
                            <div class="flex flex-col gap-1">
                                <p><Trans>Run <code>/link</code> in your server to connect your Brico.app account.</Trans></p>
                                <Show when={!isLoggedIn()}>
                                    <Button class="self-start" onClick={() => void login()}><Trans>Log in</Trans></Button>
                                </Show>
                            </div>
                            <p>
                                <Trans>
                                    An admin can run <code>/command-mode flat</code> or <code>/command-mode grouped</code> to
                                    choose how commands are organized (top-level, or grouped under <code>/brico</code>).
                                </Trans>
                            </p>
                            <p>
                                <Trans>Set up a live craft display with <code>/watch display</code>.</Trans>
                            </p>
                            <p>
                                <Trans>
                                    Get notified about matches with <code>/watch notify-link</code> then{" "}
                                    <code>/watch notify-setup</code>.
                                </Trans>
                            </p>
                        </CardContent>
                    </Show>
                </Card>
            </div>
        </MainLayout>
    );
}
