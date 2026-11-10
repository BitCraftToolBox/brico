/** ToolbarButton.tsx — a ghost icon button with a tooltip, for the comment action rows. */
import type {IconTypes} from "solid-icons";
import {Button} from "~/components/ui/button";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";

export function ToolbarButton(props: {icon: IconTypes; label: string; onClick: () => void; active?: boolean}) {
    return (
        <Tooltip>
            <TooltipTrigger
                as={Button}
                type="button"
                variant="ghost"
                size="icon"
                class="size-7"
                aria-label={props.label}
                aria-pressed={props.active}
                onClick={props.onClick}
            >
                <props.icon class="size-4"/>
            </TooltipTrigger>
            <TooltipContent>{props.label}</TooltipContent>
        </Tooltip>
    );
}
