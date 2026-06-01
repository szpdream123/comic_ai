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
const artifactDir = resolve(process.cwd(), "artifacts", "team-member-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `team-member-qa-chrome-${Date.now()}-${randomUUID()}`,
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
  const desktop = await newPage(browser);
  await setCookie(desktop, setup.cookie);
  await setViewport(desktop, 1440, 900);

  const projectUrl = `${origin}/app.html#/projects/${encodeURIComponent(setup.projectId)}`;
  await navigate(desktop, projectUrl);
  await waitForSelector(desktop, '[data-action="set-nav-tab"][data-tab="team"]', 15_000);
  await click(desktop, '[data-action="set-nav-tab"][data-tab="team"]');
  await waitForSelector(desktop, ".team-page", 15_000);
  await waitForCondition(
    desktop,
    `document.body.innerText.includes(${JSON.stringify(setup.ownerDisplayPhone)})`,
    15_000,
  );
  await screenshot(desktop, join(artifactDir, "team-page-initial.png"));
  const initialMetrics = await evaluate(desktop, qaMetricsScript());

  await click(desktop, '[data-action="open-create-member"]');
  await waitForSelector(desktop, '[data-modal="create-member"]', 10_000);
  await setFieldValue(desktop, "#team-member-role-input", "producer");
  await setFieldValue(desktop, "#team-member-phone-input", setup.createdMemberPhone);
  await setFieldValue(desktop, "#team-member-note-input", "browser-qa-created");
  await click(desktop, '[data-action="submit-create-member"]');
  await waitForCondition(
    desktop,
    `document.querySelector('[data-modal="create-member"]') === null`,
    15_000,
  );
  const createdMember = await waitForMemberInApi(
    setup.projectId,
    setup.cookie,
    setup.createdMemberDisplayPhone,
    15_000,
  );
  await waitForCondition(
    desktop,
    `document.body.innerText.includes(${JSON.stringify(setup.createdMemberDisplayPhone)}) || document.body.innerText.includes(${JSON.stringify(`已创建成员：${createdMember.phone}`)})`,
    15_000,
  );
  await screenshot(desktop, join(artifactDir, "team-page-member-created.png"));
  const createdMetrics = await evaluate(desktop, qaMetricsScript());

  await clickMemberAction(desktop, setup.createdMemberDisplayPhone);
  await waitForSelector(desktop, '[data-modal="edit-member"]', 10_000);
  await setFieldValue(desktop, "#team-edit-member-role-input", "viewer");
  await setFieldValue(desktop, "#team-edit-member-note-input", "browser-qa-updated");
  await click(desktop, '[data-action="submit-edit-member"]');
  await waitForMemberFieldInApi(
    setup.projectId,
    setup.cookie,
    setup.createdMemberDisplayPhone,
    (member) => member.role === "viewer" && member.note === "browser-qa-updated",
    15_000,
  );
  await waitForCondition(
    desktop,
    `document.body.innerText.includes("成员信息已更新。") && document.body.innerText.includes(${JSON.stringify("browser-qa-updated")})`,
    15_000,
  );
  await click(desktop, '[data-action="toggle-member-status"]');
  await waitForMemberFieldInApi(
    setup.projectId,
    setup.cookie,
    setup.createdMemberDisplayPhone,
    (member) => member.status === "disabled",
    15_000,
  );
  await waitForCondition(
    desktop,
    `document.body.innerText.includes("成员已停用。") && document.body.innerText.includes("已停用")`,
    15_000,
  );
  await screenshot(desktop, join(artifactDir, "team-page-member-disabled.png"));
  const disabledMetrics = await evaluate(desktop, qaMetricsScript());

  await click(desktop, '[data-action="open-team-dashboard"]');
  await waitForSelector(desktop, ".team-dashboard-page", 10_000);
  await setFieldValue(desktop, '[data-action="set-team-dashboard-role-filter"]', "viewer");
  await setFieldValue(desktop, '[data-action="set-team-dashboard-status-filter"]', "disabled");
  await waitForCondition(
    desktop,
    `document.body.innerText.includes(${JSON.stringify(setup.createdMemberDisplayPhone)}) && document.body.innerText.includes("已停用")`,
    15_000,
  );
  await clickDashboardAction(desktop, setup.createdMemberDisplayPhone);
  await waitForCondition(
    desktop,
    `document.body.innerText.includes(${JSON.stringify("角色：查看者")}) && document.body.innerText.includes(${JSON.stringify("状态：已停用")})`,
    10_000,
  );
  await screenshot(desktop, join(artifactDir, "team-dashboard-member-disabled.png"));
  const dashboardMetrics = await evaluate(desktop, qaMetricsScript());

  const report = {
    origin,
    projectId: setup.projectId,
    ownerPhone: setup.ownerDisplayPhone,
    createdMemberPhone: setup.createdMemberDisplayPhone,
    screenshots: {
      initial: "artifacts/team-member-qa/team-page-initial.png",
      created: "artifacts/team-member-qa/team-page-member-created.png",
      disabled: "artifacts/team-member-qa/team-page-member-disabled.png",
      dashboard: "artifacts/team-member-qa/team-dashboard-member-disabled.png",
    },
    metrics: {
      initial: initialMetrics,
      created: createdMetrics,
      disabled: disabledMetrics,
      dashboard: dashboardMetrics,
    },
    consoleErrors: desktop.console.filter((item) => item.type === "error"),
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
    await writeFile(join(artifactDir, "chrome-stderr.log"), `${stderr}\n`, "utf8");
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

async function waitForHttpReady(nextOrigin, child, getStdout, getStderr) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `managed_backend_exited:${child.exitCode}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
      );
    }
    try {
      const response = await fetch(`${nextOrigin}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // continue polling
    }
    await delay(400);
  }
  throw new Error(
    `managed_backend_timeout:${nextOrigin}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
  );
}

function resolveManagedNodeRuntime() {
  const candidates = [process.env.QA_NODE_PATH, "D:\\nodejs\\node.exe", process.execPath].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return process.execPath;
}

async function setupScenario() {
  const ownerPhone = `138${String(Date.now()).slice(-8)}`;
  const createdMemberPhone = `139${String(Date.now()).slice(-8)}`;
  const ownerDisplayPhone = `+86${ownerPhone}`;
  const createdMemberDisplayPhone = `+86${createdMemberPhone}`;
  const request = await jsonFetch("/api/auth/code/request", {
    method: "POST",
    body: { phone: ownerPhone },
  });
  const debug = await jsonFetch(`/api/auth/dev/challenges/${request.challengeId}`);
  const verifyResponse = await fetch(`${origin}/api/auth/code/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: request.challengeId,
      phone: ownerPhone,
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
    idempotencyKey: `qa-team-project-${Date.now()}`,
    body: {
      name: "团队链路联调",
      scriptInput: "第 1 集：验证团队成员创建、编辑、停用与看板筛选链路。",
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
  await jsonFetch("/api/creator/parse", {
    method: "POST",
    cookie,
    idempotencyKey: `qa-team-parse-${Date.now()}`,
    body: {},
  });
  return {
    cookie,
    projectId: project.project.id,
    ownerPhone,
    ownerDisplayPhone,
    createdMemberPhone,
    createdMemberDisplayPhone,
  };
}

async function jsonFetch(pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname}:${response.status}:${JSON.stringify(payload)}`);
  }
  return payload?.data ?? payload;
}

async function waitForMemberInApi(projectId, cookie, phone, timeoutMs) {
  return waitForMemberFieldInApi(projectId, cookie, phone, () => true, timeoutMs);
}

async function waitForMemberFieldInApi(projectId, cookie, phone, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await jsonFetch(`/api/creator/projects/${encodeURIComponent(projectId)}/members`, {
      cookie,
    });
    const members = Array.isArray(payload.members) ? payload.members : [];
    const match = members.find((member) => String(member?.phone ?? "") === phone);
    if (match && predicate(match)) {
      return match;
    }
    await delay(300);
  }
  throw new Error(`member_api_timeout:${phone}`);
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // continue polling
    }
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
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = {
    sessionId,
    console: [],
    send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
  };
  browser.onEvent = (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    if (event.method === "Runtime.consoleAPICalled") {
      page.console.push({
        type: event.params.type,
        text: event.params.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") ?? "",
      });
    }
    if (event.method === "Runtime.exceptionThrown") {
      page.console.push({
        type: "error",
        text: event.params.exceptionDetails?.text ?? "exception",
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
  const text = await evaluate(page, "document.body.innerText.slice(0, 1200)");
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
  if (!result) {
    throw new Error(`click_missing:${selector}`);
  }
}

async function clickMemberAction(page, phone) {
  const result = await evaluate(page, `(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    for (const row of rows) {
      if ((row.innerText || '').includes(${JSON.stringify(phone)})) {
        const button = row.querySelector('[data-action="open-edit-member"]');
        if (button) {
          button.click();
          return true;
        }
      }
    }
    return false;
  })()`);
  if (!result) {
    throw new Error(`member_action_missing:${phone}`);
  }
}

async function clickDashboardAction(page, phone) {
  const result = await evaluate(page, `(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    for (const row of rows) {
      if ((row.innerText || '').includes(${JSON.stringify(phone)})) {
        const button = row.querySelector('[data-action="view-team-dashboard-member"]');
        if (button) {
          button.click();
          return true;
        }
      }
    }
    return false;
  })()`);
  if (!result) {
    throw new Error(`dashboard_action_missing:${phone}`);
  }
}

async function setFieldValue(page, selector, value) {
  const result = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  })()`);
  if (!result) {
    throw new Error(`field_missing:${selector}`);
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
    const visible = (selector) => Boolean(document.querySelector(selector));
    const rowTexts = [...document.querySelectorAll('tbody tr')].map((row) => row.innerText || '');
    return {
      url: location.href,
      hasTeamPage: visible('.team-page'),
      hasDashboardPage: visible('.team-dashboard-page'),
      hasCreateModal: visible('[data-modal="create-member"]'),
      hasEditModal: visible('[data-modal="edit-member"]'),
      memberRows: rowTexts.length,
      rowTexts,
      bodyText: document.body.innerText,
    };
  })()`;
}

function validateReport(report) {
  const failures = [];
  const initial = report.metrics?.initial ?? {};
  const created = report.metrics?.created ?? {};
  const disabled = report.metrics?.disabled ?? {};
  const dashboard = report.metrics?.dashboard ?? {};

  if ((report.consoleErrors ?? []).length > 0) {
    failures.push(`console errors detected: ${report.consoleErrors.length}`);
  }
  if (!initial.hasTeamPage) {
    failures.push("team page did not render");
  }
  if (!String(initial.bodyText ?? "").includes(report.ownerPhone)) {
    failures.push("owner member missing on initial team page");
  }
  if (!String(created.bodyText ?? "").includes(report.createdMemberPhone)) {
    failures.push("created member phone missing after create flow");
  }
  if (!String(created.bodyText ?? "").includes("browser-qa-created")) {
    failures.push("created member note missing after create flow");
  }
  if (!String(disabled.bodyText ?? "").includes("已停用")) {
    failures.push("disabled member state missing after toggle flow");
  }
  if (!String(disabled.bodyText ?? "").includes("browser-qa-updated")) {
    failures.push("updated member note missing after edit flow");
  }
  if (!dashboard.hasDashboardPage) {
    failures.push("team dashboard did not render");
  }
  if (!String(dashboard.bodyText ?? "").includes(report.createdMemberPhone)) {
    failures.push("created member missing on dashboard");
  }
  if (!String(dashboard.bodyText ?? "").includes("角色：查看者")) {
    failures.push("dashboard inspector missing updated role");
  }
  if (!String(dashboard.bodyText ?? "").includes("状态：已停用")) {
    failures.push("dashboard inspector missing disabled status");
  }

  if (failures.length) {
    throw new Error(`team_member_qa_failed\n- ${failures.join("\n- ")}`);
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
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message));
      } else {
        resolve(payload.result ?? {});
      }
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
