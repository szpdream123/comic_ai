import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
}

test("AI Canvas legal artifacts match the committed lockfile", async () => {
  const [lock, sbom, notices, provenance] = await Promise.all([
    readJson("package-lock.json"),
    readJson("docs/legal/sbom.cdx.json"),
    readFile(resolve(root, "docs/legal/THIRD_PARTY_NOTICES.md"), "utf8"),
    readFile(resolve(root, "docs/legal/ai-canvas-tauri-provenance.md"), "utf8"),
  ]);
  assert.equal(lock.lockfileVersion, 3);

  const packages = Object.entries(lock.packages).filter(
    ([path, value]) => path.startsWith("node_modules/") && value?.version && !value?.link,
  );
  assert.equal(packages.length, 345);
  assert.ok(packages.every(([, value]) => value.integrity), "every locked package needs integrity");
  assert.ok(
    packages.every(([, value]) => !/^(git|git\+|https?:\/\/github\.com\/)/i.test(value.resolved ?? "")),
    "AI Canvas dependencies must not use Git URLs",
  );

  const upstream = sbom.components.find((component) => component.name === "AI-Canvas-tauri");
  assert.equal(upstream?.version, "87731295a121be601b1d4fa8616b0f2d1a38a3bb");
  assert.match(notices, /Tenney95\/AI-Canvas-tauri/);
  assert.match(notices, /87731295a121be601b1d4fa8616b0f2d1a38a3bb/);
  assert.match(provenance, /npm audit --registry=https:\/\/registry\.npmjs\.org --json/);
  assert.match(provenance, /13 个漏洞（1 critical、8 high、3 moderate、1 low）/);

  const result = await runNode(["scripts/generate-third-party-notices.mjs", "--check"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
});

function runNode(args) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}
