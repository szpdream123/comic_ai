import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = (html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "").replace(/\r\n/g, "\n");

function baiduHelpers() {
  const helperStart = script.indexOf("const GEO_BAIDU_SUBMISSION_SCHEMA_VERSION");
  const helperEnd = script.indexOf("function invalidateGeoContentRequests", helperStart);
  assert.notEqual(helperStart, -1, "Baidu submission helpers exist");
  assert.notEqual(helperEnd, -1, "Baidu submission helpers have a stable boundary");
  const context = { result: {}, state: {}, URL, Date };
  vm.runInNewContext(`${script.slice(helperStart, helperEnd)}
    result.storageKey = geoBaiduStorageKey;
    result.entries = geoBaiduPublishedEntries;
    result.normalize = geoBaiduNormalizePublishedUrl;
    result.empty = geoBaiduEmptyLedger;
    result.record = geoBaiduRecordStage;
    result.batch = geoBaiduSubmissionBatch;
    result.importData = geoBaiduImportData;
  `, context);
  return context.result;
}

test("admin GEO Baidu ledger isolates browser storage by administrator and official site", () => {
  const helpers = baiduHelpers();
  const first = helpers.storageKey({ account: { id: "admin-1" } }, "https://www.lingxiyunai.com");
  const second = helpers.storageKey({ account: { id: "admin-2" } }, "https://www.lingxiyunai.com");
  const otherSite = helpers.storageKey({ account: { id: "admin-1" } }, "https://example.com");

  assert.notEqual(first, second);
  assert.notEqual(first, otherSite);
  assert.match(first, /admin-1/);
  assert.match(first, /www\.lingxiyunai\.com/);
  assert.equal(helpers.storageKey({}, "https://www.lingxiyunai.com"), "");
});

test("admin GEO Baidu ledger waits for published content before reading browser storage", () => {
  const helperStart = script.indexOf("const GEO_BAIDU_SUBMISSION_SCHEMA_VERSION");
  const helperEnd = script.indexOf("function invalidateGeoContentRequests", helperStart);
  const store = { contentLoaded: false, content: [] };
  let reads = 0;
  const context = {
    result: null,
    state: { session: { account: { id: "admin-1" } } },
    URL,
    Date,
    geoOperationsState: () => store,
    localStorage: { getItem: () => { reads += 1; return null; } },
  };
  vm.runInNewContext(`${script.slice(helperStart, helperEnd)}\nresult = geoBaiduSubmissionState;`, context);

  context.result();
  assert.equal(reads, 0, "an initially empty content store must not prune saved records");
  store.contentLoaded = true;
  context.result();
  assert.equal(reads, 1);
});

test("admin GEO Baidu candidates contain only unique currently published official URLs", () => {
  const helpers = baiduHelpers();
  const content = [
    { id: "1", status: "published", currentPublishedVersionId: "v1", contentType: "guide", slug: "published-guide", topic: "指南" },
    { id: "2", status: "draft", currentPublishedVersionId: "v2", contentType: "answer", slug: "published-answer", topic: "问答" },
    { id: "3", status: "archived", currentPublishedVersionId: "v3", contentType: "guide", slug: "archived-guide", topic: "归档" },
    { id: "4", status: "published", currentPublishedVersionId: null, contentType: "guide", slug: "draft-only", topic: "草稿" },
    { id: "5", status: "published", currentPublishedVersionId: "v5", contentType: "guide", slug: "published-guide", topic: "重复" },
    { id: "6", status: "published", currentPublishedVersionId: "v6", contentType: "guide", slug: "bad/<script>", topic: "非法" },
  ];

  const entries = helpers.entries(content, "https://www.lingxiyunai.com");
  assert.deepEqual(Array.from(entries, (entry) => entry.url), [
    "https://www.lingxiyunai.com/",
    "https://www.lingxiyunai.com/script",
    "https://www.lingxiyunai.com/canvas",
    "https://www.lingxiyunai.com/projects",
    "https://www.lingxiyunai.com/assets",
    "https://www.lingxiyunai.com/team",
    "https://www.lingxiyunai.com/guides",
    "https://www.lingxiyunai.com/answers",
    "https://www.lingxiyunai.com/guides/published-guide",
    "https://www.lingxiyunai.com/answers/published-answer",
  ]);
  const allowed = new Set(entries.map((entry) => entry.url));
  assert.equal(helpers.normalize("https://www.lingxiyunai.com/guides/published-guide/", allowed, "https://www.lingxiyunai.com"), "https://www.lingxiyunai.com/guides/published-guide");
  assert.throws(() => helpers.normalize("https://attacker.example/guides/published-guide", allowed, "https://www.lingxiyunai.com"), /官网/);
  assert.throws(() => helpers.normalize("https://www.lingxiyunai.com/guides/not-published", allowed, "https://www.lingxiyunai.com"), /已发布/);
});

test("admin GEO Baidu ledger keeps attempt, acceptance, and indexing distinct while enforcing quota pause", () => {
  const helpers = baiduHelpers();
  const content = Array.from({ length: 15 }, (_, index) => ({
    id: String(index), status: "published", currentPublishedVersionId: `v${index}`,
    contentType: "guide", slug: `article-${index}`, topic: `文章 ${index}`,
  }));
  const entries = helpers.entries(content, "https://www.lingxiyunai.com");
  const allowed = new Set(entries.map((entry) => entry.url));
  let ledger = helpers.empty("https://www.lingxiyunai.com");
  ledger.quota.available = 12;
  const firstUrl = entries[0].url;

  ledger = helpers.record(ledger, [firstUrl], "attempted", allowed, "2026-09-10T01:00:00.000Z");
  assert.equal(ledger.quota.available, 11);
  assert.equal(ledger.records[0].attemptedAt, "2026-09-10T01:00:00.000Z");
  assert.equal(ledger.records[0].acceptedAt, null);
  assert.equal(ledger.records[0].indexedAt, null);
  assert.throws(() => helpers.record(ledger, [entries[2].url], "accepted", allowed, "2026-09-10T02:00:00.000Z"), /提交尝试/);
  ledger = helpers.record(ledger, [entries[1].url], "indexed", allowed, "2026-09-10T02:00:00.000Z");
  assert.equal(ledger.records[1].attemptedAt, null, "natural indexing does not invent a submission attempt");
  assert.equal(ledger.records[1].acceptedAt, null, "indexing evidence does not invent platform acceptance");
  ledger = helpers.record(ledger, [firstUrl], "accepted", allowed, "2026-09-10T02:00:00.000Z");
  ledger = helpers.record(ledger, [firstUrl], "indexed", allowed, "2026-09-10T03:00:00.000Z");
  assert.equal(ledger.records[0].acceptedAt, "2026-09-10T02:00:00.000Z");
  assert.equal(ledger.records[0].indexedAt, "2026-09-10T03:00:00.000Z");
  assert.equal(helpers.batch(entries, ledger).length, 11, "batch follows the decremented available count rather than a fixed daily size");
  ledger = helpers.record(ledger, [firstUrl], "attempted", allowed, "2026-09-10T04:00:00.000Z");
  assert.equal(ledger.quota.available, 11, "re-recording an existing attempt does not consume quota twice");
  ledger.quota.available = 100;
  assert.equal(helpers.batch(entries, ledger).length, 20, "one manual submission batch never exceeds the platform's 20 URL input limit");
  ledger.quota.paused = true;
  assert.deepEqual(Array.from(helpers.batch(entries, ledger)), []);
  assert.throws(() => helpers.record(ledger, [entries[1].url], "attempted", allowed, "2026-09-10T04:00:00.000Z"), /暂停/);
});

test("admin GEO Baidu import accepts the audit format without turning reports into verified success", () => {
  const helpers = baiduHelpers();
  const validUrl = "https://www.lingxiyunai.com/guides/published-guide";
  const allowed = new Set(helpers.entries([
    { id: "1", status: "published", currentPublishedVersionId: "v1", contentType: "guide", slug: "published-guide", topic: "指南" },
  ], "https://www.lingxiyunai.com").map((entry) => entry.url));
  const artifact = {
    checkedAt: "2026-09-10T03:22:21.855Z",
    source: "https://www.lingxiyunai.com/sitemap.xml",
    submissionStatus: "paused_quota_exceeded",
    reportedSubmitted: {
      source: "user_report",
      urls: [validUrl, "https://www.lingxiyunai.com/", "https://www.lingxiyunai.com/guides", "https://www.lingxiyunai.com/canvas", "https://attacker.example/guides/published-guide"],
      platformAcceptanceVerified: false,
      indexingVerified: false,
    },
  };

  const imported = helpers.importData(artifact, helpers.empty("https://www.lingxiyunai.com"), allowed, "2026-09-10T04:00:00.000Z");
  assert.equal(imported.importedCount, 4);
  assert.equal(imported.ignoredCount, 1);
  assert.equal(imported.ledger.quota.paused, true);
  assert.equal(imported.ledger.quota.available, 0);
  assert.equal(imported.ledger.records[0].attemptedAt, artifact.checkedAt);
  assert.equal(imported.ledger.records[0].acceptedAt, null);
  assert.equal(imported.ledger.records[0].indexedAt, null);
  assert.equal("source" in imported.ledger.records[0], false, "untrusted import fields are not persisted");

  const stringBooleans = structuredClone(artifact);
  stringBooleans.reportedSubmitted.platformAcceptanceVerified = "false";
  assert.throws(() => helpers.importData(stringBooleans, helpers.empty("https://www.lingxiyunai.com"), allowed), /必须是布尔值/);

  const independentlyIndexed = structuredClone(artifact);
  independentlyIndexed.submissionStatus = "reported";
  independentlyIndexed.reportedSubmitted.urls = [validUrl];
  independentlyIndexed.reportedSubmitted.indexingVerified = true;
  const indexedImport = helpers.importData(independentlyIndexed, helpers.empty("https://www.lingxiyunai.com"), allowed);
  assert.equal(indexedImport.ledger.records[0].acceptedAt, null);
  assert.equal(indexedImport.ledger.records[0].indexedAt, artifact.checkedAt);

  const quotaLimitedLedger = helpers.empty("https://www.lingxiyunai.com");
  quotaLimitedLedger.quota = { available: 0, paused: true, updatedAt: "2026-09-10T03:00:00.000Z" };
  const historicalReport = {
    checkedAt: artifact.checkedAt,
    submissionStatus: "reported",
    reportedSubmitted: {
      urls: [validUrl],
      platformAcceptanceVerified: false,
      indexingVerified: false,
    },
  };
  const historicalImport = helpers.importData(historicalReport, quotaLimitedLedger, allowed, "2026-09-10T04:00:00.000Z");
  assert.equal(historicalImport.importedCount, 1, "historical records bypass the quota for new attempts");
  assert.equal(historicalImport.ledger.records[0].attemptedAt, artifact.checkedAt);
  assert.deepEqual(
    { ...historicalImport.ledger.quota },
    { available: 0, paused: true, updatedAt: "2026-09-10T03:00:00.000Z" },
    "historical import preserves the current quota and pause state",
  );

  const invalidBackup = {
    schemaVersion: 1,
    siteOrigin: "https://www.lingxiyunai.com",
    quota: { available: 1, paused: false },
    records: [{ url: "https://attacker.example/guides/published-guide", attemptedAt: artifact.checkedAt }],
  };
  assert.throws(() => helpers.importData(invalidBackup, imported.ledger, allowed, "2026-09-10T05:00:00.000Z"), /官网/);
});

test("admin GEO Baidu import cancels when account or records change while reading a file", async () => {
  const start = script.indexOf("async function geoBaiduImportFile(event)");
  const end = script.indexOf("function geoBaiduExportBackup", start);
  for (const change of ["account", "records", "unchanged"]) {
    let finish;
    let current = { scopeKey: "admin-A", ledger: { records: [] }, allowedUrls: new Set() };
    const writes = [], messages = [];
    const context = {
      run: null,
      geoBaiduSubmissionState: () => ({ ...current, ledger: structuredClone(current.ledger) }),
      geoBaiduImportData: (_payload, ledger) => ({ ledger, importedCount: 1, ignoredCount: 0 }),
      geoBaiduSaveLedger: (ledger) => { writes.push({ key: current.scopeKey, ledger }); return true; },
      renderShell() {}, showToast: (message) => messages.push(message),
    };
    vm.runInNewContext(`${script.slice(start, end)}\nrun = geoBaiduImportFile;`, context);
    const target = { files: [{ text: () => new Promise((resolve) => { finish = resolve; }) }], value: "selected" };
    const pending = context.run({ target });
    if (change === "account") current = { ...current, scopeKey: "admin-B", ledger: { records: [] } };
    if (change === "records") current = { ...current, ledger: { records: [{ url: "new-record" }] } };
    finish("{}");
    await pending;
    assert.equal(writes.length, change === "unchanged" ? 1 : 0, change);
    if (change !== "unchanged") assert.match(messages.join(" "), /变化|切换/);
    assert.equal(target.value, "");
  }
});

test("admin GEO Baidu normal import succeeds with actual normalized browser state", async () => {
  const start = script.indexOf("const GEO_BAIDU_SUBMISSION_SCHEMA_VERSION");
  const end = script.indexOf("function invalidateGeoContentRequests", start);
  const store = { contentLoaded: true, content: [] };
  const writes = [], messages = [];
  const context = {
    run: null, URL, Date,
    state: { session: { account: { id: "admin-A" } } },
    geoOperationsState: () => store,
    localStorage: { getItem: () => null, setItem: (key, value) => writes.push({ key, value }) },
    renderShell() {}, showToast: (message) => messages.push(message),
  };
  vm.runInNewContext(`${script.slice(start, end)}\nrun = geoBaiduImportFile;`, context);
  const payload = { checkedAt: "2026-09-10", reportedSubmitted: { urls: ["https://www.lingxiyunai.com/"], platformAcceptanceVerified: false, indexingVerified: false } };
  await context.run({ target: { files: [{ text: async () => JSON.stringify(payload) }], value: "selected" } });
  assert.equal(writes.length, 1, messages.join(" "));
  assert.match(writes[0].key, /admin-A/);
  assert.equal(JSON.parse(writes[0].value).records.length, 1);
});

test("admin GEO Baidu panel clearly labels local-only storage and manual evidence stages", () => {
  const pageStart = script.indexOf("function geoOperationsPage");
  const pageEnd = script.indexOf("async function geoCreateQuestion", pageStart);
  const store = {
    loadError: "", platforms: [], questions: [], evidence: [], content: [], details: {}, settings: {},
    selectedQuestionId: "", selectedQuestionIds: [], selectedEvidenceIds: [], monitoringContentItemId: "",
    monitoringPlatformId: "", monitoring: null, monitoringLoadError: "", monitoringLoading: false,
  };
  const context = {
    result: "", geoOperationsState: () => store, escapeHtml: (value) => String(value ?? ""), escapeAttribute: (value) => String(value ?? ""),
    geoPlatformTags: () => "", geoPlatformPicker: () => "", geoQualityCounts: () => ({ blockers: 0, warnings: 0, title: "" }),
    geoBaiduPanelMarkup: () => `<section><h3>百度提交记录与去重导出</h3><p>记录仅保存在当前浏览器，并按当前后台账号与官网分区。</p><span>提交尝试</span><span>平台接收</span><span>索引确认</span><button>导出 JSON 备份</button></section>`,
  };
  vm.runInNewContext(`${script.slice(pageStart, pageEnd)}\nresult = geoOperationsPage();`, context);

  assert.match(context.result, /百度提交记录与去重导出/);
  assert.match(context.result, /仅保存在当前浏览器/);
  for (const label of ["提交尝试", "平台接收", "索引确认", "导出 JSON 备份"]) assert.match(context.result, new RegExp(label));
  assert.doesNotMatch(context.result, /百度推送|自动提交成功/);
});
