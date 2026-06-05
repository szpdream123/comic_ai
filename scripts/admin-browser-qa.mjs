import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const managedServer =
  process.env.QA_ORIGIN ? null : await startManagedBackendServer(Number(process.env.QA_PORT ?? 4316));
const origin = process.env.QA_ORIGIN ?? managedServer.origin;
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9226);
const artifactDir = resolve(process.cwd(), "artifacts", "admin-browser-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `admin-browser-qa-chrome-${Date.now()}-${randomUUID()}`,
);

await mkdir(artifactDir, { recursive: true });
await mkdir(userDataDir, { recursive: true });

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
  await ensureBootstrapAdmin();
  await waitForCdp();
  const browser = await connectCdp();
  const desktop = await newPage(browser);
  await setViewport(desktop, 1366, 900);
  await navigate(desktop, `${origin}/admin/login`);
  await screenshot(desktop, join(artifactDir, "00-login-desktop.png"));
  await loginIfNeeded(desktop);
  await waitForCondition(desktop, "Boolean(document.querySelector('.admin-shell'))", 15_000);

  const desktopPages = [
    ["dashboard", "01-dashboard-desktop.png", "button[data-page='dashboard']"],
    ["models", "02-models-desktop.png", "button[data-page='models']"],
    ["modelWorkbench", "03-model-workbench-desktop.png", "button[data-page='model-workbench']"],
    ["users", "04-users-desktop.png", "button[data-page='users']"],
    ["risks", "05-risks-desktop.png", "button[data-page='risks']"],
    ["settings", "06-settings-desktop.png", "button[data-page='settings']"],
    ["account", "07-account-desktop.png", "button[data-page='account']"],
  ];
  const metrics = {};
  for (const [key, fileName, selector] of desktopPages) {
    await click(desktop, selector);
    await delay(500);
    await screenshot(desktop, join(artifactDir, fileName));
    metrics[key] = await evaluate(desktop, qaMetricsScript());
  }

  const mobile = await newPage(browser);
  await setViewport(mobile, 390, 844);
  await navigate(mobile, `${origin}/admin/login`);
  await loginIfNeeded(mobile);
  await screenshot(mobile, join(artifactDir, "08-dashboard-mobile.png"));
  await click(mobile, "button[data-page='models']");
  await delay(500);
  await screenshot(mobile, join(artifactDir, "09-models-mobile.png"));
  await click(mobile, "button[data-page='model-workbench']");
  await delay(500);
  await screenshot(mobile, join(artifactDir, "10-model-workbench-mobile.png"));
  metrics.mobileDashboard = await evaluate(mobile, qaMetricsScript());

  const report = {
    origin,
    screenshotsDir: "artifacts/admin-browser-qa",
    metrics,
    consoleErrors: [
      ...desktop.console.filter((item) => item.type === "error"),
      ...mobile.console.filter((item) => item.type === "error"),
    ],
  };
  validateReport(report);
  await writeFile(join(artifactDir, "admin-browser-qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  browser.close();
} finally {
  chrome.stderr.destroy();
  chrome.kill();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) {
    await writeFile(join(artifactDir, "chrome-stderr.log"), `${stderr}\n`, "utf8");
  }
  if (managedServer) {
    managedServer.child.kill();
    const backendLog = `${managedServer.getStdout().trim()}\n${managedServer.getStderr().trim()}`.trim();
    if (backendLog) {
      await writeFile(join(artifactDir, "backend-server.log"), `${backendLog}\n`, "utf8");
    }
  }
}

async function ensureBootstrapAdmin() {
  const response = await fetch(`${origin}/api/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName: "admin", password: "admin123" }),
  }).catch(() => null);
  if (response?.ok) return;
  const child = spawn(resolveManagedNodeRuntime(), ["--import", "tsx", "scripts/bootstrap-admin-account.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const status = await waitForExit(child);
  if (status !== 0) {
    throw new Error(`admin_bootstrap_failed:${status}`);
  }
}

async function startManagedBackendServer(port) {
  const child = spawn(resolveManagedNodeRuntime(), ["scripts/run-phone-auth-dev-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), STORAGE_ADAPTER_MODE: "dev", STORAGE_PROVIDER: "dev" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const nextOrigin = `http://127.0.0.1:${port}`;
  await waitForHttpReady(nextOrigin, child, () => stdout, () => stderr);
  return { origin: nextOrigin, child, getStdout: () => stdout, getStderr: () => stderr };
}

async function waitForHttpReady(nextOrigin, child, getStdout, getStderr) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`managed_backend_exited:${child.exitCode}\n${getStdout().trim()}\n${getStderr().trim()}`.trim());
    }
    try {
      const response = await fetch(`${nextOrigin}/admin/login`);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`managed_backend_timeout:${nextOrigin}\n${getStdout().trim()}\n${getStderr().trim()}`.trim());
}

function resolveManagedNodeRuntime() {
  const candidates = [process.env.QA_NODE_PATH, "D:\\nodejs\\node.exe", process.execPath].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return process.execPath;
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`cdp_timeout:${debugPort}`);
}

async function connectCdp() {
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
  return connectSocket(version.webSocketDebuggerUrl);
}

async function newPage(browser) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = {
    sessionId,
    console: [],
    send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
  };
  browser.onEvent = (event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.consoleAPICalled") {
      page.console.push({
        type: event.params.type,
        text: event.params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") ?? "",
      });
    }
    if (event.method === "Runtime.exceptionThrown") {
      page.console.push({ type: "error", text: event.params.exceptionDetails?.text ?? "exception" });
    }
  };
  return page;
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
    if (ready === "complete") return;
    await delay(100);
  }
}

async function waitForSelector(page, selector, timeoutMs) {
  await waitForCondition(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs);
}

async function loginIfNeeded(page) {
  await waitForCondition(
    page,
    "Boolean(document.querySelector('.admin-shell')) || Boolean(document.querySelector('#login-form'))",
    15_000,
  );
  const hasShell = await evaluate(page, "Boolean(document.querySelector('.admin-shell'))");
  if (hasShell) return;
  await setFieldValue(page, "#login-name", "admin");
  await setFieldValue(page, "#login-password", "admin123");
  await click(page, '#login-form button[type="submit"]');
  await waitForCondition(page, "location.pathname === '/admin/dashboard'", 20_000);
}

async function waitForCondition(page, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const passed = await evaluate(page, `Boolean(${expression})`);
    if (passed) return;
    await delay(200);
  }
  const text = await evaluate(page, "document.body.innerText.slice(0, 1600)");
  throw new Error(`condition_timeout:${expression}:${text}`);
}

async function click(page, selector) {
  const result = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!result) throw new Error(`click_missing:${selector}`);
}

async function setFieldValue(page, selector, value) {
  const result = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!result) throw new Error(`field_missing:${selector}`);
}

async function screenshot(page, path) {
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function evaluate(page, expression) {
  const response = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "evaluate_failed");
  return response.result?.value;
}

function qaMetricsScript() {
  return `(() => {
    const body = document.documentElement;
    const tableWraps = [...document.querySelectorAll('.table-wrap')];
    const actionCells = [...document.querySelectorAll('td.actions, th.actions')];
    const viewportWidth = innerWidth;
    const viewportHeight = innerHeight;
    return {
      url: location.href,
      bodyText: document.body.innerText,
      hasAdminShell: Boolean(document.querySelector('.admin-shell')),
      hasLoginForm: Boolean(document.querySelector('#login-form')),
      hasDrawer: Boolean(document.querySelector('.drawer:not(.hidden)')),
      tableWrapCount: tableWraps.length,
      horizontalOverflow: body.scrollWidth > body.clientWidth + 2,
      viewportWidth,
      viewportHeight,
      actionCellsVisible: actionCells.every((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.right <= viewportWidth + 1 && rect.left >= -1;
      }),
      maxActionRight: Math.max(0, ...actionCells.map((cell) => cell.getBoundingClientRect().right)),
      maxTableScrollExtra: Math.max(0, ...tableWraps.map((wrap) => wrap.scrollWidth - wrap.clientWidth)),
    };
  })()`;
}

function validateReport(report) {
  const failures = [];
  if ((report.consoleErrors ?? []).length > 0) {
    failures.push(`console errors detected: ${report.consoleErrors.length}`);
  }
  for (const [name, metrics] of Object.entries(report.metrics ?? {})) {
    if (!metrics.hasAdminShell && name !== "login") failures.push(`${name} missing admin shell`);
    if (metrics.horizontalOverflow && !["models", "users"].includes(name)) {
      failures.push(`${name} has page horizontal overflow`);
    }
    if (!metrics.actionCellsVisible) failures.push(`${name} action cells are not visible`);
  }
  if (failures.length) {
    throw new Error(`admin_browser_qa_failed\n- ${failures.join("\n- ")}`);
  }
}

function connectSocket(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const client = {
    onEvent: null,
    close() { socket.close(); },
    send(method, params = {}, sessionId = undefined) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
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

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
