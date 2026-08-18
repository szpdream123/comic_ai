import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const coreDirectories = ["domain", "application", "ports", "workers"];
const forbiddenModuleSegment = /(?:^|\/)(?:canvas-agent|project|comic|episode|shot)(?:\/|\.|$)/;
const forbiddenTableReference = /REFERENCES\s+(?:comic_|canvas_|episode_|shot_|panels?\b)/i;

describe("marketing architecture boundary", () => {
  it("keeps the marketing core independent from comic and canvas modules", () => {
    const coreRoot = join(root, "apps", "backend", "src", "modules", "marketing");
    for (const directory of coreDirectories) {
      for (const file of collectTypeScriptFiles(join(coreRoot, directory))) {
        const imports = importSpecifiers(readFileSync(file, "utf8"));
        for (const specifier of imports) {
          assert.equal(
            forbiddenModuleSegment.test(specifier),
            false,
            `${file} must not import the ${specifier} business module`,
          );
        }
      }
    }
  });

  it("keeps marketing migrations free of hard comic or canvas table references", () => {
    const migrationRoot = join(root, "packages", "db", "migrations");
    for (const name of readdirSync(migrationRoot)) {
      if (!/marketing/i.test(name)) continue;
      const path = join(migrationRoot, name);
      assert.equal(
        forbiddenTableReference.test(readFileSync(path, "utf8")),
        false,
        `${name} must retain only marketing or shared ownership references`,
      );
    }
  });
});

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map((match) => match[2]!);
}
