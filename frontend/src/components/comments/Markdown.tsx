import {createEffect, createMemo, createSignal, For} from "solid-js";
import {Portal} from "solid-js/web";
import {GameLink} from "~/components/comments/GameLink";
import {renderCommentMarkdown} from "~/lib/comments/markdown";
import {cn} from "~/lib/utils";

/**
 * A comment body. `renderCommentMarkdown` escapes raw HTML and restricts links, so its output is safe
 * for `innerHTML`. Its game-link placeholders are emptied and filled with `GameLink` components
 * through portals, which keeps them inside the app's router and reactive scope.
 */
export function Markdown(props: {source: string; class?: string}) {
    const [anchors, setAnchors] = createSignal<HTMLElement[]>([]);
    let root: HTMLDivElement | undefined;
    // A string memo: a replaced row with an unchanged body must not re-run the effect below, which would empty live portals.
    const html = createMemo(() => renderCommentMarkdown(props.source));

    // Runs after the `innerHTML` render effect, so the placeholders of the current source exist.
    createEffect(() => {
        html();
        const found = [...root!.querySelectorAll<HTMLElement>("span[data-game-link]")];
        for (const el of found) el.textContent = "";
        setAnchors(found);
    });

    return (
        <>
            <div
                ref={root}
                class={cn(
                    "wrap-break-word text-sm [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
                    "[&_ul_ul]:list-[circle] [&_ol_ul]:list-[circle] [&_ul_ul_ul]:list-[square] [&_ol_ul_ul]:list-[square] [&_ul_ol_ul]:list-[square] [&_ol_ol_ul]:list-[square]",
                    "[&_ol_ol]:list-[lower-alpha] [&_ul_ol]:list-[lower-alpha] [&_ol_ol_ol]:list-[lower-roman] [&_ul_ol_ol]:list-[lower-roman] [&_ol_ul_ol]:list-[lower-roman] [&_ul_ul_ol]:list-[lower-roman]",
                    "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
                    "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
                    "[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
                    "[&_a]:text-primary [&_a]:underline",
                    props.class,
                )}
                innerHTML={html()}
            />
            <For each={anchors()}>
                {el => (
                    <Portal mount={el} ref={container => { container.style.display = "contents"; }}>
                        <GameLink pageKey={el.dataset.gameLink!}/>
                    </Portal>
                )}
            </For>
        </>
    );
}
