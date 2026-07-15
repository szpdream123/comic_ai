import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("every provider adapter records its final redacted request through the common helper", async () => {
  const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const adapterFiles = (await readdir(moduleDir))
    .filter((file) => file.endsWith(".provider-adapter.ts"))
    .sort();
  const implementations: string[] = [];

  for (const file of adapterFiles) {
    const source = await readFile(resolve(moduleDir, file), "utf8");
    if (!source.includes("implements ProviderAdapter")) continue;
    implementations.push(file);
    assert.match(source, /recordProviderAdapterRequest\s*\(/, `${file} must record its provider request`);
  }

  assert.ok(implementations.length > 0);
});
