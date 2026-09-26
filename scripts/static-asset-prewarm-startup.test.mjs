import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("importing API helpers for a background worker does not prewarm web assets", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { resolve } from 'node:path';
    const original = fs.readdir;
    let webScans = 0;
    fs.readdir = async function(path, ...args) {
      if (resolve(String(path)) === resolve('apps/web')) { webScans++; return []; }
      return original.call(this, path, ...args);
    };
    syncBuiltinESMExports();
    await import('./apps/backend/src/entrypoints/phone-auth-dev-server.ts');
    console.log('WEB_SCANS=' + webScans);
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WEB_SCANS=0\b/, result.stdout);
});
