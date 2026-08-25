import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listGeoPlatforms } from "../geo-platforms.ts";

describe("GEO platform registry", () => {
  it("returns the stable domestic model and AI search catalog", () => {
    const platforms = listGeoPlatforms();

    assert.deepEqual(platforms.map((item) => item.id), [
      "deepseek",
      "doubao",
      "baidu",
      "yuanbao",
      "kimi",
      "tongyi",
      "zhipu",
      "xinghuo",
      "quark",
      "metaso",
      "nami",
    ]);
    assert.equal(platforms.find((item) => item.id === "baidu")?.label, "百度文心助手");
    assert.equal(new Set(platforms.map((item) => item.id)).size, 11);
    assert.ok(platforms.every((item) => item.enabled && item.defaultSelected));
    assert.deepEqual(platforms.find((item) => item.id === "deepseek")?.monitoring, {
      mode: "official_api",
      providerNames: ["deepseek"],
    });
    assert.deepEqual(platforms.find((item) => item.id === "tongyi")?.monitoring, {
      mode: "official_api",
      providerNames: ["qwen", "dashscope", "aliyun-bailian"],
    });
    assert.equal(platforms.find((item) => item.id === "kimi")?.monitoring.mode, "manual_import");
  });
});
