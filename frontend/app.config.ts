import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  ssr: false,
  server: {
    static: true,
    prerender: {
      crawlLinks: true,
    }
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
