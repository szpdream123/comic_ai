import assert from "node:assert/strict";
import test from "node:test";

async function withWindowLocation(location, callback) {
  const previousWindow = globalThis.window;
  globalThis.window = { location };
  try {
    return await callback();
  } finally {
    globalThis.window = previousWindow;
  }
}

test("createProject sends an idempotency key", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.createProject({
    name: "Project A",
    scriptInput: "Episode 1",
    aspectRatio: "9:16",
    resolution: "1080p",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/project/create");
  assert.match(calls[0].options.headers["idempotency-key"], /^project\.create:/);
});

test("video-to-director analysis and scene save use the existing toolbox and director contracts", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => "{}" };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.runToolboxVideoToDirector({
    displayName: "视觉模型",
    frameSheetDataUrls: ["data:image/webp;base64,AQID"],
    shotSegments: [{ startMs: 0, endMs: 1_000 }],
  });
  await creatorApi.saveDirectorDeskScene("desk/1", { version: 1 });

  assert.equal(calls[0].url, "/api/toolbox/prompt-reverse");
  assert.match(calls[0].options.headers["idempotency-key"], /^toolbox\.video-to-director:/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    displayName: "视觉模型",
    frameSheetDataUrls: ["data:image/webp;base64,AQID"],
    shotSegments: [{ startMs: 0, endMs: 1_000 }],
    mode: "video",
    analysisTarget: "director",
  });
  assert.equal(calls[1].url, "/api/director-desks/desk%2F1/scene");
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].options.body), { scene: { version: 1 } });
});

test("createCanvasProject forwards an explicit idempotency key outside the request body", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.createCanvasProject({
    title: "Refresh canvas",
    status: "草稿",
    idempotencyKey: "canvas-project.create:refresh-race",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/canvases");
  assert.equal(calls[0].options.headers["idempotency-key"], "canvas-project.create:refresh-race");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    title: "Refresh canvas",
    status: "草稿",
  });
});

test("getStandaloneCanvas always reads the latest saved document", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ canvas: { serverRevision: calls.length } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getStandaloneCanvas("canvas/latest");
  await creatorApi.getStandaloneCanvas("canvas/latest");

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/creator/canvases/canvas%2Flatest/document",
    "/api/creator/canvases/canvas%2Flatest/document",
  ]);
  assert.deepEqual(calls.map((call) => call.options.cache), ["no-store", "no-store"]);
});

test("tool preset API methods use the versioned creator REST contract", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => "{}" };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const topology = {
    schemaVersion: 1,
    nodes: [{ kind: "image", offsetX: 0, offsetY: 0 }],
    connections: [],
  };
  await creatorApi.listToolPresets();
  await creatorApi.getToolPreset("preset/1");
  await creatorApi.createToolPreset({ name: "我的工具", topology });
  await creatorApi.updateToolPreset("preset/1", { name: "新名称", topology });
  await creatorApi.duplicateToolPreset("preset/1", { name: "副本" });
  await creatorApi.listToolPresetVersions("preset/1");
  await creatorApi.getToolPresetVersion("preset/1", 2);
  await creatorApi.deleteToolPreset("preset/1");

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/creator/tool-presets?includeArchived=true",
    "/api/creator/tool-presets/preset%2F1",
    "/api/creator/tool-presets",
    "/api/creator/tool-presets/preset%2F1",
    "/api/creator/tool-presets/preset%2F1/duplicate",
    "/api/creator/tool-presets/preset%2F1/versions",
    "/api/creator/tool-presets/preset%2F1/versions/2",
    "/api/creator/tool-presets/preset%2F1",
  ]);
  assert.deepEqual(calls.map((call) => call.options.method ?? "GET"), [
    "GET", "GET", "POST", "PATCH", "POST", "GET", "GET", "DELETE",
  ]);
  assert.deepEqual(JSON.parse(calls[2].options.body), { name: "我的工具", topology });
  assert.match(calls[2].options.headers["idempotency-key"], /^canvas\.tool-preset\.create:/);
  assert.match(calls[4].options.headers["idempotency-key"], /^canvas\.tool-preset\.duplicate:/);
});

test("parseScript sends an idempotency key", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.parseScript();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/parse");
  assert.match(calls[0].options.headers["idempotency-key"], /^project\.parse:/);
});

test("task-center list forwards incremental query parameters", async () => {
  const calls = [];
  const timeoutDelays = [];
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => "{}" };
  };
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timeoutDelays.push(delay);
    return previousSetTimeout(callback, delay, ...args);
  }) as typeof setTimeout;

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.listTaskCenterTasks({
      pageSize: 50,
      updatedAfter: "2026-07-22T08:00:00.000Z",
      cursor: "cursor/value",
    });
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }

  assert.equal(
    calls[0].url,
    "/api/task-center/tasks?pageSize=50&updatedAfter=2026-07-22T08%3A00%3A00.000Z&cursor=cursor%2Fvalue",
  );
  assert.deepEqual(timeoutDelays, [60_000]);
});

test("task-center timeout covers reading the response body after receiving 200", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      }, { once: true });
    }),
  }) as Response;

  try {
    const { creatorApi } = await import(`../src/shared/creator-api.js?response-body-timeout=${Date.now()}`);
    await assert.rejects(
      () => creatorApi.listTaskCenterTasks({}, { timeoutMs: 10 }),
      (error) => error instanceof Error && error.message === "request_timeout",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("storyboard prompt packages request the compact creator payload", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ packages: [] }) };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getStoryboardPromptPackages();

  assert.equal(
    calls[0].url,
    "/api/creator/storyboard-prompt/packages?status=enabled&pageSize=500&compact=1",
  );
});

test("createImageGenerationTask forwards the existing asset id for retries", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.createImageGenerationTask({
    target: {
      kind: "team_asset",
      assetId: "team-asset-existing",
      category: "character",
      name: "团队角色",
    },
    prompt: "银发剑士",
    model: "gpt-image-2-cn",
    parameters: { aspectRatio: "16:9" },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/generation/image-tasks");
  assert.equal(JSON.parse(calls[0].options.body).target.assetId, "team-asset-existing");
});

test("read API calls coalesce duplicate in-flight requests", async () => {
  const calls = [];
  let resolveFetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    await new Promise((resolve) => {
      resolveFetch = resolve;
    });
    return {
      ok: true,
      text: async () => JSON.stringify({ projects: [] }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const first = creatorApi.getProjects();
  const second = creatorApi.getProjects();
  resolveFetch();
  const [firstPayload, secondPayload] = await Promise.all([first, second]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects?page=1&pageSize=18");
  assert.deepEqual(firstPayload, { projects: [] });
  assert.deepEqual(secondPayload, { projects: [] });
});

test("slow surface reads forward an already-aborted caller signal", async () => {
  const observedSignals = [];
  globalThis.fetch = async (_url, options = {}) => {
    observedSignals.push(options.signal);
    return {
      ok: true,
      text: async () => JSON.stringify({ projects: [], members: [], categories: [], assets: [] }),
    };
  };

  const controller = new AbortController();
  controller.abort();
  const { creatorApi } = await import(`../src/shared/creator-api.js?surface-abort=${Date.now()}`);

  assert.equal(creatorApi.getHomeRecommendations.length, 0);
  assert.equal(creatorApi.getTeamOverview.length, 0);
  assert.equal(creatorApi.getTeamMembers.length, 0);

  await creatorApi.getProjects({ signal: controller.signal });
  await creatorApi.getHomeRecommendations({ signal: controller.signal });
  await creatorApi.getTeamOverview({ signal: controller.signal });
  await creatorApi.getTeamMembers({ signal: controller.signal });
  await creatorApi.getLibraryAssets({ signal: controller.signal });

  assert.equal(observedSignals.length, 5);
  assert.deepEqual(observedSignals.map((signal) => signal?.aborted), [true, true, true, true, true]);
});

test("an aborted cached read does not cancel the next request for the same surface", async () => {
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(options);
    if (calls.length === 1) {
      await new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
      });
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ projects: [] }),
    };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?surface-reentry=${Date.now()}`);
  const firstController = new AbortController();
  const first = creatorApi.getProjects({ signal: firstController.signal });
  firstController.abort();

  const secondController = new AbortController();
  const second = creatorApi.getProjects({ signal: secondController.signal });
  const [firstResult, secondResult] = await Promise.allSettled([first, second]);

  assert.equal(firstResult.status, "rejected");
  assert.equal(firstResult.reason?.name, "AbortError");
  assert.equal(secondResult.status, "fulfilled");
  assert.equal(calls.length, 2);
});

test("aborting one surface read does not cancel a concurrent consumer of the same resource", async () => {
  const calls = [];
  const releases = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(options);
    return new Promise((resolve, reject) => {
      releases.push(() => resolve({
        ok: true,
        text: async () => JSON.stringify({ projects: [] }),
      }));
      options.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      }, { once: true });
    });
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?surface-consumers=${Date.now()}`);
  const firstController = new AbortController();
  const first = creatorApi.getProjects({ signal: firstController.signal });
  const second = creatorApi.getProjects();
  firstController.abort();
  releases[1]?.();
  const [firstResult, secondResult] = await Promise.allSettled([first, second]);

  assert.equal(firstResult.status, "rejected");
  assert.equal(firstResult.reason?.name, "AbortError");
  assert.equal(secondResult.status, "fulfilled");
  assert.equal(calls.length, 2);
});

test("getInviteSummary targets the authenticated invite summary route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ inviteCode: "ABCD12" }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const payload = await creatorApi.getInviteSummary();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/invite-summary");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(payload, { inviteCode: "ABCD12" });
});

test("getAnnouncements reads the public announcement route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "announcement-request-1",
        data: {
          announcements: [{ id: "announcement-1", title: "平台公告" }],
          version: "2026-07-17T05:56:48.039Z",
        },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const payload = await creatorApi.getAnnouncements();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/announcements");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(payload.announcements[0]?.title, "平台公告");
  assert.equal(payload.version, "2026-07-17T05:56:48.039Z");
});

test("fresh home recommendations always use browser conditional revalidation", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ categories: [], background: null }),
    };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?fresh-home=${Date.now()}`);
  await creatorApi.getHomeRecommendations({ fresh: true });
  await creatorApi.getHomeRecommendations({ fresh: true });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/home-recommendations",
    "/api/home-recommendations",
  ]);
  assert.deepEqual(calls.map((call) => call.options.cache), ["no-cache", "no-cache"]);
});

test("catalog reads reuse the TTL cache until a write invalidates it", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ configs: [], categories: [], requestId: "cache-test" }),
    };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?catalog-cache=${Date.now()}`);
  await creatorApi.getHomeRecommendations();
  await creatorApi.getHomeRecommendations();
  await creatorApi.listCanvasUserConfigs({ type: "character" });
  await creatorApi.listCanvasUserConfigs({ type: "character" });
  await creatorApi.createCanvasUserConfig({ type: "character", name: "角色配置" });
  await creatorApi.listCanvasUserConfigs({ type: "character" });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/home-recommendations",
    "/api/canvas-library/configs?type=character",
    "/api/canvas-library/configs",
    "/api/canvas-library/configs?type=character",
  ]);
});

test("prompt skill catalog uses a longer cache than a personal skill library", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ items: [] }) };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?prompt-skill-cache=${Date.now()}`);
  await creatorApi.getPromptSkills({ source: "official", category: "script" });
  await creatorApi.getPromptSkills({ source: "official", category: "script" });
  await creatorApi.getPromptSkills({ source: "private", category: "script" });
  await creatorApi.getPromptSkills({ source: "private", category: "script" });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/creator/prompt-skills/catalog?category=script&page=1&pageSize=12",
    "/api/creator/prompt-skills/library?category=script&page=1&pageSize=12",
  ]);
});

test("image-style skill requests use the prompt-content cache variant", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ items: [] }) };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?prompt-skill-content-cache=${Date.now()}`);
  await creatorApi.getPromptSkills({ source: "official", category: "image_style" });
  await creatorApi.getPromptSkills({ source: "official", category: "image_style" });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/creator/prompt-skills/catalog?category=image_style&page=1&pageSize=12&includeContent=1",
  ]);
});

test("prompt reverse allows image models enough time to complete", async () => {
  const timeoutCalls = [];
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  globalThis.fetch = async () => ({ ok: true, text: async () => "{}" });
  globalThis.setTimeout = ((callback, delay) => {
    timeoutCalls.push(delay);
    return previousSetTimeout(callback, 0);
  });
  globalThis.clearTimeout = ((timeoutId) => previousClearTimeout(timeoutId));
  try {
    const { creatorApi } = await import(`../src/shared/creator-api.js?prompt-reverse-timeout=${Date.now()}`);
    await creatorApi.runToolboxPromptReverse({
      modelCode: "cumob-gpt-5-6-sol",
      mode: "image",
      imageDataUrl: "data:image/png;base64,AAAA",
    });
    assert.ok(timeoutCalls.includes(600000));
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }
});

test("selectProject preserves unrelated read caches", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify(
        String(url) === "/api/public/customer-support"
          ? { data: { contact: "cached-support" } }
          : { project: { id: "project-2" } },
      ),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const firstSupport = await creatorApi.getCustomerSupportConfig();
  await creatorApi.getAssetLibrary("project-1");
  await creatorApi.selectProject({ projectId: "project-2" });
  const secondSupport = await creatorApi.getCustomerSupportConfig();
  await creatorApi.getAssetLibrary("project-1");

  assert.deepEqual(firstSupport, { contact: "cached-support" });
  assert.deepEqual(secondSupport, firstSupport);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/public/customer-support",
    "/api/creator/assets/library?projectId=project-1",
    "/api/creator/project/select",
    "/api/creator/assets/library?projectId=project-1",
  ]);
});

test("first-login onboarding public config is cached independently", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ data: { welcome: { title: "后台标题" }, tips: [] } }),
    };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?onboarding-config=${Date.now()}`);
  const first = await creatorApi.getFirstLoginOnboardingConfig();
  const second = await creatorApi.getFirstLoginOnboardingConfig();

  assert.deepEqual(first, { welcome: { title: "后台标题" }, tips: [] });
  assert.deepEqual(second, first);
  assert.deepEqual(calls.map((call) => call.url), ["/api/public/first-login-onboarding"]);
});

test("selectProject prevents stale asset refreshes from repopulating invalidated caches", async () => {
  const previousNow = Date.now;
  let now = previousNow();
  let assetCalls = 0;
  let resolveStaleRefresh;
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/creator/project/select") {
      return { ok: true, text: async () => "{}" };
    }
    assetCalls += 1;
    if (assetCalls === 2) {
      return new Promise((resolve) => {
        resolveStaleRefresh = () => resolve({
          ok: true,
          text: async () => JSON.stringify({ assets: ["stale"] }),
        });
      });
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ assets: [assetCalls === 1 ? "initial" : "fresh"] }),
    };
  };

  try {
    Date.now = () => now;
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.getAssetLibrary("project-cache-race");
    now += 6000;
    assert.deepEqual(await creatorApi.getAssetLibrary("project-cache-race"), { assets: ["initial"] });
    await creatorApi.selectProject({ projectId: "project-2" });
    resolveStaleRefresh();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(await creatorApi.getAssetLibrary("project-cache-race"), { assets: ["fresh"] });
    assert.equal(assetCalls, 3);
  } finally {
    Date.now = previousNow;
  }
});

test("fresh session reads bypass the cached account balance", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ user: { availableCredits: calls.length } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const first = await creatorApi.getSession({ fresh: true });
  const second = await creatorApi.getSession({ fresh: true });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/auth/session");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[1].options.cache, "no-store");
  assert.equal(first.user.availableCredits, 1);
  assert.equal(second.user.availableCredits, 2);
});

test("cached session reads do not silently request the session endpoint again", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ user: { id: "user-session-cache" } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const first = await creatorApi.getSession();
  const second = await creatorApi.getSession();
  const third = await creatorApi.getSession();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/session");
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});

test("profile and password updates invalidate the cached session", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ user: { displayName: `用户 ${calls.length}` } }),
    };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?session-invalidation=${Date.now()}`);
  await creatorApi.getSession();
  await creatorApi.updateAccountProfile({ displayName: "已更新" });
  const updatedProfileSession = await creatorApi.getSession();
  await creatorApi.changeAccountPassword({ currentPassword: "old-password", newPassword: "new-password" });
  const updatedPasswordSession = await creatorApi.getSession();

  assert.deepEqual(updatedProfileSession, { user: { displayName: "用户 3" } });
  assert.deepEqual(updatedPasswordSession, { user: { displayName: "用户 5" } });
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/auth/session",
    "/api/auth/profile",
    "/api/auth/session",
    "/api/auth/password",
    "/api/auth/session",
  ]);
});

test("batch generation task reads preserve unrelated read caches", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ items: [] }) };
  };

  const { creatorApi } = await import(`../src/shared/creator-api.js?batch-read-cache=${Date.now()}`);
  const controller = new AbortController();
  await creatorApi.getCustomerSupportConfig();
  await creatorApi.getGenerationTasks(["task-1", "task-1"], { signal: controller.signal });
  await creatorApi.getCustomerSupportConfig();

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/public/customer-support",
    "/api/generation-tasks/batch",
  ]);
  assert.deepEqual(JSON.parse(calls[1].options.body), { taskIds: ["task-1"] });
});

test("batch generation task reads honor caller cancellation", async () => {
  globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener?.(
      "abort",
      () => reject(new DOMException("aborted", "AbortError")),
      { once: true },
    );
    setTimeout(() => {
      resolve({ ok: true, text: async () => JSON.stringify({ items: [] }) });
    }, 25);
  });

  const { creatorApi } = await import(`../src/shared/creator-api.js?batch-read-abort=${Date.now()}`);
  const controller = new AbortController();
  const request = creatorApi.getGenerationTasks(["task-1"], { signal: controller.signal });
  controller.abort();

  await assert.rejects(request, (error) => error?.name === "AbortError");
});

test("getCreditBalance reads the dedicated balance endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ availableCredits: 2036 }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const payload = await creatorApi.getCreditBalance();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/credit-balance");
  assert.notEqual(calls[0].options.cache, "no-store");
  assert.equal(payload.availableCredits, 2036);
});

test("getProjects sends backend pagination query parameters", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ projects: [], pagination: { page: 2, pageSize: 18, total: 19, totalPages: 2 } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const payload = await creatorApi.getProjects({ page: 2, keyword: "龙珠" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects?page=2&pageSize=18&keyword=%E9%BE%99%E7%8F%A0");
  assert.deepEqual(payload.pagination, { page: 2, pageSize: 18, total: 19, totalPages: 2 });
});

test("Canvas resource helpers use the formal canvases API", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: {} }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listCanvases({ includeDeleted: true });
  await creatorApi.createCanvas({ title: "API 画布" });
  await creatorApi.getCanvas("canvas/1");
  await creatorApi.updateCanvasProject("canvas/1", { title: "API 画布 2" });
  await creatorApi.getCanvasDocument("canvas/1");
  await creatorApi.saveCanvasDocument("canvas/1", { clientRevision: 1, document: {} });
  await creatorApi.listCanvasRevisions("canvas/1", { limit: 20, beforeRevision: 5 });
  await creatorApi.getCanvasRevision("canvas/1", "revision/1");
  await creatorApi.deleteCanvasProject("canvas/1");
  await creatorApi.restoreCanvas("canvas/1", { idempotencyKey: "restore-key" });

  assert.deepEqual(calls.map((call) => [call.url, call.options.method ?? "GET"]), [
    ["/api/creator/canvases?includeDeleted=true", "GET"],
    ["/api/creator/canvases", "POST"],
    ["/api/creator/canvases/canvas%2F1", "GET"],
    ["/api/creator/canvases/canvas%2F1", "PATCH"],
    ["/api/creator/canvases/canvas%2F1/document", "GET"],
    ["/api/creator/canvases/canvas%2F1/document", "PUT"],
    ["/api/creator/canvases/canvas%2F1/revisions?limit=20&beforeRevision=5", "GET"],
    ["/api/creator/canvases/canvas%2F1/revisions/revision%2F1", "GET"],
    ["/api/creator/canvases/canvas%2F1", "DELETE"],
    ["/api/creator/canvases/canvas%2F1/restore", "POST"],
  ]);
  assert.equal(calls[9].options.headers["idempotency-key"], "restore-key");
});

test("getPromptMarketplace forwards filters and backend pagination", async () => {
  const calls: Array<{ url: string }> = [];
  globalThis.fetch = async (url) => {
    calls.push({ url: String(url) });
    return {
      ok: true,
      text: async () => JSON.stringify({
        items: [],
        ranking: [],
        pagination: { page: 3, pageSize: 12, total: 40, totalPages: 4 },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const payload = await creatorApi.getPromptMarketplace({
    category: "storyboard",
    query: "高燃 分镜",
    page: 3,
    pageSize: 12,
  });

  assert.equal(
    calls[0]?.url,
    "/api/creator/prompt-marketplace?category=storyboard&query=%E9%AB%98%E7%87%83+%E5%88%86%E9%95%9C&page=3&pageSize=12",
  );
  assert.deepEqual(payload.pagination, { page: 3, pageSize: 12, total: 40, totalPages: 4 });
});

test("getPromptMarketplace deduplicates concurrent identical requests", async () => {
  const calls: Array<{ url: string }> = [];
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  globalThis.fetch = async (url) => {
    calls.push({ url: String(url) });
    await fetchGate;
    return {
      ok: true,
      text: async () => JSON.stringify({
        items: [],
        ranking: [],
        pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const input = { category: "scene_extract", query: "并发请求去重", page: 1, pageSize: 12 };
  const first = creatorApi.getPromptMarketplace(input);
  const second = creatorApi.getPromptMarketplace(input);
  await Promise.resolve();

  assert.equal(calls.length, 1);
  releaseFetch();
  await Promise.all([first, second]);
});

test("importEpisodeAsset targets the episode-scoped import route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.importEpisodeAsset("episode/1", {
    assetType: "scene",
    name: "废土街角",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/episodes/episode%2F1/assets/import");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
});

test("deleteAssetConversationTurn targets the episode asset conversation turn route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.deleteAssetConversationTurn("episode/1", "asset/1", "task/1", "image");

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation/messages/task%2F1?mediaMode=image",
  );
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.credentials, "include");
});

test("billing write routes send idempotency keys", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.createBillingOrder({ creditPackageId: "pkg-1" });
  await creatorApi.createPaymentIntent({
    orderId: "order-1",
    provider: "wechat_pay",
    productMode: "native_qr",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/billing/orders");
  assert.match(calls[0].options.headers["idempotency-key"], /^billing\.order\.create:/);
  assert.equal(calls[1].url, "/api/billing/payment-intents");
  assert.match(calls[1].options.headers["idempotency-key"], /^billing\.intent\.create:/);
});

test("project member create targets the project-scoped route and sends an idempotency key", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.createProjectMember("project/1", {
    phone: "13800138001",
    role: "creator",
    note: "分镜协作",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/members");
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.headers["idempotency-key"], /^project\.member\.create:/);
});

test("project member update targets the member-scoped route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.updateProjectMember("project/1", "member/1", {
    role: "viewer",
    status: "disabled",
    note: "只读",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/members/member%2F1");
  assert.equal(calls[0].options.method, "PATCH");
});

test("script helpers target script-scoped routes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "request-1",
        data: { ok: true },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getScriptReaderSections("script/1");
  await creatorApi.createScriptReaderSection("script/1", { title: "第一章", body: "正文" });
  await creatorApi.updateScriptReaderSection("script/1", "section/1", { title: "新标题" });
  await creatorApi.deleteScriptReaderSection("script/1", "section/1");
  await creatorApi.updateScriptCard("script/1", { title: "独立剧本" });
  await creatorApi.deleteScriptCard("script/1");

  assert.equal(calls.length, 6);
  assert.equal(calls[0].url, "/api/creator/scripts/script%2F1/sections");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].url, "/api/creator/scripts/script%2F1/sections/section%2F1");
  assert.equal(calls[2].options.method, "PATCH");
  assert.equal(calls[3].options.method, "DELETE");
  assert.equal(calls[4].url, "/api/creator/scripts/script%2F1");
  assert.equal(calls[4].options.method, "PATCH");
  assert.equal(calls[5].options.method, "DELETE");
});

test("canvas node history helpers target canvas-scoped routes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "request-1",
        data: { ok: true },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.runCanvasNode("canvas/1", "node/1", { prompt: "frame" }, { idempotencyKey: "run-key" });
  await creatorApi.listCanvasNodeRuns("canvas/1", "node/1");
  await creatorApi.selectCanvasNodeArtifact("canvas/1", "artifact/1", { selectionRole: "current" });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/canvas/canvas%2F1/nodes/node%2F1/run",
    "/api/canvas/canvas%2F1/nodes/node%2F1/runs",
    "/api/canvas/canvas%2F1/artifacts/artifact%2F1/select",
  ]);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["idempotency-key"], "run-key");
  assert.equal(calls[1].options.method, undefined);
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), { selectionRole: "current" });
});

test("Canvas director binding creates a real director desk through the authenticated API", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { desk: { id: "desk-1" } } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listDirectorDesks();
  await creatorApi.createDirectorDesk({ name: "场景调度 导演台" });

  assert.equal(calls[0].url, "/api/director-desks");
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[1].url, "/api/director-desks");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), { name: "场景调度 导演台" });
});

test("Canvas generation history supports scoped bulk deletion", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { deletedCount: 2 } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.deleteCanvasGenerationHistory("canvas/1", { scope: "node", nodeKey: "node/1" });

  assert.equal(calls[0].url, "/api/canvas/canvas%2F1/generation-history");
  assert.equal(calls[0].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[0].options.body), { scope: "node", nodeKey: "node/1" });
});

test("Canvas settings helpers use the canvas-scoped revision route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { revision: 2 } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getCanvasSettings("canvas/1");
  await creatorApi.updateCanvasSettings("canvas/1", {
    expectedRevision: 1,
    patch: { promptSuffixes: { image: "detail" } },
  });

  assert.deepEqual(calls.map((call) => [call.url, call.options.method]), [
    ["/api/canvas/canvas%2F1/settings", undefined],
    ["/api/canvas/canvas%2F1/settings", "PATCH"],
  ]);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    expectedRevision: 1,
    patch: { promptSuffixes: { image: "detail" } },
  });
});

test("Canvas character library helpers preserve scope, ids, and revision bodies", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { character: {} } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listCanvasCharacters("canvas/1", { scope: "global", limit: 20 });
  await creatorApi.getCanvasCharacter("canvas/1", "character/1");
  await creatorApi.createCanvasCharacter("canvas/1", { scope: "canvas", name: "角色" });
  await creatorApi.updateCanvasCharacter("canvas/1", "character/1", { expectedRevision: 1, patch: { name: "角色 2" } });
  await creatorApi.copyCanvasCharacter("canvas/1", "character/1", { expectedRevision: 2, targetScope: "global" });
  await creatorApi.addCanvasCharacterReference("canvas/1", "character/1", { expectedRevision: 2, reference: { storageObjectId: "storage-1" } });
  await creatorApi.updateCanvasCharacterReference("canvas/1", "character/1", "reference/1", { expectedRevision: 3, patch: { primary: true } });
  await creatorApi.deleteCanvasCharacterReference("canvas/1", "character/1", "reference/1", { expectedRevision: 4 });
  await creatorApi.deleteCanvasCharacter("canvas/1", "character/1", { expectedRevision: 5 });

  assert.deepEqual(calls.map((call) => [call.url, call.options.method]), [
    ["/api/canvas/canvas%2F1/characters?scope=global&limit=20", undefined],
    ["/api/canvas/canvas%2F1/characters/character%2F1", undefined],
    ["/api/canvas/canvas%2F1/characters", "POST"],
    ["/api/canvas/canvas%2F1/characters/character%2F1", "PATCH"],
    ["/api/canvas/canvas%2F1/characters/character%2F1/copy", "POST"],
    ["/api/canvas/canvas%2F1/characters/character%2F1/references", "POST"],
    ["/api/canvas/canvas%2F1/characters/character%2F1/references/reference%2F1", "PATCH"],
    ["/api/canvas/canvas%2F1/characters/character%2F1/references/reference%2F1", "DELETE"],
    ["/api/canvas/canvas%2F1/characters/character%2F1", "DELETE"],
  ]);
  assert.deepEqual(JSON.parse(calls[7].options.body), { expectedRevision: 4 });
  assert.deepEqual(JSON.parse(calls[8].options.body), { expectedRevision: 5 });
});

test("Canvas Agent model catalog targets the canvas-scoped eligible model route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { models: [] } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listCanvasAgentModels("canvas/1");
  await creatorApi.listCanvasAgentModels("canvas/1");
  assert.equal(calls[0].url, "/api/canvas/canvas%2F1/agent-models");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.cache, undefined);
  assert.equal(calls.length, 1);
});

test("Canvas Agent conversation aliases expose list, update, and delete lifecycle routes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ data: {} }) };
  };
  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listCanvasAgentConversations("canvas/1", { limit: 20 });
  await creatorApi.updateCanvasAgentConversation("canvas/1", { conversationId: "conversation/1", status: "archived" });
  await creatorApi.listCanvasAgentMessages("canvas/1", "conversation/1", { limit: 40 });
  await creatorApi.listCanvasAgentFileGrants("canvas/1", "conversation/1", { includeInactive: true });
  await creatorApi.createCanvasAgentFileGrant("canvas/1", "conversation/1", { storageObjectId: "storage/1", purpose: "reference" });
  await creatorApi.revokeCanvasAgentFileGrant("canvas/1", "conversation/1", "grant/1");
  await creatorApi.deleteCanvasAgentConversation("canvas/1", "conversation/1");
  await creatorApi.rewindCanvasAgentTask("canvas/1", "task/1");
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/canvas/canvas%2F1/conversations?limit=20",
    "/api/canvas/canvas%2F1/conversations",
    "/api/canvas/canvas%2F1/conversations/conversation%2F1/messages?limit=40",
    "/api/canvas/canvas%2F1/conversations/conversation%2F1/file-grants?includeInactive=true",
    "/api/canvas/canvas%2F1/conversations/conversation%2F1/file-grants",
    "/api/canvas/canvas%2F1/conversations/conversation%2F1/file-grants/grant%2F1",
    "/api/canvas/canvas%2F1/conversations?conversationId=conversation%2F1",
    "/api/canvas/canvas%2F1/agent-tasks/task%2F1/rewind",
  ]);
  assert.equal(calls[1].options.method, "PATCH");
  assert.equal(calls[2].options.cache, "no-store");
  assert.equal(calls[3].options.cache, "no-store");
  assert.equal(calls[4].options.method, "POST");
  assert.equal(calls[5].options.method, "DELETE");
  assert.equal(calls[6].options.method, "DELETE");
});

test("Canvas Agent memory aliases preserve filters and scoped record mutations", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ data: {} }) };
  };
  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.listCanvasAgentMemories("canvas/1", "conversation/1", {
    includeInactive: true,
    category: "preference",
    source: "agent_task",
  });
  await creatorApi.updateCanvasAgentMemory("canvas/1", "conversation/1", "memory/1", {
    key: "preference.style",
    value: { text: "水墨" },
    category: "preference",
    status: "active",
  });
  await creatorApi.deleteCanvasAgentMemory("canvas/1", "conversation/1", "memory/1");
  assert.deepEqual(calls.map((call) => [call.url, call.options.method]), [
    ["/api/canvas/canvas%2F1/conversations/conversation%2F1/memories?includeInactive=true&category=preference&source=agent_task", undefined],
    ["/api/canvas/canvas%2F1/conversations/conversation%2F1/memories/memory%2F1", "PATCH"],
    ["/api/canvas/canvas%2F1/conversations/conversation%2F1/memories/memory%2F1", "DELETE"],
  ]);
  assert.equal(calls[0].options.cache, "no-store");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    key: "preference.style",
    value: { text: "水墨" },
    category: "preference",
    status: "active",
  });
});

test("Canvas media and config aliases target the new Canvas routes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => JSON.stringify({ data: {} }) };
  };
  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.startCanvasMediaDerivation("canvas/1", { derivationType: "crop" });
  await creatorApi.getCanvasMediaDerivation("canvas/1", "derivation/1");
  await creatorApi.attachCanvasMediaDerivationTask("canvas/1", "derivation/1", "task/1");
  await creatorApi.createCanvasImageBatchGroup("canvas/1", { artifacts: [] });
  await creatorApi.createCanvasAnnotationLayer("canvas/1", { layerKind: "mask" });
  await creatorApi.listCanvasAnnotationLayers("canvas/1", { nodeKey: "node/1", includeInactive: true, limit: 25 });
  await creatorApi.getCanvasStorageHealth("canvas/1");
  await creatorApi.startCanvasCardSnapshot("canvas/1", { canvasRevision: 2 });
  await creatorApi.getCanvasSession("canvas/1");
  await creatorApi.saveCanvasSession("canvas/1", { viewport: { x: 0, y: 0, zoom: 1 } });
  await creatorApi.createCanvasUserConfigVersion("config/1", { manifest: {} });
  await creatorApi.archiveCanvasUserConfig("config/1");
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/canvas/canvas%2F1/derivations",
    "/api/canvas/canvas%2F1/derivations/derivation%2F1",
    "/api/canvas/canvas%2F1/derivations/derivation%2F1/attach-task",
    "/api/canvas/canvas%2F1/image-batch-groups",
    "/api/canvas/canvas%2F1/annotation-layers",
    "/api/canvas/canvas%2F1/annotation-layers?nodeKey=node%2F1&includeInactive=true&limit=25",
    "/api/canvas/canvas%2F1/storage-health",
    "/api/canvas/canvas%2F1/card-snapshots",
    "/api/canvas/canvas%2F1/session",
    "/api/canvas/canvas%2F1/session",
    "/api/canvas-library/configs/config%2F1/versions",
    "/api/canvas-library/configs/config%2F1",
  ]);
  assert.equal(calls[9].options.method, "PUT");
  assert.equal(calls[9].options.keepalive, true);
});

test("billing read routes target explicit order and payment intent resources", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getBillingOrder("order/1");
  await creatorApi.getPaymentIntent("intent/1");

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/billing/orders/order%2F1");
  assert.equal(calls[1].url, "/api/billing/payment-intents/intent%2F1");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[1].options.credentials, "include");
});

test("creator api exposes membership plans, status, and order creation", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ requestId: "request-1", data: { ok: true } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getMembershipPlans();
  await creatorApi.getMembershipStatus();
  await creatorApi.createMembershipOrder(
    { membershipPlanId: "plan-1" },
    { idempotencyKey: "membership-order-key" },
  );

  assert.equal(calls[0].url, "/api/membership/plans");
  assert.equal(calls[1].url, "/api/membership/status");
  assert.equal(calls[2].url, "/api/membership/orders");
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.headers["idempotency-key"], "membership-order-key");
});

test("generation queue health targets the admin ops queue endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ status: "healthy", queues: [] }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.getGenerationQueueHealth();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/ops/generation-queues");
  assert.equal(calls[0].options.credentials, "include");
});

test("ai storyboard preview uses a 180 second request timeout", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timers.push(delay);
    return previousSetTimeout(callback, 0, ...args);
  });
  globalThis.clearTimeout = ((timeoutId) => previousClearTimeout(timeoutId));

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.createAiStoryboardPreview("project/1", {
      scriptText: "test",
      packages: {},
    });
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/ai-storyboard-preview");
  assert.equal(timers[0], 180000);
  assert.equal(typeof calls[0].options.headers["idempotency-key"], "string");
});

test("image task creation keeps a 60 second response window", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ taskId: "image-task-1", status: "queued" }),
  });

  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timers.push(delay);
    return previousSetTimeout(callback, 0, ...args);
  });
  globalThis.clearTimeout = ((timeoutId) => previousClearTimeout(timeoutId));

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.createImageGenerationTask({
      target: { kind: "episode_asset", episodeId: "episode-1", targetId: "asset-1" },
      prompt: "test",
    });
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }

  assert.equal(timers[0], 60000);
});

test("video and canvas task creation keep a 60 second response window", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ taskId: "video-task-1", status: "queued" }),
  });

  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timers.push(delay);
    return previousSetTimeout(callback, 0, ...args);
  });
  globalThis.clearTimeout = ((timeoutId) => previousClearTimeout(timeoutId));

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.createVideoTask("episode-1", { prompt: "test" });
    await creatorApi.generateVideos({ motionPrompt: "test" });
    await creatorApi.runCanvasNode("canvas-1", "video-node-1", { kind: "video", motionPrompt: "test" });
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }

  assert.deepEqual(timers, [60000, 60000, 60000]);
});

test("video task retries reuse the same idempotency key until a response succeeds", async () => {
  const keys = [];
  let requestCount = 0;
  globalThis.fetch = async (_url, options = {}) => {
    keys.push(options.headers["idempotency-key"]);
    requestCount += 1;
    if (requestCount === 1) {
      throw new TypeError("network connection lost");
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ taskId: `video-task-${requestCount}`, status: "queued" }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    creatorApi.createVideoTask("episode-idempotency", { prompt: "same request" }),
    /network connection lost/,
  );
  await creatorApi.createVideoTask("episode-idempotency", { prompt: "same request" });
  await creatorApi.createVideoTask("episode-idempotency", { prompt: "same request" });

  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test("commit ai storyboard preview targets the project preview commit route", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "request-1",
        data: { episode: { id: "episode-1" } },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const result = await creatorApi.commitAiStoryboardPreview("project/1", {
    episodeTitle: "第 1 集",
    commitPayload: { storyboards: [{ plot: "分镜" }] },
  });

  assert.equal(result.episode.id, "episode-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/ai-storyboard-preview/commit");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    episodeTitle: "第 1 集",
    commitPayload: { storyboards: [{ plot: "分镜" }] },
  });
});

test("streaming ai storyboard preview does not create a fixed abort timeout", async () => {
  const previousFetch = globalThis.fetch;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timeoutDelays = [];
  const encoded = new TextEncoder().encode('data: {"type":"ping","ts":"2026-06-19T00:00:00.000Z"}\n\n');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  globalThis.fetch = async () => ({
    ok: true,
    body: stream,
  });
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timeoutDelays.push(delay);
    return previousSetTimeout(callback, 0, ...args);
  });
  globalThis.clearTimeout = ((timeoutId) => previousClearTimeout(timeoutId));

  try {
    const { creatorApiTestHooks } = await import("../src/shared/creator-api.js");
    const events = [];
    for await (const event of creatorApiTestHooks.postJsonSse("/api/stream", { prompt: "long" })) {
      events.push(event);
    }

    assert.deepEqual(events, [{ event: "ping", data: { type: "ping", ts: "2026-06-19T00:00:00.000Z" } }]);
    assert.deepEqual(timeoutDelays, []);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
  }
});

test("Canvas Agent GET SSE preserves event ids and sends the resume cursor", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const encoded = new TextEncoder().encode(
    'id: 7\nevent: task.started\ndata: {"sequence":7,"eventType":"task.started","event":{}}\n\n',
  );
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options]);
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      }),
    };
  };
  try {
    const { creatorApiTestHooks } = await import("../src/shared/creator-api.js");
    const events = [];
    for await (const event of creatorApiTestHooks.getSse("/api/canvas/canvas-1/agent-tasks/task-1/events?live=1", {
      headers: { "last-event-id": "6" },
    })) {
      events.push(event);
    }
    assert.deepEqual(events, [{
      event: "task.started",
      id: "7",
      data: { sequence: 7, eventType: "task.started", event: {} },
    }]);
    assert.equal(calls[0][1].headers["last-event-id"], "6");
    assert.equal(calls[0][1].headers.accept, "text/event-stream");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Canvas live SSE sends Last-Event-ID and preserves revision event ids", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const encoded = new TextEncoder().encode(
    'id: revision-12\ndata: {"type":"revision","eventId":"revision-12","serverRevision":12}\n\n',
  );
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      }),
    };
  };
  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    const events = [];
    for await (const event of creatorApi.streamCanvasLive("canvas/1", { lastEventId: "revision-11" })) {
      events.push(event);
    }

    assert.equal(calls[0].url, "/api/canvas/canvas%2F1/live");
    assert.equal(calls[0].options.headers["last-event-id"], "revision-11");
    assert.equal(calls[0].options.headers.accept, "text/event-stream");
    assert.deepEqual(events, [{
      event: "revision",
      id: "revision-12",
      data: { type: "revision", eventId: "revision-12", serverRevision: 12 },
    }]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("streaming ai storyboard preview surfaces backend error details", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({
      requestId: "req-1",
      error: {
        code: "membership_required",
        message: "请充值会员。",
        details: { plan: "none" },
      },
    }),
  });

  try {
    const { creatorApiTestHooks } = await import("../src/shared/creator-api.js");
    await assert.rejects(
      async () => {
        for await (const _event of creatorApiTestHooks.postJsonSse("/api/stream", {})) {
          // consume stream
        }
      },
      (error) => {
        assert.equal(error.message, "请充值会员。");
        assert.equal(error.errorCode, "membership_required");
        assert.equal(error.status, 403);
        assert.equal(error.requestId, "req-1");
        assert.deepEqual(error.details, { plan: "none" });
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("streaming ai storyboard preview requests include an idempotency key header", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  const encoded = new TextEncoder().encode('data: {"type":"complete"}\n\n');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      body: stream,
    };
  };

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    for await (const _event of creatorApi.createAiStoryboardPreviewStream("project/1", { scriptText: "x", packages: {} })) {
      // consume stream
    }
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/ai-storyboard-preview?stream=1");
  assert.equal(typeof calls[0].options.headers["idempotency-key"], "string");
});

test("generation queue job ops targets the admin ops queue job endpoint with idempotency", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        queueName: "generation-submit-video",
        jobId: "job-1",
        action: "retry",
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.operateGenerationQueueJob(
    {
      queueName: "generation-submit-video",
      jobId: "job-1",
      action: "retry",
      reason: "Seedance worker recovered.",
    },
    { idempotencyKey: "queue-job-key" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/admin/ops/generation-queues/jobs");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["idempotency-key"], "queue-job-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    queueName: "generation-submit-video",
    jobId: "job-1",
    action: "retry",
    reason: "Seedance worker recovered.",
  });
});

test("staged generation retries target admin ops task endpoints with idempotency", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({ task: { id: "task-1" } }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.retryGenerationFinalize(
    { taskId: "task-1", reason: "retry finalize" },
    { idempotencyKey: "retry-finalize-key" },
  );
  await creatorApi.retryGenerationPersistAsset(
    { taskId: "task-1", reason: "retry persist" },
    { idempotencyKey: "retry-persist-key" },
  );

  assert.equal(calls[0].url, "/api/admin/ops/tasks/retry-finalize");
  assert.equal(calls[0].options.headers["idempotency-key"], "retry-finalize-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    taskId: "task-1",
    reason: "retry finalize",
  });
  assert.equal(calls[1].url, "/api/admin/ops/tasks/retry-persist-asset");
  assert.equal(calls[1].options.headers["idempotency-key"], "retry-persist-key");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    taskId: "task-1",
    reason: "retry persist",
  });
});

test("deleteShotMedia targets explicit shot media resource when assetVersionId is provided", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => "{}",
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await creatorApi.deleteShotMedia("shot/1", {
    kind: "image",
    assetVersionId: "asset/version-1",
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "/api/creator/shots/shot%2F1/media/asset%2Fversion-1?kind=image",
  );
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(calls[0].options.credentials, "include");
});

test("deleteFileResource treats an already missing resource as a recoverable result", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({
        errorCode: "resource_not_found",
        message: "资源不存在或已被删除。",
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const result = await creatorApi.deleteFileResource("episode/1", "file/1", {
    assetVersionId: "asset-version-1",
    storageObjectId: "file/1",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/episodes/episode%2F1/file-resources/file%2F1");
  assert.equal(calls[0].options.method, "DELETE");
  assert.deepEqual(result, { deleted: false, missing: true });
});

test("deleteShotMedia treats missing shot media as a recoverable result", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: "shot_media_not_found" }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const result = await creatorApi.deleteShotMedia("shot-1", {
    kind: "video",
    assetVersionId: "video-version-1",
  });

  assert.deepEqual(result, { deleted: false, missing: true });
});

test("team overview hides non-JSON API responses behind a controlled error", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    url: "/api/creator/team/overview",
    headers: {
      get: () => "text/html; charset=utf-8",
    },
    text: async () => "<!doctype html><html><body>login</body></html>",
  });

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await assert.rejects(
      () => creatorApi.getTeamOverview(),
      (error) => {
        assert.equal(error.message, "unexpected_response");
        assert.equal(error.errorCode, "unexpected_response");
        assert.equal(error.status, 200);
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("uploadFile retries transient complete failures without aborting the stored object", async () => {
  globalThis.XMLHttpRequest = class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 200;

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    getResponseHeader(name) {
      return name.toLowerCase() === "etag" ? "etag-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const abortCalls = [];
  let completeAttempts = 0;
  creatorApi.prepareUpload = async () => ({
    uploadSessionId: "session-1",
    storageObjectId: "object-1",
    objectKey: "objects/file.png",
    provider: "dev",
    upload: {
      method: "PUT",
      url: "/api/storage/upload-sessions/session-1/blob",
      headers: { "content-type": "image/png" },
    },
  });
  creatorApi.completeUpload = async () => {
    completeAttempts += 1;
    if (completeAttempts === 1) {
      throw new Error("request_timeout");
    }
    return {
      storageObject: {
        id: "object-1",
        objectKey: "objects/file.png",
        status: "available",
        contentType: "image/png",
        sizeBytes: 123,
        etag: "etag-1",
      },
      urls: {
        sourceUrl: "https://cos.example.test/file.png",
      },
    };
  };
  creatorApi.abortUpload = async (uploadSessionId) => {
    abortCalls.push(uploadSessionId);
    return { uploadSessionId };
  };

  const result = await creatorApi.uploadFile(
    {
      name: "file.png",
      type: "image/png",
      size: 123,
      lastModified: 1,
    },
    { projectId: "project-1" },
  );

  assert.equal(completeAttempts, 2);
  assert.equal(result.upload.publicUrl, "https://cos.example.test/file.png");
  assert.deepEqual(abortCalls, []);
});

test("uploadFile leaves the stored object intact when complete keeps failing after upload", async () => {
  globalThis.XMLHttpRequest = class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 200;

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    getResponseHeader(name) {
      return name.toLowerCase() === "etag" ? "etag-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const abortCalls = [];
  creatorApi.prepareUpload = async () => ({
    uploadSessionId: "session-1",
    storageObjectId: "object-1",
    objectKey: "objects/file.png",
    provider: "dev",
    upload: {
      method: "PUT",
      url: "/api/storage/upload-sessions/session-1/blob",
      headers: { "content-type": "image/png" },
    },
  });
  creatorApi.completeUpload = async () => {
    throw new Error("complete_failed");
  };
  creatorApi.abortUpload = async (uploadSessionId) => {
    abortCalls.push(uploadSessionId);
    return { uploadSessionId };
  };

  await assert.rejects(
    creatorApi.uploadFile(
      {
        name: "file.png",
        type: "image/png",
        size: 123,
        lastModified: 1,
      },
      { projectId: "project-1" },
    ),
    /complete_failed/,
  );
  assert.deepEqual(abortCalls, []);
});

test("uploadFile resolves from uploaded session status when complete responses time out", async () => {
  globalThis.XMLHttpRequest = class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 200;

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    getResponseHeader(name) {
      return name.toLowerCase() === "etag" ? "etag-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const abortCalls = [];
  let completeAttempts = 0;
  let statusLookups = 0;
  creatorApi.prepareUpload = async () => ({
    uploadSessionId: "session-1",
    storageObjectId: "object-1",
    objectKey: "objects/file.png",
    provider: "dev",
    upload: {
      method: "PUT",
      url: "/api/storage/upload-sessions/session-1/blob",
      headers: { "content-type": "image/png" },
    },
  });
  creatorApi.completeUpload = async () => {
    completeAttempts += 1;
    throw new Error("request_timeout");
  };
  creatorApi.getUploadSession = async (uploadSessionId) => {
    statusLookups += 1;
    assert.equal(uploadSessionId, "session-1");
    return {
      uploadSession: {
        id: "session-1",
        status: "uploaded",
      },
      storageObject: {
        id: "object-1",
        objectKey: "objects/file.png",
        status: "available",
        contentType: "image/png",
        sizeBytes: 123,
        etag: "etag-1",
      },
      urls: {
        sourceUrl: "https://cos.example.test/file.png",
      },
    };
  };
  creatorApi.abortUpload = async (uploadSessionId) => {
    abortCalls.push(uploadSessionId);
    return { uploadSessionId };
  };

  const result = await creatorApi.uploadFile(
    {
      name: "file.png",
      type: "image/png",
      size: 123,
      lastModified: 1,
    },
    { projectId: "project-1" },
  );

  assert.equal(completeAttempts, 2);
  assert.equal(statusLookups, 1);
  assert.equal(result.upload.publicUrl, "https://cos.example.test/file.png");
  assert.deepEqual(abortCalls, []);
});

test("uploadFile rejects disallowed files before preparing an upload", async () => {
  const { creatorApi } = await import("../src/shared/creator-api.js");
  let prepared = false;
  creatorApi.prepareUpload = async () => {
    prepared = true;
    return {};
  };

  await assert.rejects(
    () => creatorApi.uploadFile(
      {
        name: "installer.exe",
        type: "image/png",
        size: 4,
        lastModified: 1,
      },
      { projectId: "project-1" },
    ),
    (error) => {
      assert.equal(error.errorCode, "upload_type_not_allowed");
      return true;
    },
  );
  assert.equal(prepared, false);
});

test("uploadFile rejects files that exceed configured limits before upload", async () => {
  const { creatorApi } = await import("../src/shared/creator-api.js");
  let prepared = false;
  creatorApi.prepareUpload = async () => {
    prepared = true;
    return {};
  };

  await assert.rejects(
    () => creatorApi.uploadFile(
      {
        name: "huge.png",
        type: "image/png",
        size: 30 * 1024 * 1024 + 1,
        lastModified: 1,
      },
      { projectId: "project-1" },
    ),
    (error) => {
      assert.equal(error.errorCode, "upload_file_too_large");
      assert.equal(error.details.maxBytes, 30 * 1024 * 1024);
      return true;
    },
  );
  assert.equal(prepared, false);
});

test("uploadFile uses single-put COS uploads for videos and forwards progress", async () => {
  const previousWindow = globalThis.window;
  const previousCos = globalThis.COS;
  globalThis.window = globalThis;

  class FakeCOS {
    constructor() {}

    putObject(input, callback) {
      input.onProgress?.({
        loaded: 5,
        total: 10,
        percent: 0.5,
      });
      input.onProgress?.({
        loaded: 10,
        total: 10,
        percent: 1,
      });
      queueMicrotask(() => callback(null, { ETag: '"etag-cos-1"' }));
    }
  }

  globalThis.COS = FakeCOS;
  globalThis.window.COS = FakeCOS;

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    let preparedBody = null;
    creatorApi.prepareUpload = async (input) => {
      preparedBody = input;
      return {
        uploadSessionId: "session-cos-1",
        storageObjectId: "object-cos-1",
        objectKey: "objects/video.mp4",
        bucket: "bucket-1",
        region: "ap-guangzhou",
        provider: "tencent_cos",
        credentials: {
          tmpSecretId: "tmp-id",
          tmpSecretKey: "tmp-key",
          sessionToken: "token",
          startTime: 1,
          expiredTime: 2,
        },
      };
    };
    creatorApi.completeUpload = async () => ({
      storageObject: {
        id: "object-cos-1",
        objectKey: "objects/video.mp4",
        contentType: "video/mp4",
        sizeBytes: 10,
        etag: "etag-cos-1",
      },
      urls: {
        sourceUrl: "https://cos.example.test/video.mp4",
      },
    });

    const progress = [];
    const result = await creatorApi.uploadFile(
      {
        name: "video.mp4",
        type: "video/mp4",
        size: 10,
        lastModified: 1,
      },
      {
        projectId: "project-1",
        onProgress(item) {
          progress.push(item.progress);
        },
      },
    );

    assert.equal(preparedBody?.multipart, false);
    assert.deepEqual(progress, [0.5, 1]);
    assert.equal(result.upload.eTag, "etag-cos-1");
    assert.equal(result.upload.publicUrl, "https://cos.example.test/video.mp4");
  } finally {
    globalThis.window = previousWindow;
    if (previousCos === undefined) {
      delete globalThis.COS;
    } else {
      globalThis.COS = previousCos;
    }
  }
});

test("uploadFile prefers same-origin proxy uploads on localhost even when COS credentials exist", async () => {
  const previousWindow = globalThis.window;
  const previousCos = globalThis.COS;
  globalThis.window = {
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      origin: "http://127.0.0.1:4310",
    },
  };

  class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 200;

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    getResponseHeader(name) {
      return name.toLowerCase() === "etag" ? "etag-proxy-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  }

  class FailingCOS {
    constructor() {}

    putObject() {
      throw new Error("cos_should_not_be_called");
    }
  }

  globalThis.XMLHttpRequest = FakeXmlHttpRequest;
  globalThis.COS = FailingCOS;

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    creatorApi.prepareUpload = async () => ({
      uploadSessionId: "session-proxy-1",
      storageObjectId: "object-proxy-1",
      objectKey: "objects/cover.png",
      provider: "tencent_cos",
      upload: {
        method: "PUT",
        url: "/api/storage/upload-sessions/session-proxy-1/blob",
        headers: { "content-type": "image/png" },
      },
      credentials: {
        tmpSecretId: "tmp-id",
        tmpSecretKey: "tmp-key",
        sessionToken: "token",
        startTime: 1,
        expiredTime: 2,
      },
    });
    creatorApi.completeUpload = async () => ({
      storageObject: {
        id: "object-proxy-1",
        objectKey: "objects/cover.png",
        contentType: "image/png",
        sizeBytes: 12,
        etag: "etag-proxy-1",
      },
      urls: {
        sourceUrl: "https://cos.example.test/cover.png",
      },
    });

    const result = await creatorApi.uploadFile(
      {
        name: "cover.png",
        type: "image/png",
        size: 12,
        lastModified: 1,
      },
      { projectId: "project-1" },
    );

    assert.equal(result.upload.eTag, "etag-proxy-1");
  } finally {
    globalThis.window = previousWindow;
    if (previousCos === undefined) {
      delete globalThis.COS;
    } else {
      globalThis.COS = previousCos;
    }
  }
});

test("uploadFile uses COS direct upload for team asset uploads on non-localhost hosts", async () => {
  const previousWindow = globalThis.window;
  const previousCos = globalThis.COS;
  globalThis.window = {
    location: {
      protocol: "https:",
      hostname: "studio.example.test",
      origin: "https://studio.example.test",
    },
  };

  class FakeCOS {
    constructor() {}

    putObject(input, callback) {
      input.onProgress?.({ loaded: 12, total: 12, percent: 1 });
      queueMicrotask(() => callback(null, { ETag: '"etag-team-cos-1"' }));
    }
  }

  globalThis.COS = FakeCOS;
  globalThis.window.COS = FakeCOS;

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    creatorApi.prepareUpload = async () => ({
      uploadSessionId: "session-team-proxy-1",
      storageObjectId: "object-team-proxy-1",
      objectKey: "objects/team-asset.png",
      provider: "tencent_cos",
      upload: {
        method: "PUT",
        url: "/api/storage/upload-sessions/session-team-proxy-1/blob",
        headers: { "content-type": "image/png" },
      },
      credentials: {
        tmpSecretId: "tmp-id",
        tmpSecretKey: "tmp-key",
        sessionToken: "token",
        startTime: 1,
        expiredTime: 2,
      },
    });
    creatorApi.completeUpload = async () => ({
      storageObject: {
        id: "object-team-proxy-1",
        objectKey: "objects/team-asset.png",
        contentType: "image/png",
        sizeBytes: 12,
        etag: "etag-team-cos-1",
      },
      urls: {
        sourceUrl: "https://cos.example.test/team-asset.png",
      },
    });

    const result = await creatorApi.uploadFile(
      {
        name: "team-asset.png",
        type: "image/png",
        size: 12,
        lastModified: 1,
      },
      { category: "team-assets/character" },
    );

    assert.equal(result.upload.eTag, "etag-team-cos-1");
  } finally {
    globalThis.window = previousWindow;
    if (previousCos === undefined) {
      delete globalThis.COS;
    } else {
      globalThis.COS = previousCos;
    }
  }
});

test("uploadFile uses a longer timeout when finalizing upload sessions", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const previousXmlHttpRequest = globalThis.XMLHttpRequest;
  const timeoutCalls = [];

  globalThis.window = {
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      host: "127.0.0.1:4310",
      port: "4310",
      origin: "http://127.0.0.1:4310",
    },
  };
  globalThis.setTimeout = ((callback, delay, ...args) => {
    timeoutCalls.push(delay);
    return previousSetTimeout(() => {}, 0, ...args);
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof globalThis.clearTimeout;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/api/storage/upload-sessions")) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            uploadSessionId: "session-timeout-1",
            storageObjectId: "object-timeout-1",
            objectKey: "objects/team-asset-timeout.png",
            provider: "tencent_cos",
            upload: {
              method: "PUT",
              url: "/api/storage/upload-sessions/session-timeout-1/blob",
              headers: { "content-type": "image/png" },
            },
          }),
      };
    }
    if (href.endsWith("/api/storage/upload-sessions/session-timeout-1/complete")) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            storageObject: {
              id: "object-timeout-1",
              objectKey: "objects/team-asset-timeout.png",
              contentType: "image/png",
              sizeBytes: 12,
              etag: "etag-timeout-1",
            },
            urls: {
              sourceUrl: "https://cos.example.test/team-asset-timeout.png",
            },
          }),
      };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 200;

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    getResponseHeader(name) {
      return name.toLowerCase() === "etag" ? "etag-timeout-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  }

  globalThis.XMLHttpRequest = FakeXmlHttpRequest;

  try {
    const { creatorApi } = await import(`../src/shared/creator-api.js?upload-timeout=${Date.now()}`);
    await creatorApi.uploadFile(
      {
        name: "team-asset-timeout.png",
        type: "image/png",
        size: 12,
        lastModified: 1,
      },
      { category: "team-assets/character" },
    );

    assert.ok(timeoutCalls.includes(60000));
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
    if (previousXmlHttpRequest === undefined) {
      delete globalThis.XMLHttpRequest;
    } else {
      globalThis.XMLHttpRequest = previousXmlHttpRequest;
    }
  }
});

test("uploadFile surfaces structured same-origin proxy upload errors", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      origin: "http://127.0.0.1:4310",
    },
  };

  globalThis.XMLHttpRequest = class FakeXmlHttpRequest {
    headers = {};
    upload = {};
    status = 413;
    responseText = JSON.stringify({
      error: {
        code: "upload_file_too_large",
        message: "视频文件超过上传大小限制",
        details: { maxBytes: 50 },
      },
    });

    open() {}

    setRequestHeader(key, value) {
      this.headers[key] = value;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  };

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    creatorApi.prepareUpload = async () => ({
      uploadSessionId: "session-proxy-error",
      storageObjectId: "object-proxy-error",
      objectKey: "objects/video.mp4",
      provider: "creator-dev",
      upload: {
        method: "PUT",
        url: "/api/storage/upload-sessions/session-proxy-error/blob",
        headers: { "content-type": "video/mp4" },
      },
    });
    creatorApi.abortUpload = async () => ({});

    await assert.rejects(
      () => creatorApi.uploadFile(
        {
          name: "video.mp4",
          type: "video/mp4",
          size: 10,
          lastModified: 1,
        },
        { projectId: "project-1" },
      ),
      (error) => {
        assert.equal(error.status, 413);
        assert.equal(error.errorCode, "upload_file_too_large");
        assert.equal(error.message, "视频文件超过上传大小限制");
        assert.deepEqual(error.details, { maxBytes: 50 });
        return true;
      },
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("resolveApiUrl points backend-owned localhost paths at the dev API server", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4321",
      hostname: "127.0.0.1",
      port: "4321",
      origin: "http://127.0.0.1:4321",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/projects/project-1/detail"),
        "http://127.0.0.1:4310/api/projects/project-1/detail",
      );
      assert.equal(
        resolveApiUrl("/uploads/project-1/frame.png"),
        "http://127.0.0.1:4310/uploads/project-1/frame.png",
      );
      assert.equal(
        resolveApiUrl("/vendor/cos-js-sdk-v5/dist/cos-js-sdk-v5.min.js"),
        "http://127.0.0.1:4310/vendor/cos-js-sdk-v5/dist/cos-js-sdk-v5.min.js",
      );
      assert.equal(
        resolveApiUrl("/admin/assets/prompt-covers/watercolor.webp"),
        "http://127.0.0.1:4310/admin/assets/prompt-covers/watercolor.webp",
      );
      assert.equal(
        resolveApiUrl("/api/public/style-covers/animation"),
        "http://127.0.0.1:4310/admin/assets/prompt-covers/animation.webp",
      );
      assert.equal(
        resolveApiUrl("/app.html"),
        "http://127.0.0.1:4321/app.html",
      );
    },
  );
});

test("panel scripts forwards server pagination in the request URL", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ scripts: [], pagination: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.getUserScripts({ page: 2, pageSize: 10 });
    assert.match(requestedUrl, /\/api\/creator\/scripts\?page=2&pageSize=10$/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("resolveApiUrl keeps same-origin URLs on the dev API server", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4310",
      hostname: "127.0.0.1",
      port: "4310",
      origin: "http://127.0.0.1:4310",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/projects/project-1/detail"),
        "http://127.0.0.1:4310/api/projects/project-1/detail",
      );
      assert.equal(resolveApiUrl("/app.html"), "http://127.0.0.1:4310/app.html");
    },
  );
});

test("resolveApiUrl keeps same-origin URLs on alternate dev API ports", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4311",
      hostname: "127.0.0.1",
      port: "4311",
      origin: "http://127.0.0.1:4311",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/projects/project-1/detail"),
        "http://127.0.0.1:4311/api/projects/project-1/detail",
      );
      assert.equal(resolveApiUrl("/app.html"), "http://127.0.0.1:4311/app.html");
    },
  );
});

test("resolveApiUrl keeps same-origin URLs on the membership acceptance dev API port", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4320",
      hostname: "127.0.0.1",
      port: "4320",
      origin: "http://127.0.0.1:4320",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/auth/session"),
        "http://127.0.0.1:4320/api/auth/session",
      );
      assert.equal(resolveApiUrl("/app.html"), "http://127.0.0.1:4320/app.html");
    },
  );
});

test("resolveApiUrl keeps same-origin URLs on additional membership acceptance dev API ports", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4322",
      hostname: "127.0.0.1",
      port: "4322",
      origin: "http://127.0.0.1:4322",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/auth/session"),
        "http://127.0.0.1:4322/api/auth/session",
      );
      assert.equal(
        resolveApiUrl("/api/membership/plans"),
        "http://127.0.0.1:4322/api/membership/plans",
      );
    },
  );
});

test("resolveApiUrl keeps same-origin URLs on the user-selected dev port", async () => {
  const { resolveApiUrl } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4399",
      hostname: "127.0.0.1",
      port: "4399",
      origin: "http://127.0.0.1:4399",
    },
    () => {
      assert.equal(
        resolveApiUrl("/api/auth/session"),
        "http://127.0.0.1:4399/api/auth/session",
      );
      assert.equal(resolveApiUrl("/app.html"), "http://127.0.0.1:4399/app.html");
    },
  );
});

test("team dashboard export url uses the project-scoped route and preserves filters", async () => {
  const { creatorApi } = await import("../src/shared/creator-api.js");

  await withWindowLocation(
    {
      protocol: "http:",
      host: "127.0.0.1:4321",
      hostname: "127.0.0.1",
      port: "4321",
      origin: "http://127.0.0.1:4321",
    },
    () => {
      const url = creatorApi.getProjectTeamDashboardExportUrl("project-1", {
        tab: "ranking",
        dateShortcut: "今天",
        role: "producer",
        status: "enabled",
      });
      assert.equal(
        url,
        "http://127.0.0.1:4310/api/creator/projects/project-1/team-dashboard/export?tab=ranking&dateShortcut=%E4%BB%8A%E5%A4%A9&role=producer&status=enabled",
      );
    },
  );
});

test("new episode helpers unwrap envelopes and target v2 workbench routes", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "request-1",
        data: { ok: true, url: String(url) },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const detail = await creatorApi.getProjectDetailV2("project/1");
  const workbench = await creatorApi.getEpisodeWorkbench("episode/1");
  const config = await creatorApi.listGenerationConfig("episode/1", { mediaType: "image" });
  const batchImageModels = await creatorApi.listBatchImageModelOptions("episode/1");
  const storyboards = await creatorApi.listStoryboards("episode/1", { page: 2, pageSize: 5 });
  const conversation = await creatorApi.getAssetConversationHistory("episode/1", "asset/1", "video");
  const task = await creatorApi.createVideoTask(
    "episode/1",
    { targetType: "storyboard", targetId: "shot/1" },
    { idempotencyKey: "video-key" },
  );
  const persistedConversation = await creatorApi.saveAssetConversationMessages("episode/1", "asset/1", {
    mediaMode: "image",
    messages: [{ messageType: "user_request" }],
  });
  const exportTask = await creatorApi.createEpisodeExportTask(
    "episode/1",
    { assetVersionId: "asset-version/1", storageObjectId: "storage/1" },
    { idempotencyKey: "export-key" },
  );

  assert.equal(detail.ok, true);
  assert.equal(workbench.ok, true);
  assert.equal(config.ok, true);
  assert.equal(batchImageModels.ok, true);
  assert.equal(storyboards.ok, true);
  assert.equal(conversation.ok, true);
  assert.equal(task.ok, true);
  assert.equal(persistedConversation.ok, true);
  assert.equal(exportTask.ok, true);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/projects/project%2F1/detail",
    "/api/episodes/episode%2F1/workbench",
    "/api/episodes/episode%2F1/generation-config?mediaType=image",
    "/api/episodes/episode%2F1/batch-image-model-options",
    "/api/episodes/episode%2F1/storyboards?page=2&pageSize=5&includeDraftPayload=0",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation?mediaMode=video&includeMessages=0",
    "/api/episodes/episode%2F1/generation/video-tasks",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation/messages",
    "/api/episodes/episode%2F1/export-tasks",
  ]);
  assert.equal(calls[6].options.headers["idempotency-key"], "video-key");
  assert.equal(calls[7].options.method, "POST");
  assert.equal(calls[8].options.headers["idempotency-key"], "export-key");
});

test("jianying export waits for archive build without changing other export timeouts", async () => {
  const previousSetTimeout = globalThis.setTimeout;
  const previousFetch = globalThis.fetch;
  const scheduledDelays = [];
  globalThis.setTimeout = ((callback, delay) => {
    scheduledDelays.push(delay);
    return 1;
  });
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      requestId: "request-export",
      data: { exportTask: { status: "succeeded" } },
    }),
  });

  try {
    const { creatorApi } = await import("../src/shared/creator-api.js");
    await creatorApi.createEpisodeExportTask("episode-1", {
      storyboardIds: ["storyboard-1"],
      exportType: "jianying",
    });
    await creatorApi.createEpisodeExportTask("episode-1", {
      storyboardIds: ["storyboard-1"],
      exportType: "mp4",
    });
    await creatorApi.createEpisodeExportTask("episode-1", {
      storyboardIds: ["storyboard-1"],
      exportType: "jianying",
    }, { timeoutMs: 123_456 });
  } finally {
    globalThis.setTimeout = previousSetTimeout;
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(scheduledDelays, [600_000, 60_000, 123_456]);
});

test("new envelope errors expose status code, error code, details, and request id", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({
      requestId: "request-denied",
      errorCode: "permission_denied",
      message: "没有权限执行该操作",
      details: { action: "generate" },
    }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    () => creatorApi.createImageGenerationTask({
      target: { kind: "episode_asset", episodeId: "episode-1", targetId: "asset-1" },
      prompt: "test",
    }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.errorCode, "permission_denied");
      assert.deepEqual(error.details, { action: "generate" });
      assert.equal(error.requestId, "request-denied");
      assert.equal(error.message, "没有权限执行该操作");
      return true;
    },
  );
});

test("legacy nested error objects expose a readable message and string error code", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({
      error: {
        code: "admin_user_not_found",
        message: "用户不存在",
        details: { taskId: "ledger-task-1" },
      },
    }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    () => creatorApi.getCreditLedger({ page: 1, pageSize: 10 }),
    (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.errorCode, "admin_user_not_found");
      assert.equal(error.message, "用户不存在");
      assert.equal(error.taskId, "ledger-task-1");
      assert.deepEqual(error.details, { taskId: "ledger-task-1" });
      return true;
    },
  );
});

test("generation errors preserve the unified model failure contract", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      errorCode: "model_reference_url_not_public",
      failure: {
        failureCode: "provider_failed",
        displayMessage: "本地图片无法解析，请上传公网图片。",
        noticeType: "error",
        providerStatus: "failed",
        providerErrorCode: "bad_request",
        providerMessage: "[provider error redacted]",
      },
    }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    () => creatorApi.getGenerationTask("model-failure-task"),
    (error) => {
      assert.equal(error.message, "本地图片无法解析，请上传公网图片。");
      assert.equal(error.noticeType, "error");
      assert.equal(error.providerStatus, "failed");
      assert.equal(error.providerErrorCode, "bad_request");
      assert.equal(error.providerMessage, "[provider error redacted]");
      assert.equal(error.failure.failureCode, "provider_failed");
      return true;
    },
  );
});

test("object-valued error fields never render as object Object", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => JSON.stringify({
      error: {
        code: { legacy: "provider_failed" },
        message: { legacy: "provider failed" },
      },
    }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    () => creatorApi.getCreditLedger({ page: 1, pageSize: 10 }),
    (error) => {
      assert.equal(error.errorCode, "request_failed:502");
      assert.equal(error.message, "request_failed:502");
      assert.doesNotMatch(error.message, /\[object Object\]/);
      return true;
    },
  );
});

test("nested generation error envelopes expose the backend task id", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => JSON.stringify({
      requestId: "outer-request",
      data: {
        requestId: "inner-request",
        errorCode: "provider_api_key_missing",
        message: "模型供应商配置缺失",
        details: {
          taskId: "70000000-0000-4000-8000-000000000001",
          workflowId: "70000000-0000-4000-8000-000000000002",
        },
      },
    }),
  });

  const { creatorApi } = await import("../src/shared/creator-api.js");
  await assert.rejects(
    () => creatorApi.createImageGenerationTask({
      target: { kind: "episode_asset", episodeId: "episode-1", targetId: "asset-1" },
      prompt: "test",
    }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.errorCode, "provider_api_key_missing");
      assert.equal(error.taskId, "70000000-0000-4000-8000-000000000001");
      assert.deepEqual(error.details, {
        taskId: "70000000-0000-4000-8000-000000000001",
        workflowId: "70000000-0000-4000-8000-000000000002",
      });
      assert.equal(error.requestId, "outer-request");
      return true;
    },
  );
});

test("enterprise contact request targets the billing intake route and sends an idempotency key", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      text: async () => JSON.stringify({
        requestId: "request-1",
        data: { request: { id: "enterprise-request-1", status: "submitted" } },
      }),
    };
  };

  const { creatorApi } = await import("../src/shared/creator-api.js");
  const response = await creatorApi.requestEnterpriseContact(
    { source: "pricing_modal", note: "enterprise_plan_interest" },
    { idempotencyKey: "enterprise-key" },
  );

  assert.equal(response.request.id, "enterprise-request-1");
  assert.equal(calls[0].url, "/api/billing/enterprise-contact-requests");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["idempotency-key"], "enterprise-key");
});
