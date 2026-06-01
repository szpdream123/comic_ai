import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { renderProductionWorkbench } from "../apps/web/src/features/production-workbench/index.js";
import { renderLibraryTeam } from "../apps/web/src/features/library-team/index.js";

const artifactDir = resolve(process.cwd(), "artifacts", "library-team-qa");
const userDataDir = resolve(
  process.cwd(),
  ".local",
  `library-team-qa-chrome-${Date.now()}-${randomUUID()}`,
);
const debugPort = Number(process.env.QA_CDP_PORT ?? 9224);
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";

await mkdir(artifactDir, { recursive: true });
await mkdir(userDataDir, { recursive: true });

const css = await readFile(
  resolve(process.cwd(), "apps", "web", "src", "features", "production-workbench", "production-workbench.css"),
  "utf8",
);
const libraryCss = await readFile(
  resolve(process.cwd(), "apps", "web", "src", "features", "library-team", "library-team.css"),
  "utf8",
);

const fixtures = buildFixtures();
const baseWorkbenchUi = {
  busy: false,
  toast: "ready",
  creditBalance: fixtures.creditBalance,
};
const pages = [
  {
    id: "script-page-desktop",
    html: buildHtml(
      "Script Page",
      renderProductionWorkbench({
        state: {
          projectDetail: fixtures.projectDetail,
          project: fixtures.project,
          script: fixtures.projectDetail.script,
        },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "script",
          isOriginalScriptModalOpen: false,
          isScriptModalOpen: false,
        },
      }),
    ),
    viewport: { width: 1440, height: 900 },
    selectors: [".script-management-page", ".script-record-card"],
  },
  {
    id: "script-page-mobile",
    html: buildHtml(
      "Script Page Mobile",
      renderProductionWorkbench({
        state: {
          projectDetail: fixtures.projectDetail,
          project: fixtures.project,
          script: fixtures.projectDetail.script,
        },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "script",
          isOriginalScriptModalOpen: false,
          isScriptModalOpen: false,
        },
      }),
    ),
    viewport: { width: 390, height: 844 },
    selectors: [".script-management-page", ".script-record-card"],
  },
  {
    id: "project-library-desktop",
    html: buildHtml(
      "Project Library",
      renderProductionWorkbench({
        state: { projectDetail: fixtures.projectDetail, project: fixtures.project },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "library",
          projectMembers: fixtures.members,
          projectStats: fixtures.stats,
          importedAssets: fixtures.assetsByType,
          libraryTeamAssetScope: "personal",
        },
      }),
    ),
    viewport: { width: 1440, height: 900 },
    selectors: [".library-team-page", ".library-team-asset-card"],
  },
  {
    id: "project-library-mobile",
    html: buildHtml(
      "Project Library Mobile",
      renderProductionWorkbench({
        state: { projectDetail: fixtures.projectDetail, project: fixtures.project },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "library",
          projectMembers: fixtures.members,
          projectStats: fixtures.stats,
          importedAssets: fixtures.assetsByType,
          libraryTeamAssetScope: "personal",
        },
      }),
    ),
    viewport: { width: 390, height: 844 },
    selectors: [".library-team-page", ".library-team-asset-card"],
  },
  {
    id: "team-desktop",
    html: buildHtml(
      "Team Page",
      renderProductionWorkbench({
        state: { projectDetail: fixtures.projectDetail, project: fixtures.project },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "team",
          projectMembers: fixtures.members,
          projectStats: fixtures.stats,
          billingPackages: fixtures.billingPackages,
          isLibraryPricingModalOpen: true,
          lastPaymentIntent: fixtures.paymentIntent,
          lastPaymentAction: fixtures.paymentAction,
          libraryTeamRoute: "team",
        },
      }),
    ),
    viewport: { width: 1440, height: 900 },
    selectors: [".library-team-page", ".team-member-section", "table"],
  },
  {
    id: "team-dashboard-desktop",
    html: buildHtml(
      "Team Dashboard",
      renderProductionWorkbench({
        state: { projectDetail: fixtures.projectDetail, project: fixtures.project },
        session: fixtures.session,
        ui: {
          ...baseWorkbenchUi,
          activeNavTab: "team",
          projectMembers: fixtures.members,
          projectStats: fixtures.stats,
          libraryTeamRoute: "team-dashboard",
        },
      }),
    ),
    viewport: { width: 1440, height: 900 },
    selectors: [".team-dashboard-page", "table"],
  },
  {
    id: "asset-library-direct-desktop",
    html: buildHtml(
      "Asset Library",
      renderLibraryTeam({
        route: "assets",
        assetScope: "official",
        assetsByType: fixtures.assetsByType,
        libraryCategory: "角色",
        libraryFolder: "国内仿真人·现代都市",
        selectedLibraryAssetId: "doctor",
        selectedLibraryImportIds: ["doctor"],
      }),
    ),
    viewport: { width: 1440, height: 900 },
    selectors: [".official-library-page", ".library-team-asset-card"],
  },
];

const htmlDir = join(artifactDir, "html");
await mkdir(htmlDir, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
);

let stderr = "";
chrome.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

try {
  await waitForCdp(debugPort);
  const browser = await connectCdp(debugPort);
  const reportRoutes = [];

  for (const pageSpec of pages) {
    const pageFile = join(htmlDir, `${pageSpec.id}.html`);
    await writeFile(pageFile, pageSpec.html, "utf8");
    const page = await newPage(browser);
    await page.send("Network.enable");
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await setViewport(page, pageSpec.viewport.width, pageSpec.viewport.height);
    await navigate(page, `file:///${pageFile.replace(/\\/g, "/")}`);
    for (const selector of pageSpec.selectors) {
      await waitForSelector(page, selector, 10_000);
    }
    const screenshotPath = join(artifactDir, `${pageSpec.id}.png`);
    await screenshot(page, screenshotPath);
    const metrics = await evaluate(page, metricsScript());
    validateRoute(pageSpec.id, metrics);
    reportRoutes.push({
      id: pageSpec.id,
      screenshot: `artifacts/library-team-qa/${pageSpec.id}.png`,
      metrics,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    routes: reportRoutes,
  };
  await writeFile(
    join(artifactDir, "library-team-browser-qa-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  chrome.stderr.destroy();
  chrome.kill();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) {
    await writeFile(join(artifactDir, "chrome-stderr.log"), stderr, "utf8");
  }
}

function buildFixtures() {
  return {
    session: { user: { phone: "13800138000" } },
    project: {
      id: "project-1",
      name: "剧集工作台联调",
      statusLabel: "制作中",
      type: "短剧",
      aspectRatio: "16:9",
      resolution: "1080p",
    },
    projectDetail: {
      project: {
        id: "project-1",
        name: "剧集工作台联调",
        statusLabel: "制作中",
        type: "短剧",
        aspectRatio: "16:9",
        resolution: "1080p",
        createdAt: "2026/05/29",
        updatedAt: "2026-05-29T10:15:00.000Z",
      },
      script: {
        id: "script-1",
        projectId: "project-1",
        status: "ready",
        inputText:
          "第1集：主角在废土街区醒来，发现时间停止，只剩风声和霓虹故障闪烁。第2集：他带着旧式通讯器进入山谷营地，准备继续追查。",
        createdAt: "2026-05-29T09:50:00.000Z",
        updatedAt: "2026-05-29T10:15:00.000Z",
      },
      episodes: [
        {
          id: "episode-1",
          title: "第一集",
          sequence: 1,
          status: "ready",
          createdAt: "2026/05/29",
          storyboardCount: 4,
        },
      ],
      shots: [],
      assetsByType: {
        character: [
          { id: "asset-1", name: "废土主角", label: "废土主角", assetKey: "hero", previewUrl: "/uploads/hero.png" },
          { id: "asset-2", name: "蓬头垢面的女人", label: "蓬头垢面的女人", assetKey: "ally", previewUrl: "/uploads/ally.png" },
        ],
        scene: [
          { id: "asset-3", name: "残破街区", label: "残破街区", assetKey: "street", previewUrl: "/uploads/street.png" },
        ],
        prop: [
          { id: "asset-4", name: "旧式通讯器", label: "旧式通讯器", assetKey: "radio", previewUrl: "/uploads/radio.png" },
        ],
        other: { image: [], video: [] },
      },
    },
    assetsByType: {
      character: [
        { id: "asset-1", name: "废土主角", label: "废土主角", assetKey: "hero", previewUrl: "/uploads/hero.png" },
        { id: "asset-2", name: "蓬头垢面的女人", label: "蓬头垢面的女人", assetKey: "ally", previewUrl: "/uploads/ally.png" },
      ],
      scene: [
        { id: "asset-3", name: "残破街区", label: "残破街区", assetKey: "street", previewUrl: "/uploads/street.png" },
      ],
      prop: [
        { id: "asset-4", name: "旧式通讯器", label: "旧式通讯器", assetKey: "radio", previewUrl: "/uploads/radio.png" },
      ],
      other: { image: [], video: [] },
    },
    members: [
      {
        phone: "13800138000",
        userId: "user-1",
        role: "管理员",
        status: "enabled",
        consumedCredits: 512,
        scriptCount: 8,
        projectCount: 3,
        projectAverageCredits: 171,
      },
    ],
    stats: {
      episodeCount: 1,
      memberCount: 1,
      generatedVideoCount: 4,
      generatedImageCount: 1280,
      assetCount: 720,
      exportCount: 300,
    },
    billingPackages: [
      {
        id: "pkg-1",
        code: "starter_120",
        displayName: "新手包",
        credits: 120,
        amountMinor: 9900,
        currency: "CNY",
        status: "active",
      },
      {
        id: "pkg-2",
        code: "studio_600",
        displayName: "团队包",
        credits: 600,
        amountMinor: 39900,
        currency: "CNY",
        status: "active",
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      productMode: "native_qr",
      status: "submitted",
      amountMinor: 9900,
      currency: "CNY",
      merchantOrderNo: "MOCK20260529001",
      expiresAt: "2026-05-29T18:30:00.000Z",
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MOCK20260529001",
      amountMinor: 9900,
      currency: "CNY",
    },
    creditBalance: 720,
  };
}

function buildHtml(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${css}\n${libraryCss}</style>
  </head>
  <body class="workbench-body">
    <main id="creator-app" class="creator-app">
      ${body}
    </main>
  </body>
</html>`;
}

async function waitForCdp(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(120);
  }
  throw new Error("cdp_not_ready");
}

async function connectCdp(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return connectSocket(version.webSocketDebuggerUrl);
}

function connectSocket(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message ?? "cdp_error"));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    for (const listener of listeners) {
      listener(message);
    }
  };
  socket.onclose = () => {
    for (const { reject } of pending.values()) {
      reject(new Error("cdp_closed"));
    }
    pending.clear();
  };
  return {
    onEvent(listener) {
      listeners.add(listener);
    },
    async send(method, params = {}, sessionId = undefined) {
      await waitForSocketOpen(socket);
      const nextId = ++id;
      const payload = { id: nextId, method, params };
      if (sessionId) {
        payload.sessionId = sessionId;
      }
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => pending.set(nextId, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

async function waitForSocketOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("socket_open_timeout")), 5000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function newPage(browser) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = {
    browser,
    sessionId,
    console: [],
    async send(method, params = {}) {
      return browser.send(method, params, sessionId);
    },
  };
  browser.onEvent((event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    if (event.method === "Runtime.consoleAPICalled") {
      page.console.push({
        type: event.params.type,
        text: (event.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
      });
    }
  });
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
    await delay(120);
  }
  throw new Error(`selector_timeout:${selector}`);
}

async function evaluate(page, expr) {
  const result = await page.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

async function screenshot(page, outputPath) {
  const result = await page.send("Page.captureScreenshot", { format: "png" });
  const bytes = Buffer.from(result.data, "base64");
  await writeFile(outputPath, bytes);
}

function metricsScript() {
  return `(() => ({
    hasScriptPage: Boolean(document.querySelector('.script-management-page')),
    hasScriptRecord: document.querySelectorAll('.script-record-card').length,
    hasLibraryShell: Boolean(document.querySelector('.library-team-page')),
    hasAssetCards: document.querySelectorAll('.library-team-asset-card').length,
    hasMemberTable: Boolean(document.querySelector('.team-member-section table')),
    hasDashboardTable: Boolean(document.querySelector('.team-dashboard-page table')),
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    hasPricingButton: Boolean(document.querySelector('[data-action="open-pricing"]')),
    hasRulesButton: Boolean(document.querySelector('[data-action="open-member-rules"]')),
    statusbarCreditText: document.querySelector('.statusbar-credit')?.innerText?.replace(/\\s+/g, ' ').trim() ?? '',
    textSample: document.body.innerText.slice(0, 500),
  }))()`;
}

function validateRoute(routeId, metrics) {
  if (routeId.startsWith("script-page")) {
    if (!metrics.hasScriptPage || metrics.hasScriptRecord < 1) {
      throw new Error(`script_page_incomplete:${routeId}`);
    }
  }

  if (routeId.includes("library")) {
    if (!metrics.hasLibraryShell && routeId !== "asset-library-direct-desktop") {
      throw new Error(`library_shell_missing:${routeId}`);
    }
    if (routeId !== "team-desktop" && routeId !== "team-dashboard-desktop" && metrics.hasAssetCards < 1) {
      throw new Error(`library_assets_missing:${routeId}`);
    }
  }

  if (routeId === "team-desktop" && !metrics.hasMemberTable) {
    throw new Error("team_table_missing");
  }

  if (routeId === "team-dashboard-desktop" && !metrics.hasDashboardTable) {
    throw new Error("team_dashboard_table_missing");
  }

  if (routeId !== "asset-library-direct-desktop" && !/720/.test(metrics.statusbarCreditText ?? "")) {
    throw new Error(`statusbar_credit_missing:${routeId}`);
  }

  if (metrics.scrollWidth > metrics.viewportWidth + 8) {
    throw new Error(`horizontal_overflow:${routeId}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
