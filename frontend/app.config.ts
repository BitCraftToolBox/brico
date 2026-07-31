import {lingui} from "@lingui/vite-plugin";
import {defineConfig} from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import treeShakeFontIcons from "./scripts/icons/vite-plugin-tree-shake-icons.mjs";

// Crowdin's pseudolocale (`zu`) and its In-Context script are dev-only noise for real visitors,
// but a dedicated Cloudflare Pages branch running them lets translators review live without a
// local checkout. See `src/lib/i18n.ts`'s `PSEUDOLOCALE_ENABLED`.
if (process.env.CF_PAGES_BRANCH === "translate" || process.env.CF_PAGES_BRANCH === "feat/i18n") {
    process.env.VITE_ENABLE_PSEUDOLOCALE = "true";
}

export default defineConfig({
  ssr: true,
  middleware: "./src/middleware.ts",
  // Lingui's macros are a Babel plugin, so they have to run inside vite-plugin-solid's own
  // Babel pass (there is no separate Babel step in this build). Babel applies plugins before
  // presets, so the macro expands to plain `Trans`/`i18n._` calls before babel-preset-solid's
  // JSX transform sees the tree.
  solid: {
    babel: {
      plugins: ["@lingui/babel-plugin-lingui-macro"]
    }
  },
  server: {
    preset: "cloudflare-pages",
    esbuild: {
      options: {
        target: "es2022"
      }
    },
    cloudflare: {
      pages: {
        routes: {
          exclude: ["/assets/*", "/_build/*", "/bsatn/*", "/og-icons/*"]
        }
      }
    },
    routeRules: {
      // BSATN data files are versioned via a ?v=<version> query (see spacetime.ts), so the
      // underlying path can be cached immutably — a data update changes the query and busts it.
      "/bsatn/static/**": {
        headers: {"cache-control": "public, max-age=31536000, immutable"}
      }
    },
    rollupConfig: {
      external: ["node:async_hooks"]
    }
  },
  vite: {
    // `lingui()` compiles `.po` imports (src/locales/**) into runtime message catalogs, so
    // `vinxi build` needs no separate `lingui compile` step.
    plugins: [tailwindcss(), treeShakeFontIcons(), lingui()]
  }
});
