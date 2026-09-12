import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const productionWebManifestName = ".production-web-manifest.json";
const productionWebManifestVersion = 1;

export async function buildProductionWeb({
  cwd = process.cwd(),
  sourceRoot = resolve(cwd, "apps", "web"),
  outputDir = resolve(sourceRoot, ".production"),
  threeModulePath = resolve(cwd, "node_modules", "three", "build", "three.module.js"),
} = {}) {
  const resolvedSourceRoot = resolve(sourceRoot);
  const resolvedOutputDir = resolve(outputDir);
  if (!isPathInside(resolvedSourceRoot, resolvedOutputDir)) {
    throw new Error("production_web_output_outside_source_root");
  }

  await mkdir(resolvedOutputDir, { recursive: true });
  const entryPoint = resolve(resolvedSourceRoot, "app.js");
  const result = await build({
    absWorkingDir: resolve(cwd),
    entryPoints: { app: entryPoint },
    outdir: resolvedOutputDir,
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    metafile: true,
    write: false,
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    external: ["/vendor/*"],
    plugins: [{
      name: "bundle-three-browser-runtime",
      setup(context) {
        context.onResolve(
          { filter: /^\/vendor\/three\.module\.js(?:\?.*)?$/ },
          () => ({ path: resolve(threeModulePath) }),
        );
      },
    }],
    logLevel: "warning",
  });

  const outputs = Object.entries(result.metafile.outputs).map(([outputPath, metadata]) => ({
    absolutePath: isAbsolute(outputPath) ? outputPath : resolve(cwd, outputPath),
    entryPoint: metadata.entryPoint,
  }));
  const entryOutputs = outputs.filter((output) =>
    output.entryPoint && resolve(cwd, output.entryPoint) === entryPoint
  );
  if (entryOutputs.length !== 1) {
    throw new Error("production_web_entry_output_missing");
  }

  const outputFiles = outputs
    .map((output) => relative(resolvedOutputDir, output.absolutePath).split(sep).join("/"))
    .sort((left, right) => left.localeCompare(right));
  if (outputFiles.some((file) => file.startsWith("../") || file === "..")) {
    throw new Error("production_web_output_outside_output_dir");
  }
  const entryRelativeToSource = relative(resolvedSourceRoot, entryOutputs[0].absolutePath)
    .split(sep)
    .join("/");
  const entryUrl = `/${entryRelativeToSource}`;
  const manifestPath = resolve(resolvedOutputDir, productionWebManifestName);
  // Publish only after compilation succeeds. Identical hashed files can be read-only
  // (for example, extracted by root while the service runs as www).
  for (const output of result.outputFiles) {
    if (!isPathInside(resolvedOutputDir, output.path)) {
      throw new Error("production_web_output_outside_output_dir");
    }
    await publishProductionFile(output.path, output.contents);
  }
  await publishProductionFile(
    manifestPath,
    `${JSON.stringify({
      version: productionWebManifestVersion,
      entryUrl,
      outputFiles,
    })}\n`,
  );

  return { entryUrl, outputFiles, manifestPath };
}

async function publishProductionFile(filePath, contents) {
  const bytes = Buffer.from(contents);
  try {
    if ((await readFile(filePath)).equals(bytes)) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o644 });
    // Same-directory rename avoids truncating a published file or requiring write
    // access to the old file. Directory write access is still required.
    await rename(temporaryPath, filePath);
  } catch (error) {
    if (["EACCES", "EPERM", "EROFS"].includes(error.code)) {
      error.message += ` [production-web] Cannot publish ${filePath}; check that the deployment directory is writable by the service account. Do not run the service as root to bypass this.`;
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch((error) => {
      console.warn(`[production-web] Cannot clean temporary file ${temporaryPath}: ${error.code}`);
    });
  }
}

function isPathInside(parentPath, candidatePath) {
  const relativePath = relative(parentPath, candidatePath);
  return relativePath !== ""
    && relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await buildProductionWeb();
  console.info(`[web] Built production entry ${result.entryUrl}`);
}
