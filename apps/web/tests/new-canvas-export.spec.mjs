import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CANVAS_EXPORT_EMPTY,
  downloadCanvasImageBlob,
  exportCanvasImage,
} from "../new-canvas/src/loomic-core/canvas-export.js";

const editor = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url),
  "utf8",
);

const logoMenu = await readFile(
  new URL("../new-canvas/src/loomic-shell/CanvasLogoMenu.jsx", import.meta.url),
  "utf8",
);

test("canvas image export sends active scene content to Excalidraw as a PNG", async () => {
  const active = { id: "active", isDeleted: false };
  let received;
  const blob = new Blob(["png"], { type: "image/png" });
  const result = await exportCanvasImage({
    getSceneElements: () => [active, { id: "deleted", isDeleted: true }],
    getAppState: () => ({ viewBackgroundColor: "#ffffff" }),
    getFiles: () => ({ image: { id: "image" } }),
  }, {
    exportToBlob: async (options) => {
      received = options;
      return blob;
    },
  });

  assert.strictEqual(result, blob);
  assert.deepEqual(received.elements, [active]);
  assert.equal(received.appState.exportBackground, true);
  assert.equal(received.appState.viewBackgroundColor, "#ffffff");
  assert.equal(received.mimeType, "image/png");
  assert.deepEqual(received.files, { image: { id: "image" } });
});

test("canvas image export rejects an empty scene before invoking Excalidraw", async () => {
  let called = false;
  await assert.rejects(
    exportCanvasImage({ getSceneElements: () => [{ id: "deleted", isDeleted: true }] }, {
      exportToBlob: async () => {
        called = true;
        return new Blob();
      },
    }),
    (error) => error.code === CANVAS_EXPORT_EMPTY && /暂无可导出/.test(error.message),
  );
  assert.equal(called, false);
});

test("canvas image download clicks a temporary anchor and always revokes its object URL", () => {
  const calls = [];
  const anchor = {
    click() { calls.push("click"); },
    remove() { calls.push("remove"); },
  };
  const document = {
    body: {
      appendChild(node) {
        assert.strictEqual(node, anchor);
        calls.push("append");
      },
    },
    createElement(name) {
      assert.equal(name, "a");
      return anchor;
    },
  };
  const urlApi = {
    createObjectURL(blob) {
      assert.equal(blob.type, "image/png");
      calls.push("create");
      return "blob:canvas-export";
    },
    revokeObjectURL(url) {
      assert.equal(url, "blob:canvas-export");
      calls.push("revoke");
    },
  };

  downloadCanvasImageBlob(new Blob(["png"], { type: "image/png" }), {
    document,
    urlApi,
    filename: "project.png",
  });

  assert.equal(anchor.href, "blob:canvas-export");
  assert.equal(anchor.download, "project.png");
  assert.deepEqual(calls, ["create", "append", "click", "remove", "revoke"]);
});

test("canvas image download revokes the object URL when the browser click fails", () => {
  let revoked = false;
  const anchor = {
    click() { throw new Error("blocked"); },
    remove() {},
  };
  assert.throws(() => downloadCanvasImageBlob(new Blob(["png"]), {
    document: {
      body: { appendChild() {} },
      createElement: () => anchor,
    },
    urlApi: {
      createObjectURL: () => "blob:blocked",
      revokeObjectURL: (url) => { revoked = url === "blob:blocked"; },
    },
  }), /blocked/);
  assert.equal(revoked, true);
});

test("logo menu exposes the PNG export action and reports empty or failed exports", () => {
  assert.match(logoMenu, /\bDownload\b/);
  assert.match(logoMenu, /<MenuItem icon=\{Download\} disabled=\{!api\} onClick=\{handleExport\}>导出图片<\/MenuItem>/);
  assert.match(logoMenu, /downloadCanvasImageBlob\(blob\)/);
  assert.match(logoMenu, /画布中暂无可导出的内容/);
  assert.match(logoMenu, /导出图片失败，请稍后重试/);
  assert.doesNotMatch(logoMenu, /导出成功|图片已导出/);
  assert.match(editor, /import \{ exportCanvasImage \} from "\.\/canvas-export\.js"/);
  assert.match(editor, /export \{ exportCanvasImage \};/);
});
