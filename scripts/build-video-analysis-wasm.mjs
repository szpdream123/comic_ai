import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";

const root = process.cwd();
const outputRoot = resolve(root, "apps/web/src/features/toolbox");
const runBundle = (entry, outfile) => {
  buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    outfile,
    logLevel: "info",
  });
};

mkdirSync(outputRoot, { recursive: true });
runBundle(
  join(outputRoot, "browser-video-analysis-wasm.js"),
  join(outputRoot, "browser-video-analysis-wasm.bundle.js"),
);
runBundle(
  resolve(root, "node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js"),
  join(outputRoot, "browser-video-analysis-ffmpeg-worker.js"),
);
copyFileSync(
  resolve(root, "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js"),
  join(outputRoot, "browser-video-analysis-ffmpeg-core.js"),
);
copyFileSync(
  resolve(root, "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm"),
  join(outputRoot, "browser-video-analysis-ffmpeg-core.wasm"),
);
