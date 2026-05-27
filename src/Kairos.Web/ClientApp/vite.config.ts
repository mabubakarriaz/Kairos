import { defineConfig } from "vite";

// Build the front-end bundle into Kairos.Web/wwwroot/dist with a manifest so Razor can
// reference hash-fingerprinted, immutably-cacheable assets.
export default defineConfig({
  build: {
    manifest: "vite-manifest.json",
    outDir: "../wwwroot/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/main.ts",
    },
  },
});
