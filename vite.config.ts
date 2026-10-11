import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        "spike-overlay": resolve(import.meta.dirname, "spikes/overlay/index.html"),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          return undefined;
        },
      },
    },
  },
});
