import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const managedServer =
  process.env.QA_ORIGIN ? null : await startManagedBackendServer(Number(process.env.QA_PORT ?? 4313));
const origin = process.env.QA_ORIGIN ?? managedServer.origin;
const chromePath =
  process.env.CHROME_PATH ??
  "C:\\Users\\yzk\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1223\\chrome-headless-shell-win64\\chrome-headless-shell.exe";
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
  const deepLink = `${origin}/projects/${encodeURIComponent(setup.projectId)}/episodes/${encodeURIComponent(setup.episodeId)}`;
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
  const initialWorkbenchMetrics = await evaluate(desktop, qaMetricsScript());
  const routeAfterClick = await evaluate(desktop, "location.href");

  const storyboardAutosaveValue = `QA 分镜失焦保存 ${Date.now()}`;
  await evaluate(
    desktop,
    `(() => {
      const textarea = document.querySelector('.episode-replica-shot-card.active .episode-replica-shot-desc-input')
        ?? document.querySelector('.episode-replica-shot-desc-input');
      if (!textarea) return false;
      textarea.focus();
      textarea.value = ${JSON.stringify(storyboardAutosaveValue)};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.querySelector('#video-prompt-input') }));
      return true;
    })()`,
  );
  await delay(1_200);
  await navigate(desktop, deepLink);
  await waitForSelector(desktop, ".episode-replica-layout", 15_000);
  await waitForSelector(desktop, ".episode-replica-layout.storyboard-mode", 15_000);
  await waitForCondition(
    desktop,
    `(() => {
      const textarea = document.querySelector('.episode-replica-shot-card.active .episode-replica-shot-desc-input')
        ?? document.querySelector('.episode-replica-shot-desc-input');
      return Boolean(textarea && textarea.value.includes(${JSON.stringify(storyboardAutosaveValue)}));
    })()`,
    10_000,
  );
  const storyboardAutosaveMetrics = await evaluate(desktop, qaMetricsScript());

  await focusElement(desktop, "#video-prompt-input");
  await pageInsertText(desktop, "请参考 @");
  await waitForCondition(
    desktop,
    "Boolean(window.__episodeWorkbenchTestApi && window.__episodeWorkbenchTestApi.getPromptMentionState().suggestionCount > 0)",
    10_000,
  );
  const mentionMenuMetrics = await evaluate(desktop, qaMetricsScript());
  await evaluate(desktop, "window.__episodeWorkbenchTestApi.selectFirstPromptMention()");
  await waitForCondition(
    desktop,
    "Boolean(window.__episodeWorkbenchTestApi && window.__episodeWorkbenchTestApi.getPromptMentionState().mentionReferenceCount > 0 && window.__episodeWorkbenchTestApi.getPromptMentionState().prompt.includes('【@'))",
    10_000,
  );
  const mentionInsertMetrics = await evaluate(desktop, qaMetricsScript());

  await click(
    desktop,
    '.episode-replica-right .episode-replica-quick-asset[title="废土主角"]',
  );
  await click(desktop, '[data-action="quick-append-selected-asset"]');
  await waitForCondition(
    desktop,
    "(document.querySelector('#video-prompt-input')?.value?.length ?? 0) > 20 && document.querySelector('.episode-replica-ref-card.quick-reference') !== null",
    10_000,
  );

  await click(desktop, '[data-action="generate-images"]');
  await waitForSelector(desktop, '[data-result-action="set-storyboard-image"]', 15_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-image-result-desktop.png"));
  const imageResultMetrics = await evaluate(desktop, qaMetricsScript());

  await click(desktop, '[data-action="open-episode-batch-actions"]');
  await waitForSelector(desktop, ".episode-batch-modal", 10_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-batch-modal-desktop.png"));
  const batchModalMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="submit-episode-batch-modal"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-batch-modal') === null",
    10_000,
  );

  await click(desktop, '[data-action="set-episode-media-mode"][data-mode="video"]');
  await waitForCondition(
    desktop,
    "document.querySelector('[data-action=\"generate-videos\"]') !== null",
    10_000,
  );
  await click(desktop, '[data-action="generate-videos"]');
  await waitForSelector(desktop, '[data-result-action="set-storyboard-video"]', 15_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-video-result-desktop.png"));

  await click(desktop, '[data-action="preview-export"]');
  await waitForSelector(desktop, ".episode-export-modal", 15_000);
  await click(desktop, '[data-action="start-episode-export"][data-export-kind="mp4"]');
  const exportRunningMetrics = await evaluate(desktop, qaMetricsScript());
  await screenshot(desktop, join(artifactDir, "episode-workbench-export-running-desktop.png"));
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-export-preview') !== null || document.body.innerText.includes('export_manifest_blocked') || document.body.innerText.includes('还有分镜未完成')",
    15_000,
  );
  await screenshot(desktop, join(artifactDir, "episode-workbench-export-preview-desktop.png"));
  const exportPreviewMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="close-episode-export-modal"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-export-modal') === null",
    10_000,
  );

  await click(desktop, '[data-action="set-muse-scope-mode"][data-mode="assets"]');
  await waitForSelector(desktop, ".episode-replica-layout.assets-mode", 10_000);
  await waitForCondition(
    desktop,
    "document.querySelectorAll('.episode-replica-asset-section').length === 3 && document.querySelectorAll('.episode-replica-asset-card').length >= 3",
    10_000,
  );
  await screenshot(desktop, join(artifactDir, "episode-workbench-assets-desktop.png"));
  const assetModeMetrics = await evaluate(desktop, qaMetricsScript());
  const assetAutosaveValue = `QA 资产失焦保存 ${Date.now()}`;
  const editedAsset = await evaluate(
    desktop,
    `(() => {
      const textarea = document.querySelector('.episode-replica-asset-card.active .episode-replica-asset-desc-input')
        ?? document.querySelector('.episode-replica-asset-desc-input');
      if (!textarea) return false;
      const assetId = textarea.dataset.assetId ?? '';
      const assetKind = textarea.dataset.assetKind ?? '';
      textarea.focus();
      textarea.value = ${JSON.stringify(assetAutosaveValue)};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return { assetId, assetKind };
    })()`,
  );
  if (!editedAsset?.assetId) {
    throw new Error("asset_autosave_target_missing");
  }
  await focusElement(desktop, ".episode-replica-right-search input");
  await delay(1_200);
  await navigate(desktop, deepLink);
  await waitForSelector(desktop, ".episode-replica-layout", 15_000);
  await click(desktop, '[data-action="set-muse-scope-mode"][data-mode="assets"]');
  await waitForSelector(desktop, ".episode-replica-layout.assets-mode", 10_000);
  await waitForCondition(
    desktop,
    `(() => {
      const assetId = ${JSON.stringify(editedAsset.assetId)};
      const textarea = [...document.querySelectorAll('.episode-replica-asset-desc-input')]
        .find((node) => node.dataset.assetId === assetId);
      return Boolean(textarea && textarea.value.includes(${JSON.stringify(assetAutosaveValue)}));
    })()`,
    10_000,
  );
  await evaluate(
    desktop,
    `(() => {
      const assetId = ${JSON.stringify(editedAsset.assetId)};
      const button = [...document.querySelectorAll('[data-action="set-episode-asset"]')]
        .find((node) => node.dataset.assetId === assetId);
      button?.click();
      return Boolean(button);
    })()`,
  );
  const assetAutosaveMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="open-asset-import-modal"]');
  await waitForSelector(desktop, ".episode-asset-library-modal", 10_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-asset-library-modal-desktop.png"));
  const assetLibraryModalMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="close-asset-import-modal"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-asset-library-modal') === null",
    10_000,
  );
  await click(desktop, '.episode-replica-asset-card.active .voice');
  await waitForSelector(desktop, '.episode-voice-picker-modal', 10_000);
  await click(desktop, '[data-action="set-episode-voice-tab"][data-tab="system"]');
  await waitForSelector(desktop, '.episode-voice-card', 10_000);
  await click(desktop, '.episode-voice-card[data-voice-name="女/稚嫩"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-voice-picker-modal') === null && document.querySelector('.episode-replica-asset-card.active .voice.configured') !== null && document.querySelector('.episode-replica-asset-card.active .voice')?.innerText?.includes('编辑')",
    10_000,
  );
  await screenshot(desktop, join(artifactDir, "episode-workbench-asset-voice-configured-desktop.png"));
  await click(desktop, '.episode-replica-asset-card.active .voice.configured');
  await waitForSelector(desktop, '.episode-voice-picker-modal', 10_000);
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-voice-card.active[data-voice-name=\"女/稚嫩\"]') !== null",
    10_000,
  );
  await screenshot(desktop, join(artifactDir, "episode-workbench-asset-voice-reopen-desktop.png"));
  const assetVoiceMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="close-episode-voice-modal"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-voice-picker-modal') === null",
    10_000,
  );
  const assetScrollMetrics = await verifyAssetSectionTabScroll(desktop);
  await click(desktop, '[data-action="set-muse-scope-mode"][data-mode="storyboard"]');
  await waitForSelector(desktop, ".episode-replica-layout.storyboard-mode", 10_000);

  await click(desktop, '[data-action="set-episode-media-mode"][data-mode="lip-sync"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-replica-prompt.lip-sync-mode') !== null",
    10_000,
  );
  const lipSyncText = "这是用于对口型 QA 的试听文案，用来验证配音员回填、计费和音频内容列表是否正常。";
  await evaluate(
    desktop,
    `(() => {
      const textarea = document.querySelector('#video-prompt-input');
      if (!textarea) return false;
      textarea.value = ${JSON.stringify(lipSyncText)};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    })()`,
  );
  await click(desktop, '[data-action="open-episode-voice-modal"][data-voice-scope="lip-sync"]');
  await waitForSelector(desktop, '.episode-voice-picker-modal', 10_000);
  await click(desktop, '[data-action="set-episode-voice-tab"][data-tab="system"]');
  await waitForSelector(desktop, '.episode-voice-card', 10_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-voice-modal-desktop.png"));
  const voiceModalMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="preview-episode-voice"][data-voice-name="女/稚嫩"]');
  await waitForCondition(
    desktop,
    "document.body.innerText.includes('停止试听')",
    10_000,
  );
  await click(desktop, '[data-action="select-episode-voice"][data-voice-name="女/稚嫩"]');
  await waitForCondition(
    desktop,
    "document.querySelector('.episode-voice-picker-modal') === null && document.body.innerText.includes('女/稚嫩')",
    10_000,
  );
  await click(desktop, '[data-action="generate-videos"]');
  await waitForSelector(desktop, '[data-action="preview-lip-sync-audio"]', 15_000);
  await screenshot(desktop, join(artifactDir, "episode-workbench-lip-sync-desktop.png"));
  const lipSyncMetrics = await evaluate(desktop, qaMetricsScript());

  const exportReadyDeepLink = `${origin}/projects/${encodeURIComponent(setup.projectId)}/episodes/${encodeURIComponent(setup.exportReadyEpisodeId)}`;
  await navigate(desktop, exportReadyDeepLink);
  await waitForSelector(desktop, ".episode-replica-layout", 15_000);
  await waitForSelector(desktop, ".episode-replica-layout.storyboard-mode", 15_000);
  await click(desktop, '[data-action="preview-export"]');
  await waitForSelector(desktop, ".episode-export-modal", 10_000);
  await click(desktop, '[data-action="start-episode-export"][data-export-kind="mp4"]');
  const exportReadyRunningMetrics = await evaluate(desktop, qaMetricsScript());
  await waitForCondition(
    desktop,
    "document.body.innerText.includes('导出包已准备好，可以直接下载。') && (document.querySelector('.episode-export-modal-link') !== null || document.querySelector('.episode-export-preview-link') !== null)",
    15_000,
  );
  await waitForCondition(
    desktop,
    "Boolean(window.__lastDownloadTrigger && window.__lastDownloadTrigger.url && window.__lastDownloadTrigger.fileName && window.__lastDownloadTrigger.fileName.endsWith('.mp4'))",
    10_000,
  );
  const mp4DownloadTrigger = await evaluate(
    desktop,
    "window.__lastDownloadTrigger ? { ...window.__lastDownloadTrigger } : null",
  );
  await screenshot(desktop, join(artifactDir, "episode-workbench-export-ready-desktop.png"));
  const exportReadyMetrics = await evaluate(desktop, qaMetricsScript());
  await click(desktop, '[data-action="start-episode-export"][data-export-kind="jianying"]');
  const jianyingRunningMetrics = await evaluate(desktop, qaMetricsScript());
  await waitForCondition(
    desktop,
    "document.body.innerText.includes('导出包已准备好，可以直接下载。') && Boolean(window.__lastDownloadTrigger && window.__lastDownloadTrigger.fileName && window.__lastDownloadTrigger.fileName.endsWith('.zip'))",
    15_000,
  );
  const jianyingDownloadTrigger = await evaluate(
    desktop,
    "window.__lastDownloadTrigger ? { ...window.__lastDownloadTrigger } : null",
  );

  const workbenchMetrics = await evaluate(desktop, qaMetricsScript());

  const mobile = await newPage(browser);
  await setCookie(mobile, setup.cookie);
  await setViewport(mobile, 390, 844);
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
    exportReadyDeepLink,
    routeAfterClick,
    projectId: setup.projectId,
    episodeId: setup.episodeId,
    exportReadyEpisodeId: setup.exportReadyEpisodeId,
    downloads: {
      mp4: mp4DownloadTrigger,
      jianying: jianyingDownloadTrigger,
    },
    screenshots: {
      projectDesktop: "artifacts/episode-workbench-qa/project-episodes-desktop.png",
      workbenchDesktop: "artifacts/episode-workbench-qa/episode-workbench-desktop.png",
      workbenchImageResultDesktop: "artifacts/episode-workbench-qa/episode-workbench-image-result-desktop.png",
      workbenchBatchModalDesktop: "artifacts/episode-workbench-qa/episode-workbench-batch-modal-desktop.png",
      workbenchVideoResultDesktop: "artifacts/episode-workbench-qa/episode-workbench-video-result-desktop.png",
      workbenchExportRunningDesktop: "artifacts/episode-workbench-qa/episode-workbench-export-running-desktop.png",
      workbenchExportPreviewDesktop: "artifacts/episode-workbench-qa/episode-workbench-export-preview-desktop.png",
      workbenchAssetsDesktop: "artifacts/episode-workbench-qa/episode-workbench-assets-desktop.png",
      workbenchAssetLibraryModalDesktop: "artifacts/episode-workbench-qa/episode-workbench-asset-library-modal-desktop.png",
      workbenchAssetVoiceConfiguredDesktop: "artifacts/episode-workbench-qa/episode-workbench-asset-voice-configured-desktop.png",
      workbenchAssetVoiceReopenDesktop: "artifacts/episode-workbench-qa/episode-workbench-asset-voice-reopen-desktop.png",
      workbenchVoiceModalDesktop: "artifacts/episode-workbench-qa/episode-workbench-voice-modal-desktop.png",
      workbenchLipSyncDesktop: "artifacts/episode-workbench-qa/episode-workbench-lip-sync-desktop.png",
      workbenchExportReadyDesktop: "artifacts/episode-workbench-qa/episode-workbench-export-ready-desktop.png",
      workbenchMobile: "artifacts/episode-workbench-qa/episode-workbench-mobile.png",
    },
    metrics: {
      timings: {
        projectLoadMs,
        workbenchLoadMs,
        mobileLoadMs,
      },
      project: projectMetrics,
      workbenchInitial: initialWorkbenchMetrics,
      workbenchStoryboardAutosave: storyboardAutosaveMetrics,
      workbenchMentionMenu: mentionMenuMetrics,
      workbenchMentionInsert: mentionInsertMetrics,
      workbenchImageResult: imageResultMetrics,
      workbenchBatchModal: batchModalMetrics,
      workbenchExportRunning: exportRunningMetrics,
      workbenchExportPreview: exportPreviewMetrics,
      workbenchAssetMode: assetModeMetrics,
      workbenchAssetScroll: assetScrollMetrics,
      workbenchAssetAutosave: assetAutosaveMetrics,
      workbenchAssetLibraryModal: assetLibraryModalMetrics,
      workbenchAssetVoice: assetVoiceMetrics,
      workbenchVoiceModal: voiceModalMetrics,
      workbenchLipSync: lipSyncMetrics,
      workbenchExportReadyRunning: exportReadyRunningMetrics,
      workbenchExportReady: exportReadyMetrics,
      workbenchJianyingRunning: jianyingRunningMetrics,
      workbench: workbenchMetrics,
      mobile: mobileMetrics,
    },
    consoleErrors: [
      ...desktop.console.filter((item) => item.type === "error"),
      ...mobile.console.filter((item) => item.type === "error"),
    ],
  };
  await writeFile(
    join(artifactDir, "browser-qa-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  validateReport(report);
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

async function waitForHttpReady(origin, child, getStdout, getStderr) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `managed_backend_exited:${child.exitCode}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
      );
    }
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // continue polling while the dev server boots
    }
    await delay(400);
  }
  throw new Error(
    `managed_backend_timeout:${origin}\n${getStdout().trim()}\n${getStderr().trim()}`.trim(),
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
  await jsonFetch("/api/creator/parse", {
    method: "POST",
    cookie,
    idempotencyKey: `qa-parse-${Date.now()}`,
    body: {},
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
  const exportReadyEpisode = createdEpisodes[2] ?? createdEpisodes[0];
  const episodeId = primaryEpisode.id;
  const exportReadyEpisodeId = exportReadyEpisode.id;
  const assetSeeds = [
    {
      key: "hero",
      kind: "character",
      name: "废土主角",
      description: "瘦削、警惕、穿破旧夹克，肩背磨损背包，面部有风沙痕迹。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "street",
      kind: "scene",
      name: "残破街区",
      description: "断墙残楼、空气混浊，远处残存冷色灯牌，地面遍布碎石。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "radio",
      kind: "prop",
      name: "旧式通讯器",
      description: "金属外壳有划痕，屏幕裂纹明显，但仍能发出微弱蓝光。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "ally",
      kind: "character",
      name: "蓬头垢面的女人",
      description: "头发凌乱，神情疲惫但强硬，裹着褪色布料，手臂有旧伤。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "elder",
      kind: "character",
      name: "年纪更大的女人",
      description: "面容消瘦、皱纹明显，旧披肩裹身，目光沉静但戒备。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "diner",
      kind: "scene",
      name: "山谷难民营地",
      description: "临时帐篷与铁皮围挡构成营地入口，空气里有灰尘和紧张感。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "fog",
      kind: "scene",
      name: "灰雾街区",
      description: "灰雾低垂、路牌残缺、地面积水反光，氛围压抑。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
    {
      key: "wagon",
      kind: "prop",
      name: "破旧牛车",
      description: "木轮磨损严重，铁件生锈，车辕上缠着褪色麻绳。",
      sourceUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
      mimeType: "image/png",
      width: 1,
      height: 1,
    },
  ];
  for (const asset of assetSeeds) {
    const upload = await uploadSeedAsset(cookie, project.project.id, asset.key, asset.kind);
    await jsonFetch("/api/creator/assets/import", {
      method: "POST",
      cookie,
      body: {
        kind: asset.kind,
        name: asset.name,
        description: asset.description,
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
  const exportReadyShots = [
    {
      title: "导出镜头一",
      description: "用于验证成功导出的完整视频分镜一。",
    },
    {
      title: "导出镜头二",
      description: "用于验证成功导出的完整视频分镜二。",
    },
  ];
  for (const shot of exportReadyShots) {
    await jsonFetch("/api/creator/shots", {
      method: "POST",
      cookie,
      body: {
        projectId: project.project.id,
        episodeId: exportReadyEpisodeId,
        title: shot.title,
        description: shot.description,
      },
    });
  }
  await jsonFetch("/api/creator/assets/confirm-all", {
    method: "POST",
    cookie,
  });
  await jsonFetch("/api/creator/calibration/run", {
    method: "POST",
    cookie,
    idempotencyKey: `qa-calibration-${Date.now()}`,
    body: {},
  });
  await prepareExportReadyEpisode(cookie, exportReadyEpisodeId);
  return {
    cookie,
    projectId: project.project.id,
    episodeId,
    exportReadyEpisodeId,
    workbenchEpisodeId: episodeId,
  };
}

async function uploadSeedAsset(cookie, projectId, baseName, kind = "character") {
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
      purpose: `asset-import/${kind}`,
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

async function prepareExportReadyEpisode(cookie, episodeId) {
  const storyboardsEnvelope = await jsonFetch(`/api/episodes/${episodeId}/storyboards?page=1&pageSize=50`, {
    cookie,
  });
  const storyboards = Array.isArray(storyboardsEnvelope?.data?.items) ? storyboardsEnvelope.data.items : [];
  if (!storyboards.length) {
    throw new Error(`seed_export_ready_missing_storyboards:${episodeId}`);
  }

  const videoTaskEnvelope = await jsonFetch(`/api/episodes/${episodeId}/generation/video-tasks`, {
    method: "POST",
    cookie,
    idempotencyKey: `qa-export-ready-video-${episodeId}-${Date.now()}`,
    body: {
      targetType: "episode",
      targetId: episodeId,
      motionPrompt: "export ready episode video",
      model: "video_mock_1",
      parameters: { durationSec: 5 },
    },
  });

  const assetVersionId = videoTaskEnvelope?.data?.result?.assetVersionId ?? null;
  const storageObjectId = videoTaskEnvelope?.data?.result?.storageObjectId ?? null;
  if (!assetVersionId || !storageObjectId) {
    throw new Error(`seed_export_ready_missing_video_result:${episodeId}`);
  }

  for (const storyboard of storyboards) {
    const storyboardId = storyboard?.storyboardId ?? storyboard?.id ?? null;
    if (!storyboardId) {
      continue;
    }
    await jsonFetch(`/api/episodes/${episodeId}/storyboards/${storyboardId}/set-current-video`, {
      method: "POST",
      cookie,
      idempotencyKey: `qa-set-export-video-${storyboardId}-${Date.now()}`,
      body: {
        assetVersionId,
        storageObjectId,
      },
    });
  }
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

async function verifyAssetSectionTabScroll(page) {
  const before = await evaluate(page, assetSectionScrollMetricsScript());
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="prop"]');
  await waitForCondition(
    page,
    `(() => {
      const left = document.querySelector('.episode-replica-left');
      const prop = document.querySelector('[data-asset-section="prop"]');
      if (!left || !prop) return false;
      const gap = Math.abs(prop.getBoundingClientRect().top - left.getBoundingClientRect().top);
      return document.querySelector('[data-action="set-project-asset-tab"][data-asset-tab="prop"]')?.classList.contains('active') &&
        left.scrollTop > 20 &&
        gap < 90;
    })()`,
    10_000,
  );
  const afterProp = await evaluate(page, assetSectionScrollMetricsScript());
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="scene"]');
  await waitForCondition(
    page,
    `(() => {
      const left = document.querySelector('.episode-replica-left');
      const scene = document.querySelector('[data-asset-section="scene"]');
      if (!left || !scene) return false;
      const gap = Math.abs(scene.getBoundingClientRect().top - left.getBoundingClientRect().top);
      return document.querySelector('[data-action="set-project-asset-tab"][data-asset-tab="scene"]')?.classList.contains('active') &&
        gap < 90;
    })()`,
    10_000,
  );
  const afterScene = await evaluate(page, assetSectionScrollMetricsScript());
  await click(page, '[data-action="set-project-asset-tab"][data-asset-tab="character"]');
  await waitForCondition(
    page,
    `(() => {
      const left = document.querySelector('.episode-replica-left');
      if (!left) return false;
      return document.querySelector('[data-action="set-project-asset-tab"][data-asset-tab="character"]')?.classList.contains('active') &&
        left.scrollTop < 20;
    })()`,
    10_000,
  );
  const afterCharacter = await evaluate(page, assetSectionScrollMetricsScript());

  return {
    before,
    afterProp,
    afterScene,
    afterCharacter,
  };
}

async function focusElement(page, selector) {
  const result = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    return true;
  })()`);
  if (!result) {
    throw new Error(`focus_missing:${selector}`);
  }
}

async function pageInsertText(page, text) {
  await page.send("Input.insertText", { text });
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
      hasQuickReferenceCard: visible('.episode-replica-ref-card.quick-reference'),
      hasImageResultAction: visible('[data-result-action="set-storyboard-image"]'),
      hasVideoResultAction: visible('[data-result-action="set-storyboard-video"]'),
      hasBatchModal: visible('.episode-batch-modal'),
      hasBatchConfigCopy:
        visible('.episode-batch-style-grid') ||
        visible('.episode-batch-config-grid') ||
        document.body.innerText.includes('模型画风') ||
        document.body.innerText.includes('其他配置') ||
        document.body.innerText.includes('统一配置会按当前内容分别写入视频任务。'),
      hasBatchSubmitCopy:
        visible('[data-action="submit-episode-batch-modal"]') &&
        (
          document.body.innerText.includes('生成') ||
          document.body.innerText.includes('处理')
        ),
      hasExportPreview: visible('.episode-export-preview'),
      hasExportBlockedToast: document.body.innerText.includes('还有分镜未完成'),
      hasExportFallbackCopy: document.body.innerText.includes('原视频导出链接暂未生成，请稍后刷新重试。'),
      hasExportReadyCopy: document.body.innerText.includes('导出包已准备好，可以直接下载。'),
      lastDownloadTriggerUrl: window.__lastDownloadTrigger?.url ?? '',
      lastDownloadTriggerFileName: window.__lastDownloadTrigger?.fileName ?? '',
      hasAssetMode: visible('.episode-replica-layout.assets-mode'),
      hasAssetContinuousSections:
        document.querySelectorAll('.episode-replica-asset-section').length === 3 &&
        document.querySelectorAll('.episode-replica-asset-section .episode-replica-asset-card').length >= 3,
      hasAssetLibraryModal: visible('.episode-asset-library-modal'),
      hasAssetLibraryTitle: document.body.innerText.includes('从资产库添加'),
      hasAssetLibraryFooter: visible('.episode-asset-library-footer'),
      hasAssetLibraryPagination: visible('.episode-asset-library-pagination'),
      hasAssetVoiceConfigured: visible('.episode-replica-asset-card.active .voice.configured'),
      hasAssetVoiceEditLabel:
        document.querySelector('.episode-replica-asset-card.active .voice')?.innerText?.includes('编辑') ?? false,
      hasAssetVoiceSelectedState:
        document.querySelector('.episode-voice-card.active[data-voice-name="女/稚嫩"]') !== null,
      hasLipSyncMode: visible('.episode-replica-prompt.lip-sync-mode'),
      hasVoiceModal: visible('.episode-voice-picker-modal'),
      hasVoiceModalTitle: document.body.innerText.includes('选择配音'),
      hasVoiceModalCardRadio: visible('.episode-voice-card-radio'),
      hasVoiceModalPreviewTrigger: visible('.episode-voice-preview-trigger'),
      hasLipSyncAudioPreviewAction: visible('[data-action="preview-lip-sync-audio"]'),
      hasLipSyncAudioEmpty: document.body.innerText.includes('暂无数据'),
      promptValueLength: document.querySelector('#video-prompt-input')?.value?.length ?? 0,
      promptValue: document.querySelector('#video-prompt-input')?.value ?? '',
      hasMentionMenu: visible('.episode-replica-mention-menu'),
      mentionSuggestionCount: document.querySelectorAll('.episode-replica-mention-option').length,
      hasMentionChip: visible('.episode-replica-mention-chip'),
      mentionChipCount: document.querySelectorAll('.episode-replica-mention-chip').length,
      mentionHookSuggestionCount:
        window.__episodeWorkbenchTestApi?.getPromptMentionState?.().suggestionCount ?? 0,
      mentionReferenceCount:
        window.__episodeWorkbenchTestApi?.getPromptMentionState?.().mentionReferenceCount ?? 0,
      mentionHookPrompt:
        window.__episodeWorkbenchTestApi?.getPromptMentionState?.().prompt ?? "",
      assetDescriptionValue:
        document.querySelector('.episode-replica-asset-card.active .episode-replica-asset-desc-input')?.value
        ?? document.querySelector('.episode-replica-asset-desc-input')?.value
        ?? '',
      storyboardDescriptionValue:
        document.querySelector('.episode-replica-shot-card.active .episode-replica-shot-desc-input')?.value
        ?? document.querySelector('.episode-replica-shot-desc-input')?.value
        ?? '',
      hasExportRunningStatus:
        document.body.innerText.includes('正在导出视频') ||
        document.body.innerText.includes('正在导出剪映工程'),
      exportModalStatusText: document.querySelector('.episode-export-modal-status')?.textContent?.trim() ?? '',
      hasStoryboardToggleActive: Boolean(document.querySelector('button.active[data-action="set-muse-scope-mode"][data-mode="storyboard"]')),
      hasAssetsToggleActive: Boolean(document.querySelector('button.active[data-action="set-muse-scope-mode"][data-mode="assets"]')),
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

function assetSectionScrollMetricsScript() {
  return `(() => {
    const left = document.querySelector('.episode-replica-left');
    const sectionMetrics = Object.fromEntries(
      ['character', 'scene', 'prop'].map((kind) => {
        const section = document.querySelector(\`[data-asset-section="\${kind}"]\`);
        if (!left || !section) {
          return [kind, null];
        }
        const leftRect = left.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        return [kind, {
          topGap: Math.round(sectionRect.top - leftRect.top),
          height: Math.round(sectionRect.height),
          cardCount: section.querySelectorAll('.episode-replica-asset-card').length,
        }];
      }),
    );
    const activeTab = document.querySelector('[data-action="set-project-asset-tab"].active')?.dataset.assetTab ?? null;
    return {
      activeTab,
      sectionCount: document.querySelectorAll('.episode-replica-asset-section').length,
      cardCount: document.querySelectorAll('.episode-replica-asset-section .episode-replica-asset-card').length,
      scrollTop: Math.round(left?.scrollTop ?? 0),
      scrollHeight: Math.round(left?.scrollHeight ?? 0),
      clientHeight: Math.round(left?.clientHeight ?? 0),
      canScroll: Boolean(left && left.scrollHeight > left.clientHeight),
      sections: sectionMetrics,
    };
  })()`;
}

function validateReport(report) {
  const failures = [];
  const {
    project,
    workbenchInitial,
    workbenchStoryboardAutosave,
    workbenchMentionMenu,
    workbenchMentionInsert,
    workbenchImageResult,
    workbenchBatchModal,
    workbenchExportRunning,
    workbenchExportPreview,
    workbenchAssetMode,
    workbenchAssetScroll,
    workbenchAssetAutosave,
    workbenchAssetLibraryModal,
    workbenchAssetVoice,
    workbenchVoiceModal,
    workbenchLipSync,
    workbenchExportReadyRunning,
    workbenchExportReady,
    workbenchJianyingRunning,
    workbench,
    mobile,
  } = report.metrics ?? {};

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
  if (!workbenchInitial?.hasStoryboardMode) {
    failures.push("desktop storyboard mode did not render initially");
  }
  if (!String(workbenchStoryboardAutosave?.storyboardDescriptionValue ?? "").includes("QA 分镜失焦保存")) {
    failures.push("storyboard description blur autosave did not persist after reload");
  }
  if (
    !workbenchMentionMenu?.hasMentionMenu &&
    (workbenchMentionMenu?.mentionSuggestionCount ?? 0) <= 0 &&
    (workbenchMentionMenu?.mentionHookSuggestionCount ?? 0) <= 0
  ) {
    failures.push("prompt @ mention menu did not open with selectable suggestions");
  }
  if (
    (workbenchMentionInsert?.mentionReferenceCount ?? 0) <= 0 ||
    !(
      String(workbenchMentionInsert?.promptValue ?? "").includes("【@") ||
      String(workbenchMentionInsert?.mentionHookPrompt ?? "").includes("【@") ||
      (workbenchMentionInsert?.hasMentionChip ?? false)
    )
  ) {
    failures.push("prompt @ mention selection did not write token and mention reference back to the storyboard prompt");
  }
  if ((workbenchImageResult?.promptValueLength ?? 0) <= 0 || !workbenchImageResult?.hasQuickReferenceCard) {
    failures.push("image generation path did not preserve quick reference prompt context");
  }
  if (!workbenchImageResult?.hasImageResultAction) {
    failures.push("image result actions missing set-storyboard-image");
  }
  if (!workbenchBatchModal?.hasBatchModal || !workbenchBatchModal?.hasBatchConfigCopy || !workbenchBatchModal?.hasBatchSubmitCopy) {
    failures.push("batch modal state not visible");
  }
  if (!workbenchExportPreview?.hasExportPreview && !workbenchExportPreview?.hasExportBlockedToast) {
    failures.push("export preview or blocked warning did not render");
  }
  if (
    !workbenchExportPreview?.hasExportBlockedToast &&
    !workbenchExportPreview?.hasExportFallbackCopy &&
    !workbenchExportPreview?.hasExportReadyCopy
  ) {
    failures.push("export preview missing ready/fallback copy");
  }
  if (!workbenchAssetMode?.hasAssetMode || !workbenchAssetMode?.hasAssetsToggleActive) {
    failures.push("asset preparation mode did not render");
  }
  if (!String(workbenchAssetAutosave?.assetDescriptionValue ?? "").includes("QA 资产失焦保存")) {
    failures.push("asset description blur autosave did not persist after reload");
  }
  if (!workbenchAssetMode?.hasAssetContinuousSections) {
    failures.push("asset preparation mode did not keep character scene and prop in one continuous list");
  }
  if (
    !workbenchAssetScroll?.before?.canScroll ||
    !workbenchAssetScroll?.afterProp?.canScroll ||
    !workbenchAssetScroll?.afterScene?.canScroll ||
    !workbenchAssetScroll?.afterCharacter?.canScroll ||
    workbenchAssetScroll?.afterProp?.activeTab !== "prop" ||
    workbenchAssetScroll?.afterScene?.activeTab !== "scene" ||
    workbenchAssetScroll?.afterCharacter?.activeTab !== "character" ||
    (workbenchAssetScroll?.afterProp?.scrollTop ?? 0) <= 20 ||
    (workbenchAssetScroll?.afterCharacter?.scrollTop ?? 0) >= 20
  ) {
    failures.push("asset section tabs did not scroll the shared left asset list to the expected sections");
  }
  if (
    !workbenchAssetLibraryModal?.hasAssetLibraryModal ||
    !workbenchAssetLibraryModal?.hasAssetLibraryTitle ||
    !workbenchAssetLibraryModal?.hasAssetLibraryFooter ||
    !workbenchAssetLibraryModal?.hasAssetLibraryPagination
  ) {
    failures.push("asset library import modal did not render the episode-workbench variant");
  }
  if (
    !workbenchAssetVoice?.hasAssetVoiceConfigured ||
    !workbenchAssetVoice?.hasAssetVoiceEditLabel ||
    !workbenchAssetVoice?.hasAssetVoiceSelectedState
  ) {
    failures.push("asset voice writeback did not persist the configured chip and reopen selected state");
  }
  if (
    !workbenchVoiceModal?.hasVoiceModal ||
    !workbenchVoiceModal?.hasVoiceModalTitle ||
    !workbenchVoiceModal?.hasVoiceModalCardRadio ||
    !workbenchVoiceModal?.hasVoiceModalPreviewTrigger
  ) {
    failures.push("voice picker modal did not render the expected episode-workbench card layout");
  }
  if (!workbenchLipSync?.hasLipSyncMode || !workbenchLipSync?.hasLipSyncAudioPreviewAction) {
    failures.push("lip-sync audio generation path did not render previewable audio results");
  }
  if (
    !workbenchExportReadyRunning?.hasExportRunningStatus ||
    !String(workbenchExportReadyRunning?.exportModalStatusText ?? "").includes("正在导出视频")
  ) {
    failures.push("export-ready mp4 path skipped the running feedback state");
  }
  if (!workbenchExportReady?.hasExportReadyCopy) {
    failures.push("export success path did not render a ready-to-download state");
  }
  if (
    !workbenchJianyingRunning?.hasExportRunningStatus ||
    !String(workbenchJianyingRunning?.exportModalStatusText ?? "").includes("正在导出剪映工程")
  ) {
    failures.push("jianying export path skipped the running feedback state");
  }
  if (!String(report.downloads?.mp4?.fileName ?? "").endsWith(".mp4")) {
    failures.push(`mp4 export did not trigger a direct download: ${report.downloads?.mp4?.fileName ?? "missing"}`);
  }
  if (!String(report.downloads?.jianying?.fileName ?? "").endsWith(".zip")) {
    failures.push(`jianying export did not trigger a direct download: ${report.downloads?.jianying?.fileName ?? "missing"}`);
  }
  if (!workbenchExportPreview?.hasVideoResultAction) {
    failures.push("video result actions missing set-storyboard-video before export");
  }
  if (workbenchLipSync?.hasVideoResultAction) {
    failures.push("lip-sync mode should not expose set-storyboard-video actions in the current scope");
  }

  const launchWidth = project?.launchColumnRect?.width ?? 0;
  const episodeListWidth = project?.episodeListRect?.width ?? 0;
  if (episodeListWidth > 0 && episodeListWidth > 900) {
    failures.push(`project episode list too wide: ${episodeListWidth}`);
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
