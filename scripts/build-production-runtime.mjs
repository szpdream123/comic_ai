import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const productionRuntimeManifestName = ".production-runtime-manifest.json";
const productionRuntimeCacheVersion = 4;
const runtimeEntrySources = {
  foundationSchema: join("apps", "backend", "src", "entrypoints", "production-foundation-schema.ts"),
  phoneAuth: join("apps", "backend", "src", "entrypoints", "phone-auth-dev-server.ts"),
  sharedRuntime: join("scripts", "run-comic-ai-shared-runtime.mjs"),
  generationOutbox: join("scripts", "run-generation-outbox-dispatcher.mjs"),
  generationRepair: join("scripts", "run-generation-queue-maintenance.mjs"),
  generationWorker: join("scripts", "run-generation-video-worker.mjs"),
  canvasAgent: join("scripts", "run-canvas-agent-worker.mjs"),
  mediaCrawler: join("scripts", "run-media-crawler-api.mjs"),
};

export async function buildProductionRuntime({ cwd = process.cwd() } = {}) {
  const outputDir = productionRuntimeOutputDir(cwd);
  const entrypoints = productionRuntimeEntrypoints(cwd);
  const entryPoints = Object.fromEntries(
    Object.entries(runtimeEntrySources).map(([name, relativePath]) => [
      name,
      join(cwd, relativePath),
    ]),
  );

  if (isProductionRuntimeCurrent({ cwd, outputDir, entrypoints })) {
    console.info("[runtime] Reusing cached production runtime.");
    return entrypoints;
  }

  console.info("[runtime] Building production runtime...");
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  const result = await build({
    entryPoints,
    outdir: outputDir,
    absWorkingDir: cwd,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    target: "node18",
    outExtension: { ".js": ".mjs" },
    logLevel: "warning",
    metafile: true,
  });

  writeFileSync(
    productionRuntimeManifestPath(outputDir),
    JSON.stringify({
      version: productionRuntimeCacheVersion,
      buildSignature: productionRuntimeBuildSignature(),
      inputs: buildInputFingerprints(cwd, Object.keys(result.metafile.inputs)),
    }),
  );

  return entrypoints;
}

function isProductionRuntimeCurrent({ cwd, outputDir, entrypoints }) {
  if (!Object.values(entrypoints).every((entrypoint) => existsSync(entrypoint))) return false;
  const manifestPath = productionRuntimeManifestPath(outputDir);
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      manifest.version !== productionRuntimeCacheVersion
      || manifest.buildSignature !== productionRuntimeBuildSignature()
      || !Array.isArray(manifest.inputs)
    ) {
      return false;
    }
    return manifest.inputs.every((input) =>
      typeof input?.path === "string"
      && typeof input?.hash === "string"
      && fingerprintFile(resolve(cwd, input.path.split("/").join(sep))) === input.hash
    );
  } catch {
    return false;
  }
}

function buildInputFingerprints(cwd, metafileInputs) {
  const inputs = new Set([
    ...metafileInputs,
    "package.json",
    "package-lock.json",
    "scripts/build-production-runtime.mjs",
  ]);
  return [...inputs]
    .map((input) => {
      const absolutePath = isAbsolute(input) ? input : resolve(cwd, input);
      return {
        path: relative(cwd, absolutePath).split(sep).join("/"),
        hash: fingerprintFile(absolutePath),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function fingerprintFile(filePath) {
  if (!existsSync(filePath)) return "missing";
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function productionRuntimeBuildSignature() {
  return createHash("sha256")
    .update(JSON.stringify({ productionRuntimeCacheVersion, runtimeEntrySources }))
    .digest("hex");
}

function productionRuntimeOutputDir(cwd) {
  return join(cwd, "apps", "backend", "vendor", "production-runtime");
}

function productionRuntimeManifestPath(outputDir) {
  return join(outputDir, productionRuntimeManifestName);
}

function productionRuntimeEntrypoints(cwd) {
  const outputDir = productionRuntimeOutputDir(cwd);
  return Object.fromEntries(
    Object.keys(runtimeEntrySources).map((name) => [name, join(outputDir, `${name}.mjs`)]),
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await buildProductionRuntime();
}
