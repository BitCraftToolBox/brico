/**
 * link.tsx — `/account/link?code=...`, the landing page for the Discord `/link` slash command's
 * bot-initiated flow. `brico-bot` has already filled in the Discord side of the pending
 * `integration_link_request` (via
 * `beginIntegrationLinkForExternal`); this page's only job is to fill in `accountIdentity` for a
 * logged-in visitor, prompting login first if needed.
 *
 * If login is needed, the code survives the SpacetimeAuth redirect round trip via
 * `sessionStorage` — see `lib/account/links.tsx`'s `PENDING_LINK_CODE_KEY` doc comment and
 * `callback.tsx`, which returns here (instead of the usual `/account`) once login completes.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useSearchParams} from "@solidjs/router";
import {createSignal, onMount, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {PENDING_LINK_CODE_KEY, useLinkedIntegrations} from "~/lib/account/links";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";

type Status = "claiming" | "need-login" | "success" | "error";

export default function AccountLinkPage() {
    const {_} = useLingui();
    const [searchParams] = useSearchParams();
    const {isLoggedIn, login} = useAccount();
    const {claimLink} = useLinkedIntegrations();

    const code = () => {
        const raw = searchParams.code;
        return (Array.isArray(raw) ? raw[0] : raw) ?? "";
    };

    const [status, setStatus] = createSignal<Status>("claiming");
    const [error, setError] = createSignal("");

    onMount(async () => {
        if (!code()) {
            setStatus("error");
            setError(_(msg`Missing link code.`));
            return;
        }
        if (!isLoggedIn()) {
            setStatus("need-login");
            return;
        }
        try {
            await claimLink(code());
            setStatus("success");
        } catch (e) {
            setStatus("error");
            setError(describeServerError(e));
        }
    });

    function loginThenClaim() {
        sessionStorage.setItem(PENDING_LINK_CODE_KEY, code());
        void login();
    }

    return (
        <MainLayout title={_(msg`Link account`)} hideSearch ownHeading noTitleSuffix>
            <div class="max-w-xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <Card>
                    <CardHeader>
                        <Show when={status() === "claiming"}>
                            <CardTitle><Trans>Linking…</Trans></CardTitle>
                        </Show>
                        <Show when={status() === "need-login"}>
                            <CardTitle><Trans>Log in to finish linking</Trans></CardTitle>
                            <CardDescription>
                                <Trans>Log in to your Brico's Toolbox account to finish linking Discord.</Trans>
                            </CardDescription>
                        </Show>
                        <Show when={status() === "success"}>
                            <CardTitle><Trans>Discord linked</Trans></CardTitle>
                            <CardDescription><Trans>Your Discord account is now linked.</Trans></CardDescription>
                        </Show>
                        <Show when={status() === "error"}>
                            <CardTitle class="text-destructive"><Trans>Linking failed</Trans></CardTitle>
                            <CardDescription>{error()}</CardDescription>
                        </Show>
                    </CardHeader>
                    <CardContent>
                        <Show when={status() === "need-login"}>
                            <Button onClick={loginThenClaim}><Trans>Log in</Trans></Button>
                        </Show>
                        <Show when={status() === "success" || status() === "error"}>
                            <Button as={A} href="/account" variant="outline"><Trans>Back to account</Trans></Button>
                        </Show>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
