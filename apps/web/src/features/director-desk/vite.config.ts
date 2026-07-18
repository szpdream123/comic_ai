import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const localGuoAssetsAvailable = existsSync(resolve(process.cwd(), "public/local-assets/guo-3d-assets"));

export default defineConfig(({ mode }) => ({
  base: "/director-desk/",
  assetsInclude: ["**/*.fbx", "**/*.obj"],
  plugins: [react()],
  define: {
    __LOCAL_GUO_ASSETS_AVAILABLE__: JSON.stringify(localGuoAssetsAvailable),
    "process.env.NODE_ENV": JSON.stringify(mode === "test" ? "test" : "production"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    maxWorkers: 1,
    setupFiles: "./src/test/setup.ts",
  },
  build: {
    outDir: resolve(process.cwd(), "../../../director-desk"),
    emptyOutDir: true,
    copyPublicDir: true,
    lib: {
      entry: resolve(process.cwd(), "src/embed.tsx"),
      formats: ["es"],
      fileName: "director-desk",
    },
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
}));
