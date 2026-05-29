import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:4311";
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9223);
const artifactDir = resolve(process.cwd(), "artifacts", "episode-workbench-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `episode-workbench-qa-chrome-${Date.now()}-${randomUUID()}`,
);

await mkdir(artifactDir, { recursive: true });
await mkdir(userDataDir, { recursive: true });

const setup = await setupScenario();
const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], {
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});

let stderr = "";
chrome.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

try {
  await waitForCdp();
  const browser = await connectCdp();
  const desktop = await newPage(browser);
  await setCookie(desktop, setup.cookie);
  await setViewport(desktop, 1440, 900);
  const projectUrl = `${origin}/app.html#/projects/${encodeURIComponent(setup.projectId)}`;
  const projectStart = Date.now();
  await navigate(desktop, projectUrl);
  await waitForSelector(desktop, ".episode-hub-shell", 15_000);
  const projectLoadMs = Date.now() - projectStart;
  await screenshot(desktop, join(artifactDir, "project-episodes-desktop.png"));
  const projectMetrics = await evaluate(desktop, qaMetricsScript());

  const workbenchStart = Date.now();
  await click(
    desktop,
    `[data-action="open-episode-workbench"][data-episode-id="${setup.workbenchEpisodeId}"]`,
  );
  await waitForSelector(desktop, ".episode-replica-layout", 15_000);
  await waitForSelector(desktop, ".episode-replica-layout.storyboard-mode", 15_000);
  const workbenchLoadMs = Date.now() - workbenchStart;
  await screenshot(desktop, join(artifactDir, "episode-workbench-desktop.png"));
  const workbenchMetrics = await evaluate(desktop, qaMetricsScript());
  const routeAfterClick = await evaluate(desktop, "location.href");

  const mobile = await newPage(browser);
  await setCookie(mobile, setup.cookie);
  await setViewport(mobile, 390, 844);
  const deepLink = `${origin}/projects/${encodeURIComponent(setup.projectId)}/episodes/${encodeURIComponent(setup.episodeId)}`;
  const mobileStart = Date.now();
  await navigate(mobile, deepLink);
  await waitForSelector(mobile, ".episode-replica-layout", 15_000);
  await waitForSelector(mobile, ".episode-replica-layout.storyboard-mode", 15_000);
  const mobileLoadMs = Date.now() - mobileStart;
  await screenshot(mobile, join(artifactDir, "episode-workbench-mobile.png"));
  const mobileMetrics = await evaluate(mobile, qaMetricsScript());

  const report = {
    origin,
    projectUrl,
    deepLink,
    routeAfterClick,
    projectId: setup.projectId,
    episodeId: setup.episodeId,
    screenshots: {
      projectDesktop: "artifacts/episode-workbench-qa/project-episodes-desktop.png",
      workbenchDesktop: "artifacts/episode-workbench-qa/episode-workbench-desktop.png",
      workbenchMobile: "artifacts/episode-workbench-qa/episode-workbench-mobile.png",
    },
    metrics: {
      timings: {
        projectLoadMs,
        workbenchLoadMs,
        mobileLoadMs,
      },
      project: projectMetrics,
      workbench: workbenchMetrics,
      mobile: mobileMetrics,
    },
    consoleErrors: [
      ...desktop.console.filter((item) => item.type === "error"),
      ...mobile.console.filter((item) => item.type === "error"),
    ],
  };
  validateReport(report);
  await writeFile(
    join(artifactDir, "browser-qa-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  browser.close();
} finally {
  chrome.stderr.destroy();
  chrome.kill();
  if (chrome.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      chrome.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) {
    await writeFile(join(artifactDir, "chrome-stderr.log"), stderr, "utf8");
  }
}

async function setupScenario() {
  const phone = `138${String(Date.now()).slice(-8)}`;
  const request = await jsonFetch("/api/auth/code/request", {
    method: "POST",
    body: { phone },
  });
  const debug = await jsonFetch(`/api/auth/dev/challenges/${request.challengeId}`);
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: request.challengeId,
      phone,
      code: debug.code,
    }),
  });
  if (!verifyResponse.ok) {
    throw new Error(`verify_failed:${verifyResponse.status}`);
  }
  const cookie = verifyResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
  const project = await jsonFetch("/api/creator/project/create", {
    method: "POST",
    cookie,
    idempotencyKey: `qa-project-${Date.now()}`,
    body: {
      name: "剧集工作台联调",
      scriptInput: "第 1 集：验证剧集工作台链路与页面还原效果。",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
  });
  await jsonFetch("/api/creator/project/select", {
    method: "POST",
    cookie,
    body: {
      projectId: project.project.id,
    },
  });
  const episodeTitles = ["第一集", "第二集", "第三集"];
  const createdEpisodes = [];
  for (const [index, title] of episodeTitles.entries()) {
    const episodeEnvelope = await jsonFetch(`/api/projects/${project.project.id}/episodes`, {
      method: "POST",
      cookie,
      idempotencyKey: `qa-episode-${index}-${Date.now()}`,
      body: { title },
    });
    createdEpisodes.push(episodeEnvelope.data.episode);
  }
  const primaryEpisode = createdEpisodes[1] ?? createdEpisodes[0];
  const episodeId = primaryEpisode.id;
  const assetSeeds = [
    {
      key: "hero",
      kind: "character",
      name: "废土主角",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "street",
      kind: "scene",
      name: "残破街区",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "radio",
      kind: "prop",
      name: "旧式通讯器",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "ally",
      kind: "character",
      name: "蓬头垢面的女人",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "elder",
      kind: "character",
      name: "年纪更大的女人",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "diner",
      kind: "scene",
      name: "山谷难民营地",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "fog",
      kind: "scene",
      name: "灰雾街区",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "wagon",
      kind: "prop",
      name: "破旧牛车",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
  ];
  for (const asset of assetSeeds) {
    const upload = await uploadSeedAsset(cookie, project.project.id, asset.key);
    await jsonFetch("/api/creator/assets/import", {
      method: "POST",
      cookie,
      body: {
        kind: asset.kind,
        name: asset.name,
        uploadSessionId: upload.uploadSessionId,
        storageObjectId: upload.storageObjectId,
        storageObjectKey: upload.storageObjectKey,
        sourceUrl: upload.sourceUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      },
    });
  }
  const shots = [
    {
      title: "废土夜景分镜",
      description: "废土风格的夜景分镜，主角站在残破街区中央，画面压抑且有电影感。",
    },
    {
      title: "灰雾中的追逐",
      description: "主角穿过灰雾街区，远处残破招牌和冷色灯光制造压迫感。",
    },
    {
      title: "营地入口对峙",
      description: "山谷难民营地入口，主角与蓬头垢面的女人对视，气氛克制但紧张。",
    },
    {
      title: "旧牛车旁的停顿",
      description: "旧牛车停在泥地边，主角短暂停步，环境安静却带危险预兆。",
    },
  ];
  for (const shot of shots) {
    await jsonFetch("/api/creator/shots", {
      method: "POST",
      cookie,
      body: {
        projectId: project.project.id,
        episodeId,
        title: shot.title,
        description: shot.description,
      },
    });
  }
  return {
    cookie,
    projectId: project.project.id,
    episodeId,
    workbenchEpisodeId: episodeId,
  };
}

async function uploadSeedAsset(cookie, projectId, baseName) {
  const pngBytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 153, 99, 248, 255, 255, 255,
    127, 0, 9, 251, 3, 253, 42, 134, 227, 138, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130,
  ]);
  const prepared = await jsonFetch("/api/storage/upload-sessions", {
    method: "POST",
    cookie,
    idempotencyKey: `qa-upload-${baseName}-${Date.now()}`,
    body: {
      projectId,
      purpose: "role_reference",
      fileName: `${baseName}.png`,
      contentType: "image/png",
      sizeBytes: pngBytes.byteLength,
      multipart: false,
    },
  });
  const uploadSessionId = prepared.uploadSessionId ?? prepared.data?.uploadSessionId;
  const storageObjectId = prepared.storageObjectId ?? prepared.data?.storageObjectId;
  const storageObjectKey = prepared.objectKey ?? prepared.data?.objectKey ?? null;
  await fetch(`${origin}/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/blob`, {
    method: "PUT",
    headers: {
      "content-type": "image/png",
      ...(cookie ? { cookie } : {}),
    },
    body: Buffer.from(pngBytes),
  });
  const completed = await jsonFetch(`/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/complete`, {
    method: "POST",
    cookie,
    body: {
      eTag: null,
    },
  });
  return {
    uploadSessionId,
    storageObjectId,
    storageObjectKey,
    sourceUrl: completed.urls?.sourceUrl ?? completed.data?.urls?.sourceUrl ?? null,
  };
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${path}:${response.status}:${text}`);
  }
  return payload;
}

async function waitForCdp() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(150);
  }
  throw new Error("cdp_not_ready");
}

async function connectCdp() {
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  return connectSocket(version.webSocketDebuggerUrl);
}

async function newPage(browser) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = {
    browser,
    sessionId,
    console: [],
    async send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
  };
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("DOM.enable");
  browser.onEvent = (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    if (event.method === "Runtime.consoleAPICalled") {
      page.console.push({
        type: event.params.type,
        text: (event.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
      });
    }
    if (event.method === "Runtime.exceptionThrown") {
      page.console.push({
        type: "error",
        text: event.params.exceptionDetails?.text ?? event.params.exceptionDetails?.exception?.description ?? "exception",
      });
    }
  };
  return page;
}

async function setCookie(page, cookie) {
  const [name, value] = cookie.split("=");
  await page.send("Network.enable");
  await page.send("Network.setCookie", {
    name,
    value,
    url: origin,
    path: "/",
  });
}

async function setViewport(page, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
}

async function navigate(page, url) {
  await page.send("Page.navigate", { url });
  await waitForLoad(page);
}

async function waitForLoad(page) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(page, "document.readyState");
    if (ready === "complete") {
      return;
    }
    await delay(100);
  }
}

async function waitForSelector(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) {
      return;
    }
    await delay(200);
  }
  const text = await evaluate(page, "document.body.innerText.slice(0, 1000)");
  throw new Error(`selector_timeout:${selector}:${text}`);
}

async function click(page, selector) {
  const result = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!result) {
    throw new Error(`click_missing:${selector}`);
  }
}

async function screenshot(page, path) {
  const { data } = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function evaluate(page, expression) {
  const response = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? "evaluate_failed");
  }
  return response.result?.value;
}

function qaMetricsScript() {
  return `(() => {
    const rectOf = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const rectOfAll = (selector) => {
      const nodes = [...document.querySelectorAll(selector)];
      if (!nodes.length) return null;
      const rects = nodes
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    const visible = (selector) => Boolean(document.querySelector(selector));
    const elements = [...document.querySelectorAll('button, input, textarea, select, video, img')];
    const bad = elements.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width < 0 || r.height < 0 || Number.isNaN(r.x) || Number.isNaN(r.y);
    }).length;
    return {
      title: document.title,
      url: location.href,
      bodyTextLength: document.body.innerText.length,
      hasEpisodeHub: visible('.episode-hub-shell'),
      hasEpisodeWorkbench: visible('.episode-replica-layout'),
      hasStoryboardMode: visible('.episode-replica-layout.storyboard-mode'),
      hasUploadLimits:
        document.body.innerText.includes('图片 20MB') ||
        Boolean(document.querySelector('.episode-replica-upload-limits')),
      hasGenerateButton: visible('.episode-replica-generate'),
      hasStoryboardToggleActive: Boolean(document.querySelector('button.active[data-action="set-muse-scope-mode"][data-mode="storyboard"]')),
      hasLeftRail: visible('.app-rail') || visible('.workbench-rail'),
      hasStage: visible('.episode-replica-generated-stage'),
      viewport: { width: innerWidth, height: innerHeight },
      mainRect: rectOf('#creator-app'),
      workbenchRect: rectOf('.episode-replica-layout'),
      episodeHubGridRect: rectOf('.episode-hub-grid'),
      launchColumnRect: rectOf('.episode-hub-launches'),
      episodeListRect: rectOfAll('.episode-hub-list .episode-library-card'),
      quickLaneRect: rectOf('.episode-replica-right'),
      badGeometryCount: bad,
    };
  })()`;
}

function validateReport(report) {
  const failures = [];
  const { project, workbench, mobile } = report.metrics ?? {};

  if ((report.consoleErrors ?? []).length > 0) {
    failures.push(`console errors detected: ${report.consoleErrors.length}`);
  }
  if ((project?.badGeometryCount ?? 0) > 0) {
    failures.push(`project page has bad geometry count ${project.badGeometryCount}`);
  }
  if ((workbench?.badGeometryCount ?? 0) > 0) {
    failures.push(`desktop workbench has bad geometry count ${workbench.badGeometryCount}`);
  }
  if ((mobile?.badGeometryCount ?? 0) > 0) {
    failures.push(`mobile workbench has bad geometry count ${mobile.badGeometryCount}`);
  }
  if (!project?.hasEpisodeHub) {
    failures.push("project episodes hub not visible");
  }
  if (!workbench?.hasEpisodeWorkbench || !workbench?.hasGenerateButton || !workbench?.hasUploadLimits) {
    failures.push("desktop workbench missing required controls");
  }
  if (!mobile?.hasEpisodeWorkbench || !mobile?.hasGenerateButton || !mobile?.hasUploadLimits) {
    failures.push("mobile workbench missing required controls");
  }

  const projectGridWidth = project?.episodeHubGridRect?.width ?? 0;
  const launchWidth = project?.launchColumnRect?.width ?? 0;
  const episodeListWidth = project?.episodeListRect?.width ?? 0;
  if (projectGridWidth > 0 && projectGridWidth > 900) {
    failures.push(`project episode hub too wide: ${projectGridWidth}`);
  }
  if (launchWidth > 0 && episodeListWidth > 0 && launchWidth >= episodeListWidth) {
    failures.push(`project launch column dominates list: launch=${launchWidth}, list=${episodeListWidth}`);
  }

  const quickLaneWidth = workbench?.quickLaneRect?.width ?? 0;
  if (quickLaneWidth > 0 && quickLaneWidth > 170) {
    failures.push(`desktop quick lane too wide: ${quickLaneWidth}`);
  }

  const mobileWorkbenchHeight = mobile?.workbenchRect?.height ?? 0;
  if (mobileWorkbenchHeight > 1900) {
    failures.push(`mobile workbench too tall: ${mobileWorkbenchHeight}`);
  }
  const mobileWorkbenchTop = mobile?.workbenchRect?.y ?? 0;
  if (mobileWorkbenchTop > 300) {
    failures.push(`mobile workbench starts too low: ${mobileWorkbenchTop}`);
  }

  if (failures.length) {
    throw new Error(`episode_workbench_qa_failed\n- ${failures.join("\n- ")}`);
  }
}

function connectSocket(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const client = {
    onEvent: null,
    close() {
      socket.close();
    },
    send(method, params = {}, sessionId = undefined) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    client.onEvent?.(message);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(client), { once: true });
    socket.addEventListener("error", () => reject(new Error("cdp_socket_error")), { once: true });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
