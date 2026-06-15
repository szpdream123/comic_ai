import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:4310";
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9231);
const artifactDir = resolve(process.cwd(), "artifacts", "project-delete-browser-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `project-delete-browser-qa-${Date.now()}-${randomUUID()}`,
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
  await navigate(page, `${origin}/app.html#project`);
  await waitForSelector(page, ".project-card", 20_000);
  await waitForCondition(
    page,
    `document.body.innerText.includes(${JSON.stringify(setup.projectName)})`,
    20_000,
  );
  await screenshot(page, join(artifactDir, "before-delete.png"));

  await click(
    page,
    `[data-action="open-project-actions"][data-project-id="${setup.projectId}"]`,
  );
  await waitForSelector(page, `[data-action="request-delete-project"][data-project-id="${setup.projectId}"]`, 10_000);
  await click(
    page,
    `[data-action="request-delete-project"][data-project-id="${setup.projectId}"]`,
  );
  await waitForSelector(page, "[data-action=\"confirm-delete-project\"]", 10_000);

  const deleteWait = waitForProjectDeleteResponse(page);
  await click(page, "[data-action=\"confirm-delete-project\"]");
  const deleteResponse = await deleteWait;
  await waitForCondition(
    page,
    `!document.body.innerText.includes(${JSON.stringify(setup.projectName)})`,
    20_000,
  );
  await screenshot(page, join(artifactDir, "after-delete.png"));

  const report = {
    origin,
    projectId: setup.projectId,
    projectName: setup.projectName,
    exportRecordStatus: setup.exportRecordStatus,
    deleteResponse,
    console: page.console,
    screenshotsDir: artifactDir,
  };
  await writeFile(join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} finally {
  chrome.stderr.destroy();
  chrome.kill();
  if (chrome.exitCode === null) {
    await new Promise((resolve) => {
      chrome.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) {
    await writeFile(join(artifactDir, "chrome-stderr.log"), stderr, "utf8");
  }
}

async function setupScenario() {
  const phone = `138${String(Date.now()).slice(-8)}`;
  const key = Date.now();
  const projectName = `Project delete browser QA ${key}`;
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
    idempotencyKey: `project-delete-create-${key}`,
    body: {
      name: projectName,
      scriptInput: "Episode 1: A project is exported before deletion.",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
  });
  await jsonFetch("/api/creator/parse", {
    method: "POST",
    cookie,
    idempotencyKey: `project-delete-parse-${key}`,
    body: {},
  });
  await jsonFetch("/api/creator/assets/confirm-all", {
    method: "POST",
    cookie,
    body: {},
  });
  await jsonFetch("/api/creator/calibration/run", {
    method: "POST",
    cookie,
    idempotencyKey: `project-delete-calibration-${key}`,
    body: {},
  });
  await jsonFetch("/api/creator/images/generate", {
    method: "POST",
    cookie,
    idempotencyKey: `project-delete-image-${key}`,
    body: {},
  });
  const exported = await jsonFetch("/api/creator/export/preview", {
    method: "POST",
    cookie,
    idempotencyKey: `project-delete-export-${key}`,
    body: {},
  });

  return {
    cookie,
    projectId: project.project.id,
    projectName,
    exportRecordStatus: exported.exportRecord.manifestStatus,
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
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`json_fetch_failed:${path}:${response.status}:${text}`);
  }
  return body;
}

async function waitForCdp() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await delay(150);
  }
  throw new Error("cdp_not_ready");
}

async function connectCdp() {
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  return connectSocket(version.webSocketDebuggerUrl);
}

function connectSocket(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const browser = {
    onEvent: null,
    send(method, params = {}, sessionId = undefined) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result ?? {});
      return;
    }
    browser.onEvent?.(message);
  });
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(browser));
    socket.once("error", reject);
  });
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
    responses: [],
    async send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
  };
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("DOM.enable");
  await page.send("Network.enable");
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
    if (event.method === "Network.responseReceived") {
      page.responses.push({
        requestId: event.params.requestId,
        url: event.params.response?.url ?? "",
        status: event.params.response?.status ?? 0,
        method: event.params.type,
      });
    }
  };
  return page;
}

async function setCookie(page, cookie) {
  const [name, value] = cookie.split("=");
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
  await waitForCondition(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs);
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

async function waitForProjectDeleteResponse(page) {
  const before = page.responses.length;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = page.responses
      .slice(before)
      .find((entry) => entry.url.endsWith("/api/creator/project") && entry.status > 0);
    if (match) {
      return match;
    }
    await delay(100);
  }
  throw new Error("delete_response_timeout");
}

async function screenshot(page, path) {
  const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? result.exceptionDetails.exception?.description ?? "evaluate_failed");
  }
  return result.result?.value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveManagedNodeRuntime() {
  const candidates = [
    process.execPath,
    "D:\\node\\node.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return process.execPath;
}
