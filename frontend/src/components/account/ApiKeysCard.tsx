/**
 * ApiKeysCard.tsx — the "API keys" card on `/account/profile`: the caller's keys, a create form, and
 * the one-time display of a new key's token.
 */
import {MAX_API_KEY_NAME_LENGTH} from "@brico/crafts/errors";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {createSignal, For, Show} from "solid-js";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {TextField, TextFieldInput, TextFieldLabel} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {createApiKeys} from "~/lib/account/api-keys";
import {dashboardUrl} from "~/lib/crafts/dashboard";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {useCopy} from "~/lib/utils.ts";

export function ApiKeysCard() {
    const {_} = useLingui();
    const {keys, create, remove} = createApiKeys();

    const [name, setName] = createSignal("");
    const [readPayouts, setReadPayouts] = createSignal(true);
    const [publicDashboard, setPublicDashboard] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    /** The key just created and its token; held only until dismissed, since the module never returns the token again. */
    const [created, setCreated] = createSignal<{token: string; dashboard: boolean} | null>(null);
    const [copyToken, tokenCopied] = useCopy(() => created()?.token ?? "");
    const [copyLink, linkCopied] = useCopy(() => dashboardUrl(created()?.token ?? ""));

    function reportError(e: unknown) {
        console.error(e);
        showToast({
            title: () => <Trans>Something went wrong</Trans>,
            description: () => describeServerError(e),
            variant: "error",
        });
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            const access = {readPayouts: readPayouts(), publicDashboard: publicDashboard()};
            setCreated({token: await create(name(), access), dashboard: access.publicDashboard});
            setName("");
        } catch (err) {
            reportError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>API keys</Trans></CardTitle>
                <CardDescription>
                    <Trans>Let scripts read your data over HTTP. Send a key as an Authorization: Bearer header.</Trans>
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-3">
                <Show when={created()}>
                    {key => (
                        <div class="flex flex-col gap-2 rounded-md border border-primary p-3">
                            <p class="text-sm font-medium"><Trans>Copy your new key now. It won't be shown again.</Trans></p>
                            <code class="break-all rounded bg-muted p-2 text-xs">{key().token}</code>
                            <Show when={key().dashboard}>
                                <p class="text-sm text-muted-foreground">
                                    <Trans>Anyone with this dashboard link can see your payees and bounties, including private ones.</Trans>
                                </p>
                                <code class="break-all rounded bg-muted p-2 text-xs">{dashboardUrl(key().token)}</code>
                            </Show>
                            <div class="flex gap-2">
                                <Button size="sm" onClick={copyToken}><Show when={tokenCopied()} fallback={<Trans>Copy</Trans>}><Trans>Copied!</Trans></Show></Button>
                                <Show when={key().dashboard}>
                                    <Button size="sm" variant="outline" onClick={copyLink}>
                                        <Show when={linkCopied()} fallback={<Trans>Copy dashboard link</Trans>}><Trans>Copied!</Trans></Show>
                                    </Button>
                                </Show>
                                <Button size="sm" variant="outline" onClick={() => setCreated(null)}><Trans>Done</Trans></Button>
                            </div>
                        </div>
                    )}
                </Show>

                <Show
                    when={keys().length > 0}
                    fallback={<p class="text-sm text-muted-foreground"><Trans>No API keys.</Trans></p>}
                >
                    <ul class="flex flex-col gap-2">
                        <For each={keys()}>
                            {key => (
                                <li class="flex items-center justify-between gap-3 rounded-md border p-3">
                                    <div class="min-w-0 flex flex-col gap-1">
                                        <p class="text-sm font-medium truncate">{key.name}</p>
                                        <div class="flex flex-wrap items-center gap-2">
                                            <Show when={key.readPayouts}><Badge variant="outline"><Trans>Read Payouts</Trans></Badge></Show>
                                            <Show when={key.publicDashboard}><Badge variant="outline"><Trans>Public Dashboard</Trans></Badge></Show>
                                            <span class="text-xs text-muted-foreground">{key.createdAt.toDate().toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => void remove(key.id).catch(reportError)}>
                                        <Trans>Delete</Trans>
                                    </Button>
                                </li>
                            )}
                        </For>
                    </ul>
                </Show>

                <form class="flex flex-col gap-3 border-t pt-3" onSubmit={e => void submit(e)}>
                    <TextField value={name()} onChange={setName}>
                        <TextFieldLabel><Trans>New key name</Trans></TextFieldLabel>
                        <TextFieldInput maxLength={MAX_API_KEY_NAME_LENGTH} placeholder={_(msg`e.g. Spreadsheet`)}/>
                    </TextField>
                    <Checkbox checked={readPayouts()} onChange={(checked: boolean) => {setReadPayouts(checked); if (checked) setPublicDashboard(false);}} label={<Trans>Read Payouts</Trans>}/>
                    <Checkbox checked={publicDashboard()} onChange={(checked: boolean) => {setPublicDashboard(checked); if (checked) setReadPayouts(false);}} label={<Trans>Public Dashboard</Trans>}/>
                    <Show when={publicDashboard()}>
                        <p class="text-sm text-muted-foreground">
                            <Trans>A dashboard key is meant to be shared. Anyone holding it can see your payees' names, what they've earned and been paid, and your bounties, including private ones.</Trans>
                        </p>
                    </Show>
                    <div>
                        <Button type="submit" disabled={busy() || name().trim() === "" || !(readPayouts() || publicDashboard())}>
                            <Trans>Create key</Trans>
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
