import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../../shared/db/sql.ts";
import { createAutomaticMarketingTextPlanner } from "../infrastructure/marketing-text-agent-provider.ts";

type Json = Record<string, unknown> | unknown[];

type CollectionJob = {
  id: string;
  project_id: string;
  campaign_id: string | null;
  collection_mode: "keyword" | "creator";
  query_text: string;
  crawler_base_url: string;
  max_items: number;
  include_comments: boolean;
  interval_minutes: number;
  created_by_admin_id: string;
};

type CollectionRun = CollectionJob & {
  run_id: string;
  status: "queued" | "collecting" | "analyzing";
  started_at: Date | null;
};

type CrawlerFile = { path: string; modified_at: number | string; type: string };

const MEDIA_CRAWLER_DOUYIN_DATA_PLATFORM = "douyin";

export type MarketingCompetitorCollectionWorkerResult = {
  runId: string;
  status: "collecting" | "analyzing" | "succeeded" | "failed";
  failureCode?: string;
};

/**
 * Runs against a separately installed local MediaCrawler instance. It never
 * receives crawler cookies and stores a bounded result snapshot for personal
 * research only; downstream prompting uses a structural profile, not copies.
 */
export class MarketingCompetitorCollectionWorker {
  private readonly now: () => Date;

  constructor(private readonly deps: { db: SqlDatabase; fetchImpl?: typeof fetch; now?: () => Date }) {
    this.now = deps.now ?? (() => new Date());
  }

  async processNext(): Promise<MarketingCompetitorCollectionWorkerResult | null> {
    const run = await this.claimNext();
    if (!run) return null;
    try {
      if (run.status === "queued") return await this.startCollection(run);
      if (run.status === "collecting") return await this.collectResult(run);
      return await this.createPromptPackage(run);
    } catch (error) {
      const failureCode = errorCode(error);
      await this.deps.db.query(
        `UPDATE marketing_competitor_collection_runs
         SET status = 'failed', failure_code = $2, finished_at = now(), updated_at = now()
         WHERE id = $1 AND status IN ('queued', 'collecting', 'analyzing')`,
        [run.run_id, failureCode],
      );
      return { runId: run.run_id, status: "failed", failureCode };
    }
  }

  async processUntilIdle(limit = 20) {
    const results: MarketingCompetitorCollectionWorkerResult[] = [];
    for (let index = 0; index < Math.max(1, Math.min(100, limit)); index += 1) {
      const result = await this.processNext();
      if (!result) break;
      results.push(result);
    }
    return results;
  }

  private async claimNext(): Promise<CollectionRun | null> {
    await this.deps.db.query("BEGIN");
    try {
      const existing = await this.deps.db.query<CollectionRun>(
        `SELECT run.id AS run_id, run.status, run.started_at,
                job.id, job.project_id, job.campaign_id, job.collection_mode, job.query_text,
                job.crawler_base_url, job.max_items, job.include_comments, job.interval_minutes, job.created_by_admin_id
         FROM marketing_competitor_collection_runs AS run
         JOIN marketing_competitor_collection_jobs AS job ON job.id = run.job_id
         WHERE run.status IN ('queued', 'collecting', 'analyzing')
         ORDER BY run.created_at
         FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      if (existing.rows[0]) {
        await this.deps.db.query("COMMIT");
        return existing.rows[0];
      }
      const due = await this.deps.db.query<CollectionJob>(
        `SELECT id, project_id, campaign_id, collection_mode, query_text, crawler_base_url,
                max_items, include_comments, interval_minutes, created_by_admin_id
         FROM marketing_competitor_collection_jobs
         WHERE status = 'active' AND next_run_at <= now()
         ORDER BY next_run_at, created_at
         FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const job = due.rows[0];
      if (!job) {
        await this.deps.db.query("COMMIT");
        return null;
      }
      const runId = randomUUID();
      await this.deps.db.query(
        `INSERT INTO marketing_competitor_collection_runs (id, job_id)
         VALUES ($1, $2)`,
        [runId, job.id],
      );
      await this.deps.db.query(
        `UPDATE marketing_competitor_collection_jobs
         SET last_run_at = now(), next_run_at = now() + make_interval(mins => interval_minutes), updated_at = now()
         WHERE id = $1`,
        [job.id],
      );
      await this.deps.db.query("COMMIT");
      return { ...job, run_id: runId, status: "queued", started_at: null };
    } catch (error) {
      await this.deps.db.query("ROLLBACK");
      throw error;
    }
  }

  private async startCollection(run: CollectionRun): Promise<MarketingCompetitorCollectionWorkerResult> {
    const crawler = new MediaCrawlerClient(run.crawler_base_url, this.deps.fetchImpl);
    await crawler.start({
      platform: "dy",
      crawler_type: run.collection_mode === "keyword" ? "search" : "creator",
      keywords: run.collection_mode === "keyword" ? run.query_text : "",
      creator_ids: run.collection_mode === "creator" ? run.query_text : "",
      enable_comments: run.include_comments,
      enable_sub_comments: false,
      save_option: "json",
      headless: false,
      max_notes_count: run.max_items,
      max_comments_count: run.include_comments ? 5 : 1,
    });
    await this.deps.db.query(
      `UPDATE marketing_competitor_collection_runs
       SET status = 'collecting', started_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'queued'`,
      [run.run_id],
    );
    return { runId: run.run_id, status: "collecting" };
  }

  private async collectResult(run: CollectionRun): Promise<MarketingCompetitorCollectionWorkerResult> {
    const crawler = new MediaCrawlerClient(run.crawler_base_url, this.deps.fetchImpl);
    const status = await crawler.status();
    if (status === "running" || status === "stopping") return { runId: run.run_id, status: "collecting" };
    if (status === "error") throw codedError("marketing_competitor_crawler_failed");
    const files = await crawler.files();
    const file = newestCrawlerFile(files, run.started_at);
    if (!file) throw codedError("marketing_competitor_crawler_output_missing");
    const records = compactCrawlerRecords(await crawler.fileContent(file.path), run.max_items);
    if (!records.length) throw codedError("marketing_competitor_crawler_no_content");
    const commentFile = run.include_comments ? newestCrawlerCommentFile(files, run.started_at) : null;
    const commentTexts = commentFile
      ? crawlerCommentTexts(await crawler.fileContent(commentFile.path, 2_500))
      : [];
    const profile = buildResearchProfile(records, run.query_text, commentTexts);
    await this.deps.db.query(
      `UPDATE marketing_competitor_collection_runs
       SET status = 'analyzing', crawler_file_path = $2, raw_payload_json = $3::jsonb,
           research_profile_json = $4::jsonb, updated_at = now()
       WHERE id = $1 AND status = 'collecting'`,
      [run.run_id, file.path, JSON.stringify(records), JSON.stringify(profile)],
    );
    return { runId: run.run_id, status: "analyzing" };
  }

  private async createPromptPackage(run: CollectionRun): Promise<MarketingCompetitorCollectionWorkerResult> {
    const payload = await this.deps.db.query<{ raw_payload_json: Json | string; research_profile_json: Json | string | null }>(
      "SELECT raw_payload_json, research_profile_json FROM marketing_competitor_collection_runs WHERE id = $1 AND status = 'analyzing'",
      [run.run_id],
    );
    const records = recordArray(payload.rows[0]?.raw_payload_json);
    if (!records.length) throw codedError("marketing_competitor_crawler_no_content");
    const profile = objectValue(payload.rows[0]?.research_profile_json);
    const researchProfile = Object.keys(profile).length ? profile : buildResearchProfile(records, run.query_text);
    const promptPackage = await buildPromptPackage({ db: this.deps.db, run, profile: researchProfile });
    await this.deps.db.query(
      `UPDATE marketing_competitor_collection_runs
       SET status = 'succeeded', research_profile_json = $2::jsonb, prompt_package_json = $3::jsonb,
           finished_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'analyzing'`,
      [run.run_id, JSON.stringify(researchProfile), JSON.stringify(promptPackage)],
    );
    return { runId: run.run_id, status: "succeeded" };
  }
}

class MediaCrawlerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl = fetch) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw codedError("marketing_competitor_crawler_url_invalid");
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  async start(payload: Record<string, unknown>) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/crawler/start`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw codedError(response.status === 400 ? "marketing_competitor_crawler_busy" : "marketing_competitor_crawler_start_failed");
  }

  async status() {
    const response = await this.fetchImpl(`${this.baseUrl}/api/crawler/status`);
    if (!response.ok) throw codedError("marketing_competitor_crawler_status_failed");
    const body = objectValue(await response.json());
    const status = text(body.status);
    return ["idle", "running", "stopping", "error"].includes(status) ? status : "error";
  }

  async files() {
    const response = await this.fetchImpl(`${this.baseUrl}/api/data/files?platform=${MEDIA_CRAWLER_DOUYIN_DATA_PLATFORM}&file_type=json`);
    if (!response.ok) throw codedError("marketing_competitor_crawler_files_failed");
    return recordArray(objectValue(await response.json()).files).map((file) => ({
      path: text(file.path), modified_at: typeof file.modified_at === "number" || typeof file.modified_at === "string" ? file.modified_at : 0,
      type: text(file.type),
    })).filter((file) => file.path && file.type === "json") satisfies CrawlerFile[];
  }

  async fileContent(path: string, limit = 100) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.fetchImpl(`${this.baseUrl}/api/data/files/${encodedPath}?preview=true&limit=${Math.max(1, Math.min(2_500, limit))}`);
    if (!response.ok) throw codedError("marketing_competitor_crawler_content_failed");
    return recordArray(objectValue(await response.json()).data);
  }
}

async function buildPromptPackage(input: { db: SqlDatabase; run: CollectionRun; profile: Record<string, unknown> }) {
  const planner = await createAutomaticMarketingTextPlanner({ db: input.db, env: process.env });
  const profileText = JSON.stringify(input.profile);
  if (planner) {
    try {
      const result = await planner.execute({
        runId: input.run.run_id,
        campaignId: input.run.campaign_id ?? input.run.project_id,
        createdByAdminId: input.run.created_by_admin_id,
        stage: "strategy",
        dataClassification: "internal",
        input: {
          direction: `围绕“${input.run.query_text}”制作原创抖音内容，只借鉴下述竞品研究中的结构模式，不得复述、改写或模仿任何竞品标题、文案、人物、画面、品牌或镜头顺序。`,
          platform: "douyin",
          contentType: "video",
          knowledge: [{ id: "competitor-structure-profile", summary: profileText }],
        },
        systemRules: [
          "You are producing an original personal-creator prompt package from an aggregated competitor structure profile.",
          "Do not copy competitor titles, wording, characters, visual identities, brands, or shot sequence. Use only abstract patterns, topic terms, and aggregate engagement signals.",
          "Return output.title, output.copy, output.hook, output.coverPrompt, output.imagePrompts, output.storyboard, and output.videoPrompts as JSON values.",
          "output.coverPrompt must be a pure-image prompt. output.imagePrompts must be an array of 3-6 pure-image prompts. output.storyboard must be an array of 3-6 objects with durationSeconds, subject, action, environment, camera, transition. output.videoPrompts must be an array matching storyboard order.",
          "All image and video prompts must avoid readable text, logos, trademarks, watermarks, QR codes, and copied visual identities.",
        ],
      });
      return normalizePromptPackage(result.output, input.profile);
    } catch {
      // The deterministic package keeps collection useful when the text model is temporarily unavailable.
    }
  }
  return fallbackPromptPackage(input.profile);
}

function compactCrawlerRecords(records: Array<Record<string, unknown>>, maxItems: number) {
  return records.slice(0, maxItems).map((record) => {
    const allowed = ["note_id", "aweme_id", "title", "desc", "content", "type", "create_time", "liked_count", "comment_count", "share_count", "collect_count", "comments"];
    return Object.fromEntries(allowed.flatMap((key) => record[key] === undefined ? [] : [[key, compactValue(record[key])]])) as Record<string, unknown>;
  });
}

function compactValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 20).map(compactValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [key, compactValue(item)]));
  return value;
}

function buildResearchProfile(records: Array<Record<string, unknown>>, query: string, comments: string[] = []) {
  const texts = records.flatMap((record) => [text(record.title), text(record.desc), text(record.content)]).filter(Boolean);
  const engagement = records.map((record) => ({
    likes: numeric(record.liked_count), comments: numeric(record.comment_count), shares: numeric(record.share_count), saves: numeric(record.collect_count),
  }));
  const total = engagement.reduce((sum, item) => sum + item.likes + item.comments + item.shares + item.saves, 0);
  return {
    query,
    sampledContentCount: records.length,
    recurringTopicTerms: topTerms(texts.join(" "), 12),
    titleLengthRange: titleLengthRange(records),
    engagementSignals: {
      averageTotal: records.length ? Math.round(total / records.length) : 0,
      highCommentRate: engagement.filter((item) => item.comments >= 20).length,
      highSaveOrShareRate: engagement.filter((item) => item.saves + item.shares >= 20).length,
    },
    commentSignals: {
      sampledCommentCount: comments.length,
      recurringTerms: topTerms(comments.join(" "), 12),
      questionCount: comments.filter((comment) => /[?？]/.test(comment)).length,
      requestOrExpectationCount: comments.filter((comment) => /(想看|求|更新|什么时候|有没有|怎么|教程|全集|下一集|继续)/.test(comment)).length,
    },
    reusablePatterns: [
      "Use a concrete outcome or problem in the opening, then reveal one visible process or result.",
      "Let each shot introduce new information or action; avoid decorative repetition.",
      "Use comments as unmet-question signals, not as wording to copy.",
    ],
    originalityConstraints: ["no source wording", "no source visual identity", "no source shot order", "no logos or readable text in generated media"],
  };
}

function normalizePromptPackage(value: unknown, profile: Record<string, unknown>) {
  const output = objectValue(value);
  const fallback = fallbackPromptPackage(profile);
  const storyboard = Array.isArray(output.storyboard) ? output.storyboard.map(objectValue).filter((shot) => Object.keys(shot).length).slice(0, 6) : fallback.storyboard;
  const videoPrompts = stringArray(output.videoPrompts).slice(0, 6);
  return {
    title: text(output.title) || fallback.title,
    copy: text(output.copy) || fallback.copy,
    hook: text(output.hook) || fallback.hook,
    coverPrompt: text(output.coverPrompt) || fallback.coverPrompt,
    imagePrompts: stringArray(output.imagePrompts).slice(0, 6).length ? stringArray(output.imagePrompts).slice(0, 6) : fallback.imagePrompts,
    storyboard,
    videoPrompts: videoPrompts.length ? videoPrompts : fallback.videoPrompts,
    researchProfile: profile,
  };
}

function fallbackPromptPackage(profile: Record<string, unknown>) {
  const topic = stringArray(profile.recurringTopicTerms).slice(0, 3).join("、") || text(profile.query) || "目标主题";
  const hook = `用一个具体问题开场，马上展示与${topic}相关的可见结果。`;
  const storyboard = [
    { durationSeconds: 3, subject: "创作者", action: "提出具体问题并指向准备解决的对象", environment: "明亮真实的工作台", camera: "近景快速推进", transition: "硬切" },
    { durationSeconds: 5, subject: "创作者与核心素材", action: "展示一个连续、可验证的操作步骤", environment: "同一工作台和光线", camera: "中近景跟拍", transition: "动作匹配切换" },
    { durationSeconds: 4, subject: "完成结果", action: "展示结果细节和实际使用情境", environment: "同一环境", camera: "结果特写后拉远", transition: "自然收束" },
  ];
  return {
    title: `${topic}：先把问题讲清楚再展示结果`,
    copy: `围绕${topic}做原创内容：先说清一个真实问题，再用连续的画面展示解决过程和结果。不要复刻竞品文案或镜头。`,
    hook,
    coverPrompt: `竖版抖音封面，创作者在明亮工作台前展示与${topic}相关的真实成果，主体清晰，留白干净，近景构图，自然光，真实摄影质感，无文字、无数字、无Logo、无水印`,
    imagePrompts: [
      `竖版配图，${topic}的真实使用前情境，主体明确，自然光，真实摄影，无文字无Logo`,
      `竖版配图，创作者正在完成与${topic}相关的一个具体动作，手部自然，真实场景，无文字无Logo`,
      `竖版配图，${topic}的完成结果在真实使用环境中被展示，清晰构图，无文字无Logo`,
    ],
    storyboard,
    videoPrompts: storyboard.map((shot, index) => `镜头${index + 1}：${shot.subject}，${shot.action}。环境：${shot.environment}。运镜：${shot.camera}。转场：${shot.transition}。连续真实动作，稳定光线，纯画面，无可读文字、数字、Logo、水印或二维码。`),
    researchProfile: profile,
  };
}

function newestCrawlerFile(files: CrawlerFile[], startedAt: Date | null) {
  const startMs = startedAt?.getTime() ?? 0;
  return files
    .filter((file) => /(?:^|[\\/])(?:search|creator)_contents_/i.test(file.path))
    .filter((file) => modifiedAtMs(file.modified_at) >= startMs - 5_000)
    .sort((left, right) => modifiedAtMs(right.modified_at) - modifiedAtMs(left.modified_at))[0] ?? null;
}

function newestCrawlerCommentFile(files: CrawlerFile[], startedAt: Date | null) {
  const startMs = startedAt?.getTime() ?? 0;
  return files
    .filter((file) => /(?:^|[\\/])(?:search|creator)_comments_/i.test(file.path))
    .filter((file) => modifiedAtMs(file.modified_at) >= startMs - 5_000)
    .sort((left, right) => modifiedAtMs(right.modified_at) - modifiedAtMs(left.modified_at))[0] ?? null;
}

function crawlerCommentTexts(records: Array<Record<string, unknown>>) {
  return records.map((record) => text(record.content)).filter(Boolean).slice(0, 2_500);
}

function modifiedAtMs(value: number | string) {
  const raw = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(raw)) return 0;
  return raw < 10_000_000_000 ? raw * 1_000 : raw;
}

function topTerms(value: string, limit: number) {
  const counts = new Map<string, number>();
  for (const term of value.toLowerCase().match(/[a-z0-9]+(?:[._-][a-z0-9]+)*|[\p{Script=Han}]{2,6}/gu) ?? []) {
    if (term.length < 2) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit).map(([term]) => term);
}

function titleLengthRange(records: Array<Record<string, unknown>>) {
  const lengths = records.map((record) => text(record.title).length).filter(Boolean);
  return lengths.length ? { min: Math.min(...lengths), max: Math.max(...lengths), average: Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) } : { min: 0, max: 0, average: 0 };
}

function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }
function objectValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function recordArray(value: unknown) { return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length) : []; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function codedError(code: string) { const error = new Error(code); error.name = code; return error; }
function errorCode(error: unknown) { return error instanceof Error && error.name ? error.name.slice(0, 160) : "marketing_competitor_collection_failed"; }

export const __marketingCompetitorCollectionTestUtils = {
  buildResearchProfile, compactCrawlerRecords, fallbackPromptPackage, newestCrawlerFile, newestCrawlerCommentFile, normalizePromptPackage,
  crawlerCommentTexts,
  crawlerDataPlatform: MEDIA_CRAWLER_DOUYIN_DATA_PLATFORM,
};
