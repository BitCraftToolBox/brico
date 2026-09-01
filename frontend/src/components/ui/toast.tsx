import type {PolymorphicProps} from "@kobalte/core/polymorphic"
import * as ToastPrimitive from "@kobalte/core/toast"
import {Plural, Trans} from "@lingui/solid/macro"
import type {VariantProps} from "class-variance-authority"
import {cva} from "class-variance-authority"
import type {JSX, Owner, ValidComponent} from "solid-js"
import {createEffect, createMemo, createSignal, getOwner, Match, onCleanup, runWithOwner, Show, splitProps, Switch} from "solid-js"
import {Portal} from "solid-js/web"

import {Button} from "~/components/ui/button"
import {cn} from "~/lib/utils"

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--kb-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--kb-toast-swipe-move-x)] data-[swipe=move]:transition-none motion-safe:data-[opened]:animate-in motion-safe:data-[closed]:animate-out motion-safe:data-[swipe=end]:animate-out data-[closed]:fade-out-80 motion-safe:data-[closed]:slide-out-to-right-full motion-safe:data-[opened]:slide-in-from-top-full motion-safe:data-[opened]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive: "destructive group border-destructive bg-destructive text-destructive-foreground",
        success: "success border-success-foreground bg-success text-success-foreground",
        warning: "warning border-warning-foreground bg-warning text-warning-foreground",
        error: "error border-error-foreground bg-error text-error-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)
type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>

type ToastListProps<T extends ValidComponent = "ol"> = ToastPrimitive.ToastListProps<T> & {
  class?: string | undefined
}

/**
 * How urgently a toast should be shown, independent of Kobalte's own `priority` prop (which only
 * controls `aria-live`). `"high"` toasts (direct results of a user action — auth-link redirects,
 * reducer-call failures) can bump a `"low"` toast (background — a craft watch/notification match
 * arriving passively) out of a visible slot; `"low"` never bumps anything. See `queueToast`.
 */
type ToastPriority = "high" | "low"

/**
 * `title`/`description` are thunks, not values: a plain `<Trans>foo</Trans>` is evaluated eagerly,
 * at the call site, the instant the argument object is constructed — including from inside a
 * reducer-call `.catch()` or an SDK row-change callback, well past any `await`, where Solid has no
 * "current owner" to resolve `<Trans>`/`<A>`'s `I18nProvider`/router context from, so it throws
 * (silently, past any surrounding `try`/`catch`) instead of ever showing anything. Wrapping in a
 * thunk defers that evaluation into `mount`, which runs it under the owner captured once from
 * `<Toaster>` — itself mounted deep inside `I18nProvider`/`Router` — so callers never have to think
 * about owners themselves.
 */
interface ShowToastOptions {
  title?: () => JSX.Element
  description?: () => JSX.Element
  variant?: ToastVariant
  duration?: number
  /** Defaults to `"high"` — existing call sites that don't set this keep their prior "always show" behavior. */
  priority?: ToastPriority
  /** Fires exactly once, when this toast is truly gone (timeout, swipe, close button, or "dismiss all") — never when it's only bumped out to make room and later re-shown. */
  onDismiss?: () => void
}

/**
 * Toasts visible at once. Kept in lockstep with `ToastPrimitive.Region`'s own `limit` below:
 * admission (which request gets a slot, and which low-priority one gets bumped for a high-priority
 * arrival) is fully decided here, so Kobalte's own FIFO `slice(0, limit)` never sees more than this
 * many non-dismissed entries and never has to make that call itself.
 */
const MAX_VISIBLE = 3

interface ActiveEntry {
  id: number
  priority: ToastPriority
}

const [activeEntries, setActiveEntries] = createSignal<ActiveEntry[]>([])
const [pendingRequests, setPendingRequests] = createSignal<ShowToastOptions[]>([])

/**
 * Ids currently being torn down to free a slot for a higher-priority arrival, not truly dismissed.
 * `release` checks this to requeue the original request instead of firing `onDismiss` — Kobalte has
 * no "hide without discarding" primitive, so a bumped toast plays its exit animation and reappears
 * later as a fresh one once a slot frees.
 */
const evicting = new Set<number>()

/** Captured once, when `<Toaster>` mounts — see `ShowToastOptions`'s doc comment. */
let toasterOwner: Owner | null = null

const overflowCount = createMemo(() =>
  Math.max(0, activeEntries().length + pendingRequests().length - MAX_VISIBLE)
)

function rankOf(priority: ToastPriority | undefined): number {
  return priority === "low" ? 1 : 0
}

function enqueuePending(options: ShowToastOptions, first: boolean = false) {
  setPendingRequests((prev) => (first ? [options, ...prev] : [...prev, options]).sort((a, b) => rankOf(a.priority) - rankOf(b.priority)))
}

/**
 * Slots claimed by an in-flight eviction (see `evictForSlot`) but not yet filled by `mount`.
 * `dismiss`'s cleanup can run synchronously or asynchronously depending on environment (animations
 * vs. reduced-motion/test), so without this, `admitFromPending` can race in and steal the freed slot
 * for the oldest pending request before `queueToast` mounts the toast that triggered the eviction.
 */
let reservedSlots = 0

function admitFromPending() {
  if (activeEntries().length + reservedSlots >= MAX_VISIBLE) return
  const [next, ...rest] = pendingRequests()
  if (!next) return
  setPendingRequests(rest)
  mount(next)
}

function release(id: number, options: ShowToastOptions) {
  setActiveEntries((prev) => prev.filter((entry) => entry.id !== id))
  if (evicting.delete(id)) {
    enqueuePending(options, true)
  } else {
    options.onDismiss?.()
  }
  admitFromPending()
}

function mount(options: ShowToastOptions) {
  const priority = options.priority ?? "high"
  const id = ToastPrimitive.toaster.show((data) => {
    onCleanup(() => release(id, options))
    return (
      <Toast toastId={data.toastId} variant={options.variant} duration={options.duration}>
        <div class="grid gap-1">
          {options.title && <ToastTitle>{runWithOwner(toasterOwner, options.title)}</ToastTitle>}
          {options.description && <ToastDescription>{runWithOwner(toasterOwner, options.description)}</ToastDescription>}
        </div>
        <ToastClose />
      </Toast>
    )
  })
  setActiveEntries((prev) => [...prev, {id, priority}])
}

/** Finds the newest `"low"` active toast a `"high"` arrival may bump; `"low"` never bumps anything. */
function evictForSlot(priority: ToastPriority): boolean {
  if (priority !== "high") return false
  const victim = activeEntries().findLast((entry) => entry.priority === "low")
  if (!victim) return false
  evicting.add(victim.id)
  reservedSlots++
  ToastPrimitive.toaster.dismiss(victim.id)
  return true
}

function queueToast(options: ShowToastOptions) {
  const priority = options.priority ?? "high"
  if (activeEntries().length < MAX_VISIBLE) {
    mount(options)
    return
  }
  if (evictForSlot(priority)) {
    mount(options)
    reservedSlots--
    return
  }
  enqueuePending(options)
}

function dismissAll() {
  setPendingRequests([])
  evicting.clear()
  ToastPrimitive.toaster.clear()
}

/** Matches Tailwind's `sm` breakpoint, which is what flips the toast list between mobile (top-anchored, reversed) and desktop (bottom-anchored) layouts below. */
const DESKTOP_MEDIA_QUERY = "(min-width: 640px)"

/** Runs client-only (effects don't execute during SSR), so `window.matchMedia` is safe here. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = createSignal(false)
  createEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches)
    mql.addEventListener("change", onChange)
    onChange(mql)
    onCleanup(() => mql.removeEventListener("change", onChange))
  })
  return isDesktop
}

const ToastOverflowBar = () => (
  <div class="flex items-center gap-2 self-end rounded-md border bg-background px-3 py-1.5 text-sm shadow-lg">
    <span><Plural value={overflowCount()} one="+# more" other="+# more"/></span>
    <Button size="sm" variant="ghost" onClick={dismissAll}>
      <Trans>Dismiss all</Trans>
    </Button>
  </div>
)

const Toaster = <T extends ValidComponent = "ol">(
  props: PolymorphicProps<T, ToastListProps<T>>
) => {
  const [local, others] = splitProps(props as ToastListProps, ["class"])
  toasterOwner = getOwner()
  const isDesktop = useIsDesktop()
  return (
    <Portal>
      <ToastPrimitive.Region limit={MAX_VISIBLE}>
        <div class="fixed top-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto md:max-w-[420px]">
          <Show when={overflowCount() > 0 && isDesktop()}>
            <ToastOverflowBar />
          </Show>
          <ToastPrimitive.List
            class={cn("flex flex-col-reverse gap-2 sm:flex-col", local.class)}
            {...others}
          />
          <Show when={overflowCount() > 0 && !isDesktop()}>
            <ToastOverflowBar />
          </Show>
        </div>
      </ToastPrimitive.Region>
    </Portal>
  )
}

type ToastRootProps<T extends ValidComponent = "li"> = ToastPrimitive.ToastRootProps<T> &
  VariantProps<typeof toastVariants> & { class?: string | undefined }

const Toast = <T extends ValidComponent = "li">(props: PolymorphicProps<T, ToastRootProps<T>>) => {
  const [local, others] = splitProps(props as ToastRootProps, ["class", "variant"])
  return (
    <ToastPrimitive.Root
      class={cn(toastVariants({ variant: local.variant }), local.class)}
      {...others}
    />
  )
}

type ToastCloseButtonProps<T extends ValidComponent = "button"> =
  ToastPrimitive.ToastCloseButtonProps<T> & { class?: string | undefined }

const ToastClose = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ToastCloseButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ToastCloseButtonProps, ["class"])
  return (
    <ToastPrimitive.CloseButton
      class={cn(
        "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-destructive-foreground group-[.error]:text-error-foreground group-[.success]:text-success-foreground group-[.warning]:text-warning-foreground",
        local.class
      )}
      {...others}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4"
      >
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </ToastPrimitive.CloseButton>
  )
}

type ToastTitleProps<T extends ValidComponent = "div"> = ToastPrimitive.ToastTitleProps<T> & {
  class?: string | undefined
}

const ToastTitle = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ToastTitleProps<T>>
) => {
  const [local, others] = splitProps(props as ToastTitleProps, ["class"])
  return <ToastPrimitive.Title class={cn("text-sm font-semibold", local.class)} {...others} />
}

type ToastDescriptionProps<T extends ValidComponent = "div"> =
  ToastPrimitive.ToastDescriptionProps<T> & { class?: string | undefined }

const ToastDescription = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ToastDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as ToastDescriptionProps, ["class"])
  return <ToastPrimitive.Description class={cn("text-sm opacity-90", local.class)} {...others} />
}

function showToast(props: ShowToastOptions) {
  queueToast(props)
}

// No caller uses this yet, so it intentionally bypasses `queueToast`'s admission/priority queue —
// route it through `showToast`-style bookkeeping if that changes.
function showToastPromise<T, U>(
  promise: Promise<T> | (() => Promise<T>),
  options: {
    loading?: JSX.Element
    success?: (data: T) => JSX.Element
    error?: (error: U) => JSX.Element
    duration?: number
  }
) {
  const variant: { [key in ToastPrimitive.ToastPromiseState]: ToastVariant } = {
    pending: "default",
    fulfilled: "success",
    rejected: "error"
  }
  return ToastPrimitive.toaster.promise<T, U>(promise, (props) => (
    <Toast toastId={props.toastId} variant={variant[props.state]} duration={options.duration}>
      <Switch>
        <Match when={props.state === "pending"}>{options.loading}</Match>
        <Match when={props.state === "fulfilled"}>{options.success?.(props.data!)}</Match>
        <Match when={props.state === "rejected"}>{options.error?.(props.error!)}</Match>
      </Switch>
    </Toast>
  ))
}

export { Toaster, Toast, ToastClose, ToastTitle, ToastDescription, showToast, showToastPromise, dismissAll as clearToasts }
