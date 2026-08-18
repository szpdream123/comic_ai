import assert from "node:assert/strict";
import test from "node:test";

import { validateUploadContentBoundary } from "../upload-content-validation.ts";

test("accepts known Canvas media signatures and rejects MIME, extension, and content mismatches", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const mp4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const json = Buffer.from(JSON.stringify({ version: 1, strokes: [] }));
  assert.deepEqual(validateUploadContentBoundary({ fileName: "frame.png", contentType: "image/png", bytes: png }), { ok: true });
  assert.deepEqual(validateUploadContentBoundary({ fileName: "clip.mp4", contentType: "video/mp4", bytes: mp4 }), { ok: true });
  assert.deepEqual(validateUploadContentBoundary({ fileName: "annotation.json", contentType: "application/json", bytes: json }), { ok: true });

  for (const input of [
    { fileName: "frame.png", contentType: "image/png", bytes: Buffer.from("<script>alert(1)</script>") },
    { fileName: "frame.jpg", contentType: "image/png", bytes: png },
    { fileName: "frame.png", contentType: "image/png", bytes: Buffer.alloc(0) },
    { fileName: "notes.txt", contentType: "text/plain", bytes: Buffer.from([0x41, 0x00, 0x42]) },
    { fileName: "annotation.json", contentType: "application/json", bytes: Buffer.from("not json") },
  ]) {
    const result = validateUploadContentBoundary(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errorCode, "upload_content_mismatch");
  }
});
