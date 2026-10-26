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
import {describeServerError} from "~/lib/crafts/error-vocab";
import {useCopy} from "~/lib/utils.ts";

export function ApiKeysCard() {
    const {_} = useLingui();
    const {keys, create, remove} = createApiKeys();

    const [name, setName] = createSignal("");
    const [readPayouts, setReadPayouts] = createSignal(true);
    const [busy, setBusy] = createSignal(false);
    /** The token of the key just created; held only until dismissed, since the module never returns it again. */
    const [newToken, setNewToken] = createSignal<string | null>(null);
    const [copyToken, tokenCopied] = useCopy(() => newToken() ?? "");

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
            setNewToken(await create(name(), {readPayouts: readPayouts()}));
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
                <Show when={newToken()}>
                    {token => (
                        <div class="flex flex-col gap-2 rounded-md border border-primary p-3">
                            <p class="text-sm font-medium"><Trans>Copy your new key now. It won't be shown again.</Trans></p>
                            <code class="break-all rounded bg-muted p-2 text-xs">{token()}</code>
                            <div class="flex gap-2">
                                <Button size="sm" onClick={copyToken}><Show when={tokenCopied()} fallback={<Trans>Copy</Trans>}><Trans>Copied!</Trans></Show></Button>
                                <Button size="sm" variant="outline" onClick={() => setNewToken(null)}><Trans>Done</Trans></Button>
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
                    <Checkbox checked={readPayouts()} onChange={(checked: boolean) => setReadPayouts(checked)} label={<Trans>Read Payouts</Trans>}/>
                    <div>
                        <Button type="submit" disabled={busy() || name().trim() === "" || !readPayouts()}>
                            <Trans>Create key</Trans>
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
