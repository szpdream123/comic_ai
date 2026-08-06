import assert from "node:assert/strict";
import test from "node:test";

import { extractVideoBatchUrls, resolveVideoBatchCookiesPath, resolveVideoBatchLinks } from "../video-batch-resolver.service.ts";

test("extractVideoBatchUrls keeps only the four supported public platforms", () => {
  const urls = extractVideoBatchUrls([
    "https://v.douyin.com/example/",
    "https://www.xiaohongshu.com/explore/example",
    "https://v.kuaishou.com/example",
    "https://www.bilibili.com/video/BV1xx411c7mD",
    "https://www.youtube.com/watch?v=unsupported",
  ].join("\n"));
  assert.equal(urls.length, 4);
});

test("resolveVideoBatchLinks returns direct stream URLs without downloading media", async () => {
  const tasks = await resolveVideoBatchLinks({
    links: "https://www.bilibili.com/video/BV1xx411c7mD",
    runner: async () => ({ title: "公开视频", url: "https://media.example/video.mp4" }),
  });
  assert.deepEqual(tasks, [{
    sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
    status: "ready",
    title: "公开视频",
    error: "",
    streamUrl: "https://media.example/video.mp4",
  }]);
});

test("resolveVideoBatchLinks reports platform cookie limits per link", async () => {
  const tasks = await resolveVideoBatchLinks({
    links: "https://v.douyin.com/example/",
    runner: async () => { throw new Error("Fresh cookies are needed"); },
  });
  assert.match(tasks[0].error, /管理员配置有效的服务端 Cookie/);
});

test("resolveVideoBatchCookiesPath scopes the dedicated cookie file to Douyin", () => {
  const previousDouyin = process.env.VIDEO_BATCH_DOUYIN_COOKIES_FILE;
  const previousGeneric = process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE;
  process.env.VIDEO_BATCH_DOUYIN_COOKIES_FILE = "./secrets/douyin.cookies.txt";
  process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE = "./secrets/all-platforms.cookies.txt";
  try {
    assert.equal(resolveVideoBatchCookiesPath("https://v.douyin.com/example/"), "./secrets/douyin.cookies.txt");
    assert.equal(resolveVideoBatchCookiesPath("https://www.bilibili.com/video/BV1xx411c7mD"), "./secrets/all-platforms.cookies.txt");
  } finally {
    if (previousDouyin === undefined) delete process.env.VIDEO_BATCH_DOUYIN_COOKIES_FILE;
    else process.env.VIDEO_BATCH_DOUYIN_COOKIES_FILE = previousDouyin;
    if (previousGeneric === undefined) delete process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE;
    else process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE = previousGeneric;
  }
});
