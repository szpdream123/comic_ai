import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildProductionWeb } from "./build-production-web.mjs";

test("production workbench entry URL stays within the portable filename limit", async () => {
  const appSource = await readFile(new URL("../apps/web/app.js", import.meta.url), "utf8");
  const appTemplate = await readFile(new URL("../apps/web/app.html", import.meta.url), "utf8");
  const importMatch = appSource.match(/import\("(\.\/src\/features\/production-workbench\/index\.js[^\"]*)"\)/);
  const preloadMatch = appTemplate.match(/<link\s+rel="modulepreload"\s+href="(\/src\/features\/production-workbench\/index\.js[^\"]*)"\s*\/>/);

  assert.ok(importMatch, "production workbench dynamic import is missing");
  assert.ok(preloadMatch, "production workbench module preload is missing");
  assert.equal(importMatch[1].replace(/^\./, ""), preloadMatch[1]);
  assert.ok(
    Buffer.byteLength(importMatch[1].split("/").at(-1), "utf8") <= 255,
    "production workbench module filename must fit Linux NAME_MAX",
  );
});

test("buildProductionWeb emits a hashed bundled entry and manifest", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-web-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  const outputDir = join(sourceRoot, ".production");
  const threeModulePath = join(cwd, "fixture-three.module.js");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "app.js"),
    'import { value } from "./shared.js"; globalThis.fixtureValue = value; import("./feature.js"); import("/vendor/three.module.js?one"); import("/vendor/three.module.js?two");\n',
  );
  await writeFile(join(sourceRoot, "shared.js"), 'export const value = "shared";\n');
  await writeFile(join(sourceRoot, "feature.js"), 'export const feature = "loaded";\n');
  await writeFile(threeModulePath, 'export const bundledThreeMarker = "BUNDLED_THREE_MARKER";\n');

  const result = await buildProductionWeb({ cwd, sourceRoot, outputDir, threeModulePath });

  assert.match(result.entryUrl, /^\/\.production\/app-[A-Z0-9]+\.js$/);
  assert.ok(result.outputFiles.length >= 2);
  await stat(join(sourceRoot, result.entryUrl.replace(/^\//, "")));
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.entryUrl, result.entryUrl);
  assert.deepEqual(manifest.outputFiles, result.outputFiles);
  const emittedJavaScript = await Promise.all(
    result.outputFiles.filter((file) => file.endsWith(".js")).map((file) => readFile(join(outputDir, file), "utf8")),
  );
  assert.doesNotMatch(emittedJavaScript.join("\n"), /\.\/shared\.js|\.\/feature\.js/);
  assert.doesNotMatch(emittedJavaScript.join("\n"), /\/vendor\/three\.module\.js/);
  assert.equal((emittedJavaScript.join("\n").match(/BUNDLED_THREE_MARKER/g) ?? []).length, 1);
});

test("buildProductionWeb keeps the previous hashed entry for already-open pages", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-web-rollout-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  const outputDir = join(sourceRoot, ".production");
  const threeModulePath = join(cwd, "fixture-three.module.js");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(threeModulePath, "export const revision = 1;\n");
  await writeFile(join(sourceRoot, "app.js"), 'globalThis.rolloutVersion = "one";\n');
  const first = await buildProductionWeb({ cwd, sourceRoot, outputDir, threeModulePath });

  await writeFile(join(sourceRoot, "app.js"), 'globalThis.rolloutVersion = "two";\n');
  const second = await buildProductionWeb({ cwd, sourceRoot, outputDir, threeModulePath });

  assert.notEqual(first.entryUrl, second.entryUrl);
  await stat(join(sourceRoot, first.entryUrl.replace(/^\//, "")));
  await stat(join(sourceRoot, second.entryUrl.replace(/^\//, "")));
});

test("unchanged production outputs and manifest are reused without being rewritten", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-web-reuse-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  const outputDir = join(sourceRoot, ".production");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, "app.js"), 'globalThis.release = "stable";\n');
  const first = await buildProductionWeb({ cwd });
  const paths = [...first.outputFiles.map((file) => join(outputDir, file)), first.manifestPath];
  const oldTime = new Date("2020-01-01T00:00:00Z");
  for (const path of paths) await utimes(path, oldTime, oldTime);

  assert.deepEqual(await buildProductionWeb({ cwd }), first);
  for (const path of paths) assert.equal((await stat(path)).mtimeMs, oldTime.getTime());
});

test("production build repairs damaged output and preserves the last release on compilation failure", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-web-repair-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  await mkdir(sourceRoot, { recursive: true });
  const sourcePath = join(sourceRoot, "app.js");
  await writeFile(sourcePath, 'globalThis.release = "stable";\n');
  const first = await buildProductionWeb({ cwd });
  const entryPath = join(sourceRoot, first.entryUrl.slice(1));
  const original = await readFile(entryPath, "utf8");
  const manifest = await readFile(first.manifestPath, "utf8");
  await writeFile(entryPath, "damaged");
  await buildProductionWeb({ cwd });
  assert.equal(await readFile(entryPath, "utf8"), original);
  await rm(entryPath);
  await buildProductionWeb({ cwd });
  assert.equal(await readFile(entryPath, "utf8"), original);
  await writeFile(sourcePath, 'import "./missing.js";');
  await assert.rejects(buildProductionWeb({ cwd }), /Could not resolve/);
  assert.equal(await readFile(entryPath, "utf8"), original);
  assert.equal(await readFile(first.manifestPath, "utf8"), manifest);
});

test("production build supports read-only published files in a writable directory", {
  skip: process.platform === "win32" ? "requires POSIX file permissions" : false,
}, async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-web-permissions-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  const outputDir = join(sourceRoot, ".production");
  await mkdir(sourceRoot, { recursive: true });
  const sourcePath = join(sourceRoot, "app.js");
  await writeFile(sourcePath, 'globalThis.release = "one";\n');
  const first = await buildProductionWeb({ cwd });
  for (const path of [...first.outputFiles.map((file) => join(outputDir, file)), first.manifestPath]) {
    await chmod(path, 0o444);
  }
  assert.deepEqual(await buildProductionWeb({ cwd }), first);
  const oldManifest = await stat(first.manifestPath);
  await writeFile(sourcePath, 'globalThis.release = "two";\n');
  const second = await buildProductionWeb({ cwd });
  assert.notEqual(second.entryUrl, first.entryUrl);
  assert.notEqual((await stat(second.manifestPath)).ino, oldManifest.ino);
  await stat(join(sourceRoot, first.entryUrl.slice(1)));
});

test("buildProductionWeb keeps browser video plugin resources on the public toolbox path", async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), "comic-ai-production-video-plugin-"));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const sourceRoot = join(cwd, "apps", "web");
  const outputDir = join(sourceRoot, ".production");
  const threeModulePath = join(cwd, "fixture-three.module.js");
  const clientPath = fileURLToPath(
    new URL("../apps/web/src/features/toolbox/browser-video-analysis-client.js", import.meta.url),
  ).replaceAll("\\", "/");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "app.js"),
    `import { __browserVideoAnalysisTestUtils } from ${JSON.stringify(clientPath)};\n`
      + "globalThis.browserVideoPluginUrl = __browserVideoAnalysisTestUtils.resolveDecoderBundleUrl();\n",
  );
  await writeFile(threeModulePath, "export const revision = 1;\n");

  const result = await buildProductionWeb({ cwd, sourceRoot, outputDir, threeModulePath });
  const emittedJavaScript = (await Promise.all(
    result.outputFiles.filter((file) => file.endsWith(".js")).map((file) => readFile(join(outputDir, file), "utf8")),
  )).join("\n");

  assert.match(
    emittedJavaScript,
    /new URL\("\/src\/features\/toolbox\/",globalThis\.location\?\.origin\?\?"http:\/\/localhost"\)/,
  );
});
