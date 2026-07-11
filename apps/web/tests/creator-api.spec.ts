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

test("project canvas helpers target project-scoped canvas routes", async () => {
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
  await creatorApi.getProjectCanvas("project/1");
  await creatorApi.saveProjectCanvas("project/1", {
    clientRevision: 1,
    document: { nodes: [], edges: [] },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/creator/projects/project%2F1/canvas");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[1].url, "/api/creator/projects/project%2F1/canvas");
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    clientRevision: 1,
    document: { nodes: [], edges: [] },
  });
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
        size: 20 * 1024 * 1024 + 1,
        lastModified: 1,
      },
      { projectId: "project-1" },
    ),
    (error) => {
      assert.equal(error.errorCode, "upload_file_too_large");
      assert.equal(error.details.maxBytes, 20 * 1024 * 1024);
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

test("uploadFile prefers the backend upload proxy for team asset uploads even on non-localhost hosts", async () => {
  const previousWindow = globalThis.window;
  const previousCos = globalThis.COS;
  const previousXmlHttpRequest = globalThis.XMLHttpRequest;
  globalThis.window = {
    location: {
      protocol: "https:",
      hostname: "studio.example.test",
      origin: "https://studio.example.test",
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
      return name.toLowerCase() === "etag" ? "etag-team-proxy-1" : null;
    }

    send() {
      queueMicrotask(() => this.onload?.());
    }
  }

  class FailingCOS {
    constructor() {}

    putObject() {
      throw new Error("cos_should_not_be_called_for_team_assets");
    }
  }

  globalThis.XMLHttpRequest = FakeXmlHttpRequest;
  globalThis.COS = FailingCOS;

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
        etag: "etag-team-proxy-1",
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

    assert.equal(result.upload.eTag, "etag-team-proxy-1");
  } finally {
    globalThis.window = previousWindow;
    if (previousXmlHttpRequest === undefined) {
      delete globalThis.XMLHttpRequest;
    } else {
      globalThis.XMLHttpRequest = previousXmlHttpRequest;
    }
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
        details: { maxBytes: 500 },
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
        assert.deepEqual(error.details, { maxBytes: 500 });
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
        resolveApiUrl("/app.html"),
        "http://127.0.0.1:4321/app.html",
      );
    },
  );
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
    "/api/episodes/episode%2F1/storyboards?page=2&pageSize=5",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation?mediaMode=video&includeMessages=0",
    "/api/episodes/episode%2F1/generation/video-tasks",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation/messages",
    "/api/episodes/episode%2F1/export-tasks",
  ]);
  assert.equal(calls[6].options.headers["idempotency-key"], "video-key");
  assert.equal(calls[7].options.method, "POST");
  assert.equal(calls[8].options.headers["idempotency-key"], "export-key");
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
    () => creatorApi.createImageTask("episode-1", { prompt: "test" }),
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
    () => creatorApi.createImageTask("episode-1", { prompt: "test" }),
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
