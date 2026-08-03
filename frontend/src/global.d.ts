/// <reference types="@solidjs/start/env" />
declare module "*.css";
declare module "@fontsource/*" {
}
declare module "@fontsource-variable/*" {
}

// `@lingui/vite-plugin` transforms `.po` imports into a compiled message catalog module.
declare module "*.po" {
    import type {Messages} from "@lingui/core";
    export const messages: Messages;
}

// The `?raw` suffix bypasses the lingui plugin (it only matches ids ending in literal `.po`),
// falling through to Vite's built-in raw-text loader. Used by the translations debug route to
// read msgid/msgstr straight off disk instead of the compiled (ICU-token-array) catalog.
declare module "*.po?raw" {
    const raw: string;
    export default raw;
}