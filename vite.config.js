import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { adminPlugin } from "./scripts/admin-plugin.mjs";

export default defineConfig({
  plugins: [react(), adminPlugin()],
  base: "/parques-nacionais-brasileiros/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
});
