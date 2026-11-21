/**
 * StockConfigDialog.tsx — export a claim's stock settings as JSON, or import a shared file.
 */
import {exportStockConfig, parseStockConfig, type StockConfig} from "@brico/trades/stock-config";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineClipboardCheck as IconClipboardCheck, TbOutlineCopy as IconCopy, TbOutlineDownload as IconDownload, TbOutlineUpload as IconUpload} from "solid-icons/tb";
import {createSignal, Show} from "solid-js";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TextField, TextFieldTextArea} from "~/components/ui/text-field";
import {downloadTextFile, useCopy} from "~/lib/utils";

export function StockConfigDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: StockConfig;
    claimName: string;
    onImport: (config: StockConfig) => void;
}) {
    const {_} = useLingui();
    const json = () => exportStockConfig(props.config);
    const [copy, copied] = useCopy(json);
    const [text, setText] = createSignal("");
    const [error, setError] = createSignal<string | null>(null);
    const [pending, setPending] = createSignal<StockConfig | null>(null);
    let fileInput: HTMLInputElement | undefined;

    const read = (raw: string) => {
        setPending(null);
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            setError(_(msg`Not valid JSON.`));
            return;
        }
        const config = parseStockConfig(parsed);
        if (!config) {
            setError(_(msg`Not a valid stock settings file.`));
            return;
        }
        setError(null);
        setPending(config);
    };
    const apply = () => {
        const config = pending();
        if (!config) return;
        // Shop ids only mean something within their claim, so the import is filed under this page's claim.
        props.onImport({...config, claimEntityId: props.config.claimEntityId});
        setPending(null);
        setText("");
        props.onOpenChange(false);
    };
    const onFileChange = (e: Event) => {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file) file.text().then(read);
    };

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent class="max-w-2xl">
                <DialogHeader>
                    <DialogTitle><Trans>Import / export stock settings</Trans></DialogTitle>
                    <DialogDescription>
                        <Trans>Share these with the claim's other managers. Settings are stored in this browser only.</Trans>
                    </DialogDescription>
                </DialogHeader>

                <div class="space-y-2">
                    <h3 class="text-sm font-medium"><Trans>Export</Trans></h3>
                    <div class="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copy}>
                            <Show when={copied()} fallback={<IconCopy class="mr-1 size-4"/>}><IconClipboardCheck class="mr-1 size-4"/></Show>
                            <Trans>Copy JSON</Trans>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadTextFile(`stock-${props.claimName || props.config.claimEntityId}.json`, json())}>
                            <IconDownload class="mr-1 size-4"/><Trans>Download</Trans>
                        </Button>
                    </div>
                </div>

                <div class="space-y-2">
                    <h3 class="text-sm font-medium"><Trans>Import</Trans></h3>
                    <TextField value={text()} onChange={setText}>
                        <TextFieldTextArea class="h-24 font-mono text-xs" placeholder={_(msg`Paste exported stock settings`)}/>
                    </TextField>
                    <div class="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" disabled={!text().trim()} onClick={() => read(text())}><Trans>Check</Trans></Button>
                        <Button variant="outline" size="sm" onClick={() => fileInput?.click()}>
                            <IconUpload class="mr-1 size-4"/><Trans>Upload file</Trans>
                        </Button>
                        <input ref={fileInput} type="file" accept="application/json" class="hidden" onChange={onFileChange}/>
                    </div>
                    <Show when={error()}>{message => <p class="text-sm text-error">{message()}</p>}</Show>
                    <Show when={pending()}>
                        {config => (
                            <div class="space-y-2 rounded-md border p-3 text-sm">
                                <p>
                                    <Trans>
                                        {config().links.length} stall links and {Object.keys(config().overrides).length} item settings.
                                        Importing replaces this claim's current settings.
                                    </Trans>
                                </p>
                                <Show when={config().claimEntityId !== props.config.claimEntityId}>
                                    <p class="text-warning-foreground"><Trans>This file was exported for a different claim.</Trans></p>
                                </Show>
                                <Button size="sm" onClick={apply}><Trans>Replace settings</Trans></Button>
                            </div>
                        )}
                    </Show>
                </div>
            </DialogContent>
        </Dialog>
    );
}
