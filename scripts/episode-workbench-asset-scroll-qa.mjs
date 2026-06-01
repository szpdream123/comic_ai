import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const managedServer =
  process.env.QA_ORIGIN ? null : await startManagedBackendServer(Number(process.env.QA_PORT ?? 4317));
const origin = process.env.QA_ORIGIN ?? managedServer.origin;
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
const debugPort = Number(process.env.QA_CDP_PORT ?? 9227);
const artifactDir = resolve(process.cwd(), "artifacts", "episode-workbench-asset-scroll-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `episode-workbench-asset-scroll-qa-chrome-${Date.now()}-${randomUUID()}`,
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
  await waitForCondition(
    page,
    "document.querySelectorAll('.episode-replica-asset-section').length === 3 && document.querySelectorAll('.episode-replica-asset-card').length >= 8",
    10_000,
  );

  const backendWorkbench = await jsonFetch(`/api/episodes/${setup.episodeId}/workbench`, {
    cookie: setup.cookie,
  });
  const before = await evaluate(page, assetScrollMetricsScript());
  const backendVsUiBefore = await evaluate(page, compareEpisodeAssetCardsScript(setup.assetIds));
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="prop"]');
  await waitForSectionNearTop(page, "prop");
  const afterProp = await evaluate(page, assetScrollMetricsScript());
  const backendVsUiAfterProp = await evaluate(page, compareEpisodeAssetCardsScript(setup.assetIds));
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="scene"]');
  await waitForSectionNearTop(page, "scene");
  const afterScene = await evaluate(page, assetScrollMetricsScript());
  const backendVsUiAfterScene = await evaluate(page, compareEpisodeAssetCardsScript(setup.assetIds));
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="character"]');
  await waitForCondition(
    page,
    `(() => {
      const left = document.querySelector('.episode-replica-left');
      return Boolean(left && left.scrollTop < 20 && document.querySelector('[data-action="set-project-asset-tab"][data-asset-tab="character"]')?.classList.contains('active'));
    })()`,
    10_000,
  );
  const afterCharacter = await evaluate(page, assetScrollMetricsScript());
  const backendVsUiAfterCharacter = await evaluate(page, compareEpisodeAssetCardsScript(setup.assetIds));
  await screenshot(page, resolve(artifactDir, "asset-scroll-desktop.png"));

  const report = {
    origin,
    workbenchUrl,
    projectId: setup.projectId,
    episodeId: setup.episodeId,
    backendWorkbenchAssets: {
      role: (backendWorkbench.assetsByType?.role ?? []).map((item) => item.assetId),
      character: (backendWorkbench.assetsByType?.character ?? []).map((item) => item.assetId),
      scene: (backendWorkbench.assetsByType?.scene ?? []).map((item) => item.assetId),
      prop: (backendWorkbench.assetsByType?.prop ?? []).map((item) => item.assetId),
    },
    metrics: {
      before,
      backendVsUiBefore,
      afterProp,
      backendVsUiAfterProp,
      afterScene,
      backendVsUiAfterScene,
      afterCharacter,
      backendVsUiAfterCharacter,
    },
    consoleErrors: page.console.filter((item) => item.type === "error"),
  };
  validateReport(report);
  await writeFile(resolve(artifactDir, "browser-qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  browser.close();
} finally {
  chrome.stderr.destroy();
  chrome.kill();
  if (chrome.exitCode === null) {
    await new Promise((resolveExit) => {
      const timeout = setTimeout(resolveExit, 2_000);
      chrome.once("exit", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
  }
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) {
    await writeFile(resolve(artifactDir, "chrome-stderr.log"), stderr, "utf8");
  }
  if (managedServer) {
    managedServer.child.kill();
    if (managedServer.child.exitCode === null) {
      await new Promise((resolveExit) => {
        const timeout = setTimeout(resolveExit, 2_000);
        managedServer.child.once("exit", () => {
          clearTimeout(timeout);
          resolveExit();
        });
      });
    }
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
    idempotencyKey: `qa-asset-scroll-project-${Date.now()}`,
    body: {
      name: "资产滚动验证",
      scriptInput: "第 1 集：验证角色、场景、道具连续列表滚动。",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
  });
  await jsonFetch("/api/creator/project/select", {
    method: "POST",
    cookie,
    body: { projectId: project.project.id },
  });
  const episodeEnvelope = await jsonFetch(`/api/projects/${project.project.id}/episodes`, {
    method: "POST",
    cookie,
    idempotencyKey: `qa-asset-scroll-episode-${Date.now()}`,
    body: { title: "第一集" },
  });
  const episode = episodeEnvelope.episode ?? episodeEnvelope.data?.episode ?? null;
  const episodeId = episode?.id ?? episode?.episodeId ?? null;
  if (!episodeId) {
    throw new Error(`episode_create_missing_id:${JSON.stringify(episodeEnvelope)}`);
  }
  const assets = [
    ["role", "年纪更大的女人", "面容消瘦、皱纹明显，旧披肩裹身，目光沉静但戒备。"],
    ["role", "蓬头垢面的女人", "头发凌乱，神情疲惫但强硬，裹着褪色布料。"],
    ["role", "废土主角", "瘦削、警惕、穿破旧夹克，肩背磨损背包。"],
    ["scene", "灰雾街区", "灰雾低垂、路牌残缺、地面积水反光。"],
    ["scene", "山谷难民营地", "临时帐篷与铁皮围挡构成营地入口。"],
    ["scene", "残破街区", "断墙残楼、空气混浊，地面遍布碎石。"],
    ["prop", "破旧牛车", "木轮磨损严重，铁件生锈，车辕上缠着褪色麻绳。"],
    ["prop", "旧式通讯器", "金属外壳有划痕，屏幕裂纹明显。"],
  ];
  const assetIds = {
    character: [],
    scene: [],
    prop: [],
  };
  for (const [assetType, name, description] of assets) {
    const created = await jsonFetch(`/api/episodes/${episodeId}/assets`, {
      method: "POST",
      cookie,
      body: { assetType, name, description },
    });
    const assetId = created.asset?.assetId ?? null;
    if (assetType === "role" && assetId) {
      assetIds.character.push(assetId);
    } else if (assetType === "scene" && assetId) {
      assetIds.scene.push(assetId);
    } else if (assetType === "prop" && assetId) {
      assetIds.prop.push(assetId);
    }
  }
  return {
    cookie,
    projectId: project.project.id,
    episodeId,
    assetIds,
  };
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
  let serverStderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    serverStderr += String(chunk);
  });
  const nextOrigin = `http://127.0.0.1:${port}`;
  await waitForHttpReady(nextOrigin, child, () => stdout, () => serverStderr);
  return { origin: nextOrigin, child };
}

async function waitForHttpReady(originUrl, child, getStdout, getStderr) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`managed_backend_exited:${child.exitCode}\n${getStdout()}\n${getStderr()}`.trim());
    }
    try {
      const response = await fetch(`${originUrl}/`);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(400);
  }
  throw new Error(`managed_backend_timeout:${originUrl}\n${getStdout()}\n${getStderr()}`.trim());
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

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`json_fetch_failed:${response.status}:${path}:${text}`);
  }
  return payload.data ?? payload;
}

async function waitForCdp() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(200);
  }
  throw new Error("cdp_timeout");
}

async function connectCdp() {
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    browser.once?.("open", resolveOpen);
    browser.addEventListener?.("open", resolveOpen, { once: true });
    browser.once?.("error", reject);
    browser.addEventListener?.("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const sessions = new Map();
  const listeners = new Map();
  const onMessage = (event) => {
    const data = typeof event.data === "string" ? event.data : event.data.toString();
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolveMessage, rejectMessage } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        rejectMessage(new Error(JSON.stringify(message.error)));
      } else {
        resolveMessage(message.result ?? {});
      }
      return;
    }
    const session = sessions.get(message.sessionId);
    if (session) {
      session._emit(message.method, message.params ?? {});
    }
  };
  browser.on?.("message", (data) => onMessage({ data }));
  browser.addEventListener?.("message", onMessage);

  const send = (method, params = {}, sessionId = undefined) => {
    const messageId = ++id;
    const payload = { id: messageId, method, params };
    if (sessionId) payload.sessionId = sessionId;
    browser.send(JSON.stringify(payload));
    return new Promise((resolveMessage, rejectMessage) => {
      pending.set(messageId, { resolveMessage, rejectMessage });
    });
  };
  return {
    async newPage() {
      const target = await send("Target.createTarget", { url: "about:blank" });
      const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      const page = {
        console: [],
        send(method, params = {}) {
          return send(method, params, attached.sessionId);
        },
        on(method, fn) {
          const list = listeners.get(attached.sessionId) ?? new Map();
          const fns = list.get(method) ?? [];
          fns.push(fn);
          list.set(method, fns);
          listeners.set(attached.sessionId, list);
        },
        _emit(method, params) {
          for (const fn of listeners.get(attached.sessionId)?.get(method) ?? []) {
            fn(params);
          }
        },
      };
      sessions.set(attached.sessionId, page);
      await page.send("Runtime.enable");
      await page.send("Page.enable");
      page.on("Runtime.consoleAPICalled", (params) => {
        page.console.push({ type: params.type, text: params.args?.map((arg) => arg.value ?? arg.description).join(" ") ?? "" });
      });
      page.on("Runtime.exceptionThrown", (params) => {
        page.console.push({ type: "error", text: params.exceptionDetails?.text ?? "exception" });
      });
      return page;
    },
    close() {
      browser.close();
    },
  };
}

async function newPage(browser) {
  return browser.newPage();
}

async function setCookie(page, cookie) {
  const [name, value] = cookie.split("=");
  await page.send("Network.enable");
  await page.send("Network.setCookie", {
    name,
    value,
    domain: "127.0.0.1",
    path: "/",
  });
}

async function setViewport(page, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function navigate(page, url) {
  await page.send("Page.navigate", { url });
  await waitForSelector(page, "body", 15_000);
}

async function waitForSelector(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exists = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (exists) {
      return;
    }
    await delay(200);
  }
  throw new Error(`selector_timeout:${selector}`);
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
  const metrics = await evaluate(page, assetScrollMetricsScript());
  throw new Error(`condition_timeout:${expression}:${JSON.stringify(metrics)}`);
}

async function waitForSectionNearTop(page, kind) {
  await waitForCondition(
    page,
    `(() => {
      const left = document.querySelector('.episode-replica-left');
      const section = document.querySelector('[data-asset-section="${kind}"]');
      if (!left || !section) return false;
      const gap = Math.abs(section.getBoundingClientRect().top - left.getBoundingClientRect().top);
      return document.querySelector('[data-action="set-project-asset-tab"][data-asset-tab="${kind}"]')?.classList.contains('active') &&
        left.scrollTop > 20 &&
        gap < 90;
    })()`,
    10_000,
  );
}

async function click(page, selector) {
  const result = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
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

function assetScrollMetricsScript() {
  return `(() => {
    const left = document.querySelector('.episode-replica-left');
    const sections = Object.fromEntries(['character', 'scene', 'prop'].map((kind) => {
      const section = document.querySelector(\`[data-asset-section="\${kind}"]\`);
      if (!left || !section) return [kind, null];
      const leftRect = left.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      return [kind, {
        display: getComputedStyle(section).display,
        topGap: Math.round(sectionRect.top - leftRect.top),
        height: Math.round(sectionRect.height),
        cardCount: section.querySelectorAll('.episode-replica-asset-card').length,
      }];
    }));
    const assetSections = document.querySelector('.episode-replica-asset-sections');
    return {
      activeTab: document.querySelector('[data-action="set-project-asset-tab"].active')?.dataset.assetTab ?? null,
      tabBarHeight: Math.round(document.querySelector('.episode-replica-asset-tabs')?.getBoundingClientRect().height ?? 0),
      toolbarHeadGap: (() => {
        const left = document.querySelector('.episode-replica-left');
        const head = document.querySelector('.episode-replica-asset-toolbar-head');
        if (!left || !head) return null;
        return Math.round(head.getBoundingClientRect().top - left.getBoundingClientRect().top);
      })(),
      toolbarHeadPosition: (() => {
        const head = document.querySelector('.episode-replica-asset-toolbar-head');
        return head ? getComputedStyle(head).position : null;
      })(),
      tabHeights: Object.fromEntries([...document.querySelectorAll('[data-action="set-project-asset-tab"]')]
        .map((button) => [button.dataset.assetTab ?? '', Math.round(button.getBoundingClientRect().height)])),
      sectionCount: document.querySelectorAll('.episode-replica-asset-section').length,
      cardCount: document.querySelectorAll('.episode-replica-asset-card').length,
      canScroll: Boolean(left && left.scrollHeight > left.clientHeight),
      scrollTop: Math.round(left?.scrollTop ?? 0),
      scrollHeight: Math.round(left?.scrollHeight ?? 0),
      clientHeight: Math.round(left?.clientHeight ?? 0),
      leftScrollbarWidth: left ? getComputedStyle(left).scrollbarWidth : null,
      sectionsOverflowY: assetSections ? getComputedStyle(assetSections).overflowY : null,
      sections,
    };
  })()`;
}

function compareEpisodeAssetCardsScript(expectedByKind) {
  return `(() => {
    const expected = ${JSON.stringify(expectedByKind)};
    const actual = Object.fromEntries(
      ['character', 'scene', 'prop'].map((kind) => {
        const section = document.querySelector('[data-asset-section="' + kind + '"]');
        const ids = section
          ? [...section.querySelectorAll('.episode-replica-asset-card[data-asset-card-id]')]
              .map((node) => node.getAttribute('data-asset-card-id'))
              .filter(Boolean)
          : [];
        return [kind, ids];
      }),
    );
    const missing = Object.fromEntries(
      ['character', 'scene', 'prop'].map((kind) => [
        kind,
        (expected[kind] ?? []).filter((assetId) => !actual[kind].includes(assetId)),
      ]),
    );
    return { expected, actual, missing };
  })()`;
}

function validateReport(report) {
  const failures = [];
  const {
    before,
    backendVsUiBefore,
    afterProp,
    backendVsUiAfterProp,
    afterScene,
    backendVsUiAfterScene,
    afterCharacter,
    backendVsUiAfterCharacter,
  } = report.metrics ?? {};
  if ((report.consoleErrors ?? []).length > 0) {
    failures.push(`console errors detected: ${report.consoleErrors.length}`);
  }
  if (!before?.canScroll || before.sectionCount !== 3 || before.cardCount < 8) {
    failures.push("asset list is not a single scrollable list with all three sections");
  }
  for (const kind of ["character", "scene", "prop"]) {
    if (before?.sections?.[kind]?.display === "none") {
      failures.push(`${kind} section is hidden`);
    }
  }
  if (before?.leftScrollbarWidth !== "none") {
    failures.push(`left scrollbar is not hidden: ${before?.leftScrollbarWidth}`);
  }
  for (const metrics of [before, afterProp, afterScene, afterCharacter]) {
    if (metrics?.toolbarHeadPosition !== "sticky") {
      failures.push(`asset tabs are not sticky after selecting ${metrics?.activeTab}: ${metrics?.toolbarHeadPosition}`);
    }
    if (Math.abs(metrics?.toolbarHeadGap ?? 999) > 4) {
      failures.push(`asset tabs moved away from the left pane top after selecting ${metrics?.activeTab}: ${metrics?.toolbarHeadGap}`);
    }
    if (metrics?.tabBarHeight !== before?.tabBarHeight) {
      failures.push(`asset tab bar height changed after selecting ${metrics?.activeTab}`);
    }
    for (const kind of ["character", "scene", "prop"]) {
      if (metrics?.tabHeights?.[kind] !== before?.tabHeights?.[kind]) {
        failures.push(`${kind} tab height changed after selecting ${metrics?.activeTab}`);
      }
    }
  }
  if (before?.sectionsOverflowY !== "visible") {
    failures.push(`asset sections should not be a nested scroll container: ${before?.sectionsOverflowY}`);
  }
  if (afterProp?.activeTab !== "prop" || (afterProp?.sections?.prop?.topGap ?? 999) > 90 || (afterProp?.scrollTop ?? 0) <= 20) {
    failures.push("prop tab did not scroll the shared list to prop section");
  }
  if (afterScene?.activeTab !== "scene" || Math.abs(afterScene?.sections?.scene?.topGap ?? 999) > 90 || (afterScene?.scrollTop ?? 0) <= 20) {
    failures.push("scene tab did not scroll the shared list to scene section");
  }
  if (afterCharacter?.activeTab !== "character" || (afterCharacter?.scrollTop ?? 999) >= 20) {
    failures.push("character tab did not scroll the shared list back to the top");
  }
  for (const comparison of [
    backendVsUiBefore,
    backendVsUiAfterProp,
    backendVsUiAfterScene,
    backendVsUiAfterCharacter,
  ]) {
    for (const kind of ["character", "scene", "prop"]) {
      if ((comparison?.missing?.[kind]?.length ?? 0) > 0) {
        failures.push(`${kind} section missing backend episode assets: ${comparison.missing[kind].join(",")}`);
      }
    }
  }
  if (failures.length) {
    throw new Error(`asset_scroll_qa_failed:${failures.join("; ")}`);
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
