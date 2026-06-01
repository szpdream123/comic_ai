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

test("uploadFile aborts the prepared session when complete fails", async () => {
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
  const calls = [];
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
    calls.push(uploadSessionId);
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
  assert.deepEqual(calls, ["session-1"]);
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
      errorCode: "upload_file_too_large",
      message: "视频文件超过上传大小限制",
      details: { maxBytes: 500 },
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
        resolveApiUrl("/login.html"),
        "http://127.0.0.1:4321/login.html",
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
      assert.equal(resolveApiUrl("/login.html"), "http://127.0.0.1:4310/login.html");
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
      assert.equal(resolveApiUrl("/login.html"), "http://127.0.0.1:4311/login.html");
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
  const config = await creatorApi.listGenerationConfig("episode/1");
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
  assert.equal(storyboards.ok, true);
  assert.equal(conversation.ok, true);
  assert.equal(task.ok, true);
  assert.equal(persistedConversation.ok, true);
  assert.equal(exportTask.ok, true);
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/projects/project%2F1/detail",
    "/api/episodes/episode%2F1/workbench",
    "/api/episodes/episode%2F1/generation-config",
    "/api/episodes/episode%2F1/storyboards?page=2&pageSize=5",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation?mediaMode=video",
    "/api/episodes/episode%2F1/generation/video-tasks",
    "/api/episodes/episode%2F1/assets/asset%2F1/conversation/messages",
    "/api/episodes/episode%2F1/export-tasks",
  ]);
  assert.equal(calls[5].options.headers["idempotency-key"], "video-key");
  assert.equal(calls[6].options.method, "POST");
  assert.equal(calls[7].options.headers["idempotency-key"], "export-key");
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
