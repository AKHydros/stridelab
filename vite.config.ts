import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// `base` is relative so the built app works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return "map";
          if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return "charts";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
