import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const backendSourceRoot = join(process.cwd(), "apps", "backend", "src");

test("every production credit ledger insert writes a balance snapshot", () => {
  const missing: string[] = [];

  for (const file of listTypeScriptFiles(backendSourceRoot)) {
    if (/[\\/]tests[\\/]/.test(file) || file.endsWith(".spec.ts")) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/INSERT INTO credit_ledger_entries\s*\(([\s\S]*?)\)/g)) {
      if (!/\bbalance_after\b/.test(match[1] ?? "")) {
        const line = source.slice(0, match.index).split("\n").length;
        missing.push(`${relative(process.cwd(), file)}:${line}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}
