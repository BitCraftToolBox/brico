import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useNavigate} from "@solidjs/router";
import {createSignal, onMount, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {PENDING_LINK_CODE_KEY} from "~/lib/account/links";
import * as oidc from "~/lib/account/oidc";
import {useAccount} from "~/lib/account/state";

/**
 * The SpacetimeAuth redirect target. By the time SpacetimeAuth redirects back here, the app has
 * already booted fresh (an external-origin redirect is a real page load, unavoidably) — but from
 * here on this is a normal mounted SPA, so completing the exchange only needs `AccountProvider`'s
 * `refresh()` (to pick up the session `handleCallback` just stored) followed by a client-side
 * `navigate`, not a second full reload that would also re-run every other data fetch the app does
 * on load.
 */
export default function AccountCallback() {
    const {_} = useLingui();
    const [error, setError] = createSignal<string | null>(null);
    const {refresh} = useAccount();
    const navigate = useNavigate();

    onMount(async () => {
        try {
            await oidc.handleCallback();
            await refresh();
            // If login was kicked off from `/account/link` (the Discord `/link` bot-initiated
            // flow needing a login first), return there with the code restored instead of the
            // usual plain `/account` — see `lib/account/links.tsx`'s doc comment on this key.
            const pendingCode = sessionStorage.getItem(PENDING_LINK_CODE_KEY);
            if (pendingCode) {
                sessionStorage.removeItem(PENDING_LINK_CODE_KEY);
                navigate(`/account/link?code=${encodeURIComponent(pendingCode)}`, {replace: true});
            } else {
                navigate("/account/profile", {replace: true});
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    });

    return (
        <MainLayout title={_(msg`Signing in`)} hideSearch ownHeading noTitleSuffix>
            <div class="max-w-xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <Show
                    when={error()}
                    fallback={<p class="text-muted-foreground"><Trans>Signing you in…</Trans></p>}
                >
                    {(message) => (
                        <>
                            <p class="text-destructive"><Trans>Sign-in failed: {message()}</Trans></p>
                            <A href="/account/profile" class="underline"><Trans>Back to account</Trans></A>
                        </>
                    )}
                </Show>
            </div>
        </MainLayout>
    );
}
