import {Accessor, type ComponentProps, createContext, Setter, useContext} from "solid-js";

export type DetailDialogContextType = ComponentProps<"div"> & {
    open: Accessor<boolean>
    setOpen: (open: boolean) => void
    content: Accessor<[string, any]>
    setContent: Setter<[string, any]>
}

export const DetailDialogContext = createContext<DetailDialogContextType | null>(null);

export function useDetailDialog() {
    const context = useContext(DetailDialogContext);
    if (!context) {
        throw new Error("useDetailDialog must be used within a DetailDialog.");
    }

    return context;
}

export type UseFullNodeOutputContextType = {
    useFullNode: Accessor<boolean>
    setUseFullNode: Setter<boolean>
    toggle: () => void;
}

export const UseFullNodeOutputContext = createContext<UseFullNodeOutputContextType | null>(null);

export function useFullNodeContext() {
    const context = useContext(UseFullNodeOutputContext);
    if (!context) {
        throw new Error("not in a useFullNode context");
    }
    return context;
}