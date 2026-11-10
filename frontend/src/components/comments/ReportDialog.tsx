import {MAX_REPORT_NOTE_LENGTH} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {createSignal, For, Show} from "solid-js";
import {Button} from "~/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TextField, TextFieldTextArea} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {type ModerationActions, REPORT_REASONS, type ReportInput} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";

/** Reason and optional note for reporting one comment. */
export function ReportDialog(props: {commentId: bigint; open: boolean; onClose: () => void; actions: ModerationActions}) {
    const {_} = useLingui();
    const [reason, setReason] = createSignal<ReportInput["reason"]>("Spam");
    const [note, setNote] = createSignal("");
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await props.actions.report({id: props.commentId, reason: reason(), note: note().trim() || undefined});
            showToast({title: () => _(msg`Report sent`), variant: "success"});
            setNote("");
            props.onClose();
        } catch (e) {
            setError(describeServerError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={props.open} onOpenChange={open => { if (!open) props.onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle><Trans>Report comment</Trans></DialogTitle>
                    <DialogDescription><Trans>Moderators will review it.</Trans></DialogDescription>
                </DialogHeader>
                <select
                    class="h-9 rounded-md border bg-background px-2 text-sm"
                    value={reason()}
                    onChange={e => setReason(e.currentTarget.value as ReportInput["reason"])}
                >
                    <For each={REPORT_REASONS}>{r => <option value={r.tag}>{_(r.label)}</option>}</For>
                </select>
                <TextField value={note()} onChange={setNote}>
                    <TextFieldTextArea rows={3} maxLength={MAX_REPORT_NOTE_LENGTH} placeholder={_(msg`Note (optional)`)}/>
                </TextField>
                <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
                <DialogFooter>
                    <Button variant="outline" onClick={props.onClose}><Trans>Cancel</Trans></Button>
                    <Button disabled={busy()} onClick={() => void submit()}><Trans>Report</Trans></Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
