import {defineConfig} from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import treeShakeFontIcons from "./scripts/icons/vite-plugin-tree-shake-icons.mjs";

export default defineConfig({
  ssr: true,
  middleware: "./src/middleware.ts",
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
    plugins: [tailwindcss(), treeShakeFontIcons()]
  }
});
