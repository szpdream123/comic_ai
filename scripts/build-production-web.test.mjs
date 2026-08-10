import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProductionWeb } from "./build-production-web.mjs";

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
