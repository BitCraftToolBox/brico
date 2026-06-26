import type {PolymorphicProps} from "@kobalte/core/polymorphic"
import * as TooltipPrimitive from "@kobalte/core/tooltip"
import {callHandler} from "@kobalte/utils"
import type {ValidComponent} from "solid-js"
import {createContext, createMemo, createSignal, type JSX, onCleanup, splitProps, useContext} from "solid-js"

import {cn} from "~/lib/utils"

type TooltipTouchContextValue = {
    touchOpenEnabled: () => boolean
    openFromTouch: () => void
}

const TooltipTouchContext = createContext<TooltipTouchContextValue>()
let activeTouchTooltipCloser: (() => void) | undefined

type TooltipProps = TooltipPrimitive.TooltipRootProps & {
    openOnTouchStart?: boolean
}

const Tooltip = (props: TooltipProps) => {
    const [local, others] = splitProps(props, [
        "open",
        "defaultOpen",
        "onOpenChange",
        "disabled",
        "openOnTouchStart"
    ])
    const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen ?? false)
    const [ignoreNextClose, setIgnoreNextClose] = createSignal(false)
    const isControlled = createMemo(() => local.open !== undefined)

    const applyOpenChange = (isOpen: boolean) => {
        if (!isControlled()) {
            setInternalOpen(isOpen)
        }
        local.onOpenChange?.(isOpen)
    }

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen && ignoreNextClose()) {
            setIgnoreNextClose(false)
            return
        }
        if (!isOpen && activeTouchTooltipCloser === closeFromTouchActivation) {
            activeTouchTooltipCloser = undefined
        }
        applyOpenChange(isOpen)
    }

    const closeFromTouchActivation = () => {
        setIgnoreNextClose(false)
        applyOpenChange(false)
    }

    const openFromTouch = () => {
        if (!local.openOnTouchStart || local.disabled) {
            return
        }

        if (
            activeTouchTooltipCloser &&
            activeTouchTooltipCloser !== closeFromTouchActivation
        ) {
            activeTouchTooltipCloser()
        }
        activeTouchTooltipCloser = closeFromTouchActivation
        setIgnoreNextClose(true)
        applyOpenChange(true)
    }

    onCleanup(() => {
        if (activeTouchTooltipCloser === closeFromTouchActivation) {
            activeTouchTooltipCloser = undefined
        }
    })

    return (
        <TooltipTouchContext.Provider
            value={{touchOpenEnabled: () => local.openOnTouchStart ?? false, openFromTouch}}
        >
            <TooltipPrimitive.Root
                gutter={4}
                disabled={local.disabled}
                open={isControlled() ? local.open : internalOpen()}
                onOpenChange={handleOpenChange}
                {...others}
            />
        </TooltipTouchContext.Provider>
    )
}

type TooltipContentProps<T extends ValidComponent = "div"> =
    TooltipPrimitive.TooltipContentProps<T> & { class?: string | undefined }

type TooltipTriggerProps<T extends ValidComponent = "button"> =
    TooltipPrimitive.TooltipTriggerProps<T> & {
        openOnTouchStart?: boolean
        onTouchStart?: JSX.EventHandlerUnion<HTMLElement, TouchEvent>
    }

const TooltipTrigger = <T extends ValidComponent = "button">(
    props: PolymorphicProps<T, TooltipTriggerProps<T>>
) => {
    const touchContext = useContext(TooltipTouchContext)
    const [local, others] = splitProps(props as TooltipTriggerProps, [
        "openOnTouchStart",
        "onTouchStart"
    ])

    const onTouchStart: JSX.EventHandlerUnion<HTMLElement, TouchEvent> = (event) => {
        callHandler(event, local.onTouchStart)
        if (event.defaultPrevented) {
            return
        }

        const openOnTouchStart = local.openOnTouchStart ?? touchContext?.touchOpenEnabled() ?? false
        if (openOnTouchStart) {
            touchContext?.openFromTouch()
        }
    }

    return <TooltipPrimitive.Trigger onTouchStart={onTouchStart} {...others} />
}

const TooltipContent = <T extends ValidComponent = "div">(
    props: PolymorphicProps<T, TooltipContentProps<T>>
) => {
    const [local, others] = splitProps(props as TooltipContentProps, ["class"])
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                class={cn(
                    "z-50 origin-[var(--kb-popover-content-transform-origin)] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
                    local.class
                )}
                {...others}
            />
        </TooltipPrimitive.Portal>
    )
}

export {Tooltip, TooltipTrigger, TooltipContent}
