import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loginWithPasswordQaUser } from "../scripts/browser-qa-auth.mjs";

const origin = process.env.QA_ORIGIN ?? "http://127.0.0.1:4310";
const chromePath = process.env.CHROME_PATH ?? "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9236);
const networkLatencyMs = Math.max(0, Number(process.env.QA_NETWORK_LATENCY_MS ?? 0));
const artifactDir = resolve(process.cwd(), "artifacts", "canvas-open-performance-qa");
const userDataDir = resolve(process.cwd(), ".local", `canvas-open-performance-qa-${Date.now()}-${randomUUID()}`);
const qaPhone = "13900004310";

await mkdir(artifactDir, { recursive: true });
await mkdir(userDataDir, { recursive: true });

const cookie = await loginWithPasswordQaUser(origin, qaPhone);
const canvasId = await createCanvas(cookie);
const chrome = spawn(chromePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--no-sandbox",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

try {
  await waitForCdp();
  const browser = await connectCdp();
  const page = await newPage(browser);
  await page.send("Network.enable");
  const [cookieName, cookieValue] = cookie.split("=", 2);
  await page.send("Network.setCookie", { url: origin, name: cookieName, value: cookieValue, path: "/" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: `${origin}/new-canvas` });
  await waitFor(page, "Boolean(document.querySelector('.canvas-project-gallery [data-action=\"open-canvas-project\"]'))", 15_000);
  if (networkLatencyMs > 0) {
    await page.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: networkLatencyMs,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "cellular3g",
    });
  }

  const click = await evaluate(page, `(() => {
    const button = document.querySelector('[data-action="open-canvas-project"][data-canvas-project-id="${canvasId}"]');
    if (!button) throw new Error("canvas_card_missing");
    const startedAt = performance.now();
    button.click();
    return {
      startedAt,
      feedbackVisible: Boolean(document.querySelector('[data-canvas-project-opening="true"]')),
    };
  })()`);
  const clickAt = click.startedAt;
  await delay(20);
  const { data: openingScreenshot } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(resolve(artifactDir, "opening-card.png"), Buffer.from(openingScreenshot, "base64"));
  const timings = await waitForCanvasTimeline(page, clickAt, click.feedbackVisible);
  const { data: screenshot } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(resolve(artifactDir, "mounted-canvas.png"), Buffer.from(screenshot, "base64"));

  const report = {
    canvasId,
    networkLatencyMs,
    timings,
    consoleErrors: page.console.filter((entry) => entry.type === "error"),
    screenshots: {
      opening: "artifacts/canvas-open-performance-qa/opening-card.png",
      mounted: "artifacts/canvas-open-performance-qa/mounted-canvas.png",
    },
  };
  await writeFile(resolve(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  browser.close();
} finally {
  chrome.kill();
  await waitForExit(chrome);
  await deleteCanvas(cookie, canvasId);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

async function createCanvas(cookie) {
  const response = await fetch(`${origin}/api/creator/canvases`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Canvas open performance QA", status: "draft" }),
  });
  const payload = await response.json();
  const canvasId = String(payload?.data?.project?.id ?? payload?.project?.id ?? "");
  if (!response.ok || !canvasId) throw new Error(`canvas_create_failed:${response.status}`);
  return canvasId;
}

async function deleteCanvas(cookie, canvasId) {
  if (!canvasId) return;
  await fetch(`${origin}/api/creator/canvases/${encodeURIComponent(canvasId)}`, {
    method: "DELETE",
    headers: { cookie },
  }).catch(() => {});
}

async function waitForCanvasTimeline(page, clickAt, feedbackVisible) {
  const timings = { feedbackMs: feedbackVisible ? 0 : null, hostMs: null, mountedMs: null };
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await evaluate(page, `(() => {
      const host = document.querySelector('[data-new-canvas-mount]');
      return {
        now: performance.now(),
        feedback: Boolean(document.querySelector('[data-canvas-project-opening="true"]')),
        host: Boolean(host),
        mounted: host?.dataset?.newCanvasMounted === "true",
      };
    })()`);
    if (state.feedback && timings.feedbackMs === null) timings.feedbackMs = Math.round(state.now - clickAt);
    if (state.host && timings.hostMs === null) timings.hostMs = Math.round(state.now - clickAt);
    if (state.mounted && timings.mountedMs === null) timings.mountedMs = Math.round(state.now - clickAt);
    if (timings.hostMs !== null && timings.mountedMs !== null) return timings;
    await delay(20);
  }
  throw new Error(`canvas_timeline_timeout:${JSON.stringify(timings)}`);
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("cdp_timeout");
}

async function connectCdp() {
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
  return connectSocket(version.webSocketDebuggerUrl);
}

async function newPage(browser) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = { console: [], send(method, params = {}) { return browser.send(method, params, sessionId); } };
  browser.onEvent = (event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.consoleAPICalled") {
      page.console.push({ type: event.params.type, text: event.params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") ?? "" });
    }
    if (event.method === "Runtime.exceptionThrown") page.console.push({ type: "error", text: event.params.exceptionDetails?.text ?? "exception" });
  };
  return page;
}

async function waitFor(page, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(page, `Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`condition_timeout:${expression}`);
}

async function evaluate(page, expression) {
  const response = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "evaluate_failed");
  return response.result?.value;
}

function connectSocket(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  const client = {
    onEvent: null,
    close() { socket.close(); },
    send(method, params = {}, sessionId = undefined) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message));
      else resolve(payload.result ?? {});
      return;
    }
    client.onEvent?.(payload);
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(client), { once: true });
    socket.addEventListener("error", (event) => reject(event.error ?? new Error("socket_error")), { once: true });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", () => resolve());
  });
}
