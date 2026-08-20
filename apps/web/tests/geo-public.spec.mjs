import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../geo-public.css", import.meta.url), "utf8");

test("GEO article images stay within the content column", () => {
  assert.match(
    css,
    /\.geo-article figure img\{[^}]*display:block[^}]*max-width:100%[^}]*height:auto[^}]*\}/,
  );
});
