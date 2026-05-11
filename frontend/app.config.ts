import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import treeShakeFontIcons from "./scripts/vite-plugin-tree-shake-icons.mjs";

export default defineConfig({
  ssr: false,
  server: {
    preset: "cloudflare-pages",
  },
  vite: {
    plugins: [tailwindcss(), treeShakeFontIcons()]
  }
});
