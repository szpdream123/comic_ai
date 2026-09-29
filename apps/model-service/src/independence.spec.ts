import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("standalone entry bundles without old business services or old schema migrations", async () => {
  const result = await build({ entryPoints: ["apps/model-service/src/runtime.ts"], bundle: true, platform: "node",
    format: "esm", packages: "external", write: false, metafile: true });
  const imported = Object.keys(result.metafile.inputs);
  assert.deepEqual(imported.filter(path => /modules\/(identity|credit-billing|membership|project|canvas-agent|workflow-task|storage)\/|phone-auth-dev-server|seedance-video\.worker/.test(path)), []);
  const output = result.outputFiles[0].text;
  assert.equal(output.includes("ensureAdminSecretValueStore"), false);
  assert.equal(output.includes("ALTER TABLE admin_secret_references"), false);
  assert.equal(output.includes("TEST_DATABASE_URL"), false);
});
