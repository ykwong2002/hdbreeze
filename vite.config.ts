import { defineConfig } from "vite";

const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    {
      // version.json lets a cached page notice a newer deploy and reload itself once
      name: "hdbreeze-version",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
      },
    },
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          return undefined;
        },
      },
    },
  },
});
