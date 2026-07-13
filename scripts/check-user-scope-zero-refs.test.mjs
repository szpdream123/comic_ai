import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { scanRoot } from "./check-user-scope-zero-refs.mjs";

test("scans nested source files while excluding git and dependencies", () => {
  const root = mkdtempSync(join(tmpdir(), "user-scope-zero-refs-"));
  try {
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "node_modules", "fixture"), { recursive: true });
    const organizationColumn = ["organization", "_id"].join("");
    const workspaceProperty = ["workspace", "Id"].join("");
    writeFileSync(join(root, "src", "nested", "bad.ts"), `${organizationColumn}\n${workspaceProperty}\n`);
    writeFileSync(join(root, ".git", "ignored.txt"), organizationColumn);
    writeFileSync(join(root, "node_modules", "fixture", "ignored.txt"), workspaceProperty);

    assert.deepEqual(scanRoot(root), [
      { file: "src/nested/bad.ts", line: 1, column: 1, token: organizationColumn },
      { file: "src/nested/bad.ts", line: 2, column: 1, token: workspaceProperty },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns no findings for user/project terminology", () => {
  const root = mkdtempSync(join(tmpdir(), "user-scope-zero-refs-clean-"));
  try {
    writeFileSync(join(root, "clean.ts"), "owner_user_id; project_id; team_member_id;\n");
    assert.deepEqual(scanRoot(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
