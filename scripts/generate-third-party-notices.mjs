import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
const components = (await Promise.all(Object.entries(lock.packages ?? {})
  .filter(([path, value]) => path.includes("node_modules/") && value?.version && !value?.link)
  .map(async ([path, value]) => {
    const name = packageNameFromLockPath(path);
    const version = String(value.version);
    const license = await resolvePackageLicense(name, path, value.license);
    return {
      type: "library",
      name,
      version,
      licenses: [{ license: { id: license } }],
      purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      properties: [{ name: "comic-ai:lockPath", value: path }],
    };
  })))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

components.push({
  type: "application",
  name: "AI-Canvas-tauri",
  version: "87731295a121be601b1d4fa8616b0f2d1a38a3bb",
  licenses: [{ license: { name: "AI Canvas Tauri Source-Available License + separate author authorization" } }],
  externalReferences: [{ type: "vcs", url: "https://github.com/Tenney95/AI-Canvas-tauri" }],
  properties: [{ name: "comic-ai:integration", value: "authorized-adaptation" }],
});

const sbom = `${JSON.stringify({
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
  version: 1,
  metadata: {
    component: { type: "application", name: "comic-ai" },
    tools: [{ vendor: "comic-ai", name: "generate-third-party-notices.mjs" }],
  },
  components,
}, null, 2)}\n`;

const notices = `# Third-Party Notices

Generated from \`package-lock.json\`. Run \`npm run legal:generate\` after dependency changes.

The AI Canvas behavior is adapted from [Tenney95/AI-Canvas-tauri](https://github.com/Tenney95/AI-Canvas-tauri) at commit \`87731295a121be601b1d4fa8616b0f2d1a38a3bb\` (v0.6.7) under the upstream source-available license and the separately archived author authorization. See \`docs/legal/ai-canvas-tauri-provenance.md\`.

| Package | Version | Declared license |
| --- | --- | --- |
${components.filter((item) => item.purl).map((item) => `| ${escapeTable(item.name)} | ${escapeTable(item.version)} | ${escapeTable(item.licenses[0].license.id)} |`).join("\n")}

License identifiers are declarations from the lockfile. Release review must still resolve every \`UNKNOWN\` or non-SPDX value and retain required license texts.
`;

const targets = [
  [resolve(root, "docs/legal/sbom.cdx.json"), sbom],
  [resolve(root, "docs/legal/THIRD_PARTY_NOTICES.md"), notices],
];
if (process.argv.includes("--check")) {
  for (const [path, expected] of targets) {
    const actual = await readFile(path, "utf8").catch(() => "");
    if (actual !== expected) throw new Error(`legal_artifact_out_of_date:${path}`);
  }
} else {
  await Promise.all(targets.map(([path, content]) => writeFile(path, content, "utf8")));
}

function packageNameFromLockPath(path) {
  const tail = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
  const parts = tail.split("/");
  return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length) return value.map(String).join(" OR ");
  return "UNKNOWN";
}

async function resolvePackageLicense(name, lockPath, lockLicense) {
  const normalized = normalizeLicense(lockLicense);
  if (normalized !== "UNKNOWN") return normalized;
  const manifest = await readFile(resolve(root, lockPath, "package.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const manifestLicense = normalizeLicense(manifest?.license ?? manifest?.licenses);
  if (manifestLicense !== "UNKNOWN") return manifestLicense;
  // Optional platform packages are absent on this OS. These declarations were
  // verified against their exact npm registry versions during the release audit.
  if (name.startsWith("@esbuild/") || name === "fsevents") return "MIT";
  return "UNKNOWN";
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
