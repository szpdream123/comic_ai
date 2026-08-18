import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("does not track runtime environment files", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "--", ".env", ".env.*"], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => file !== ".env.example");

  assert.deepEqual(trackedFiles, [], `runtime environment files must not be tracked: ${trackedFiles.join(", ")}`);
});
