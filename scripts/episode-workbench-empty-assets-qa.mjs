import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const managedServer =
  process.env.QA_ORIGIN ? null : await startManagedBackendServer(Number(process.env.QA_PORT ?? 4315));
const origin = process.env.QA_ORIGIN ?? managedServer.origin;
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9225);
const artifactDir = resolve(process.cwd(), "artifacts", "episode-workbench-empty-asset-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `episode-workbench-empty-asset-qa-chrome-${Date.now()}-${randomUUID()}`,
);

await mkdir(artifactDir, { recursive: true });
await mkdir(userDataDir, { recursive: true });

const setup = await setupScenario();
const chrome = spawn(chromePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--no-first-run",
  "--no-default-browser-check",
  "--no-sandbox",
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
  const page = await newPage(browser);
  await setCookie(page, setup.cookie);
  await setViewport(page, 1440, 900);

  const workbenchUrl = `${origin}/app.html#/projects/${encodeURIComponent(setup.projectId)}/episodes/${encodeURIComponent(setup.episodeId)}`;
  await navigate(page, workbenchUrl);
  await waitForSelector(page, ".episode-replica-layout.storyboard-mode", 15_000);

  await click(page, '[data-action="set-muse-scope-mode"][data-mode="assets"]');
  await waitForSelector(page, ".episode-replica-layout.assets-mode", 10_000);
  await screenshot(page, join(artifactDir, "step-01a-role-scene-empty-state.png"));
  const emptyMetrics = await evaluate(page, emptyAssetMetricsScript());

  await click(page, '[data-action="open-episode-asset-create-modal"]');
  await waitForSelector(page, ".episode-asset-create-modal", 10_000);
  await setInputValue(page, "#episode-asset-create-name", "测试");
  await click(page, '[data-action="save-episode-asset-create"]');
  await waitForCondition(
    page,
    "document.querySelector('.episode-replica-asset-card.active .name')?.textContent?.includes('测试') ?? false",
    10_000,
  );
  await screenshot(page, join(artifactDir, "step-01b-first-role-selected-clean-panel.png"));
  const firstAssetMetrics = await evaluate(page, emptyAssetMetricsScript());

  await click(page, '[data-action="generate-images"]');
  await waitForCondition(
    page,
    "document.body.innerText.includes('请输入内容')",
    10_000,
  );
  await screenshot(page, join(artifactDir, "step-01c-role-empty-generate-toast-autosave.png"));
  const emptyPromptMetrics = await evaluate(page, emptyAssetMetricsScript());

  const report = {
    origin,
    projectId: setup.projectId,
    episodeId: setup.episodeId,
    workbenchUrl,
    screenshots: {
      emptyAsset: "artifacts/episode-workbench-empty-asset-qa/step-01a-role-scene-empty-state.png",
      firstAsset: "artifacts/episode-workbench-empty-asset-qa/step-01b-first-role-selected-clean-panel.png",
      emptyPromptToast: "artifacts/episode-workbench-empty-asset-qa/step-01c-role-empty-generate-toast-autosave.png",
    },
    metrics: {
      emptyAsset: emptyMetrics,
      firstAsset: firstAssetMetrics,
      emptyPromptToast: emptyPromptMetrics,
    },
    consoleErrors: [...page.console.filter((item) => item.type === "error")],
  };

  validateReport(report);
  await writeFile(join(artifactDir, "browser-qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
  if (managedServer) {
    managedServer.child.kill();
    if (managedServer.child.exitCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        managedServer.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    const backendLog = `${managedServer.getStdout().trim()}\n${managedServer.getStderr().trim()}`.trim();
    if (backendLog) {
      await writeFile(join(artifactDir, "backend-server.log"), `${backendLog}\n`, "utf8");
    }
  }
}

async function startManagedBackendServer(port) {
  const child = spawn(resolveManagedNodeRuntime(), ["scripts/run-phone-auth-dev-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      STORAGE_ADAPTER_MODE: "dev",
      STORAGE_PROVIDER: "dev",
      EPISODE_IMAGE_GENERATION_COST: process.env.EPISODE_IMAGE_GENERATION_COST ?? "1",
      EPISODE_VIDEO_GENERATION_COST: process.env.EPISODE_VIDEO_GENERATION_COST ?? "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const nextOrigin = `http://127.0.0.1:${port}`;
  await waitForHttpReady(nextOrigin, child, () => stdout, () => stderr);
  return {
    origin: nextOrigin,
    child,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

async function waitForHttpReady(originUrl, child, getStdout, getStderr) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `managed_backend_exited:${child.exitCode}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
      );
    }
    try {
      const response = await fetch(`${originUrl}/`);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(400);
  }
  throw new Error(
    `managed_backend_timeout:${originUrl}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
  );
}

function resolveManagedNodeRuntime() {
  const candidates = [
    process.env.QA_NODE_PATH,
    "D:\\nodejs\\node.exe",
    process.execPath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return process.execPath;
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
    idempotencyKey: `qa-empty-asset-project-${Date.now()}`,
    body: {
      name: "角色场景空态联调",
      scriptInput: "第1集：验证角色场景空态、首卡选中与空 prompt 校验。",
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
  const episodeEnvelope = await jsonFetch(`/api/projects/${project.project.id}/episodes`, {
    method: "POST",
    cookie,
    idempotencyKey: `qa-empty-asset-episode-${Date.now()}`,
    body: { title: "角色场景空态集" },
  });
  return {
    cookie,
    projectId: project.project.id,
    episodeId: episodeEnvelope.data.episode.id,
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

async function waitForCondition(page, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const passed = await evaluate(page, `Boolean(${expression})`);
    if (passed) {
      return;
    }
    await delay(200);
  }
  const text = await evaluate(page, "document.body.innerText.slice(0, 1200)");
  throw new Error(`condition_timeout:${expression}:${text}`);
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

async function setInputValue(page, selector, value) {
  const result = await evaluate(page, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!result) {
    throw new Error(`input_missing:${selector}`);
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

function emptyAssetMetricsScript() {
  return `(() => ({
    bodyText: document.body.innerText,
    promptLength: document.querySelector('#video-prompt-input')?.value?.length ?? 0,
    hasAssetMode: Boolean(document.querySelector('.episode-replica-layout.assets-mode')),
    hasBlankAssetCanvas: Boolean(document.querySelector('.episode-replica-asset-empty-canvas')),
    hasQuickLaneEmptyMessage: document.body.innerText.includes('没有匹配到可快捷引用的资产'),
    selectedAssetName: document.querySelector('.episode-replica-asset-card.active .name')?.textContent?.trim() ?? '',
    stageTitle: document.querySelector('.episode-replica-stage-title')?.textContent?.trim() ?? '',
    hasPromptPlaceholder: document.querySelector('#video-prompt-input')?.getAttribute('placeholder') === '请输入您的生图要求',
    hasValidationToast: document.body.innerText.includes('请输入内容'),
    hasResultAction: Boolean(document.querySelector('[data-result-action="set-character"]')),
  }))()`;
}

function validateReport(report) {
  const failures = [];
  if ((report.consoleErrors ?? []).length > 0) {
    failures.push(`console errors detected: ${report.consoleErrors.length}`);
  }
  if (!report.metrics?.emptyAsset?.hasAssetMode) {
    failures.push("asset mode did not render");
  }
  if (!report.metrics?.emptyAsset?.hasBlankAssetCanvas) {
    failures.push("empty asset canvas did not render");
  }
  if (report.metrics?.emptyAsset?.hasQuickLaneEmptyMessage) {
    failures.push("empty asset state should not show quick-lane empty copy");
  }
  if (!report.metrics?.emptyAsset?.hasPromptPlaceholder) {
    failures.push("empty asset prompt placeholder missing");
  }
  if (report.metrics?.firstAsset?.selectedAssetName !== "测试") {
    failures.push(`expected first selected asset to be 测试, got ${report.metrics?.firstAsset?.selectedAssetName}`);
  }
  if (!String(report.metrics?.firstAsset?.stageTitle ?? "").includes("角色测试：")) {
    failures.push(`first asset stage title mismatch: ${report.metrics?.firstAsset?.stageTitle}`);
  }
  if (report.metrics?.firstAsset?.promptLength !== 0) {
    failures.push(`first asset prompt should stay empty, got length ${report.metrics?.firstAsset?.promptLength}`);
  }
  if (report.metrics?.firstAsset?.hasResultAction) {
    failures.push("first asset should not pre-render generation results");
  }
  if (!report.metrics?.emptyPromptToast?.hasValidationToast) {
    failures.push("empty asset prompt toast did not render");
  }
  if (report.metrics?.emptyPromptToast?.hasResultAction) {
    failures.push("empty asset generate should not create result actions");
  }
  if (failures.length) {
    throw new Error(`episode_workbench_empty_asset_qa_failed\n- ${failures.join("\n- ")}`);
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
