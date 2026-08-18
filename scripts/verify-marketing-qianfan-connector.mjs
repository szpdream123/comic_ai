import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

loadDotEnvFile(join(process.cwd(), ".env"));

const qianFanBackend = resolve(
  process.env.QIANFAN_SYNC_BACKEND_DIR?.trim() || "../QianFanSync/backend",
);
if (!existsSync(join(qianFanBackend, "ext_api", "comic_marketing_connector.py"))) {
  throw new Error("qianfan_sync_backend_not_found");
}
verifySharedContractFile("marketing-qianfan-v1.schema.json");
verifySharedContractFile("openapi.yaml");

const [{ createMigratedTestDb }, { createPhoneAuthDevServer }, { createMarketingService }] = await Promise.all([
  import("../apps/backend/src/modules/shared/db/test-db.ts"),
  import("../apps/backend/src/entrypoints/phone-auth-dev-server.ts"),
  import("../apps/backend/src/modules/marketing/application/marketing.service.ts"),
]);
const db = await createMigratedTestDb();
const assetBytes = Buffer.from("qianfan-marketing-interop-video");
const storageAdapter = {
  async copyObject() {},
  async createSignedReadUrl() {
    return { url: "https://cos.example.invalid/marketing-delivery/cross-repository/video.mp4" };
  },
};
const server = createPhoneAuthDevServer({
  db,
  storageRuntime: { adapter: storageAdapter },
  env: {
    MARKETING_QIANFAN_HMAC_KEYS_JSON: JSON.stringify({
      "cross-key": { workerId: "cross-worker", secret: "cross-secret" },
    }),
  },
});
const dataDir = await mkdtemp(join(tmpdir(), "qianfan-marketing-interop-"));

try {
  const fixture = await createPublishFixture({ db, createMarketingService, storageAdapter });
  await server.listen(0);
  const result = await runPythonConnector({
    backendDir: qianFanBackend,
    dataDir,
    origin: server.origin,
  });
  if (result !== "succeeded") {
    throw new Error(`qianfan_connector_unexpected_result:${result}`);
  }

  const executor = await db.query(
    `SELECT count(*)::int AS count
     FROM marketing_executors AS executor
     JOIN marketing_executor_keys AS key ON key.executor_id = executor.id
     WHERE executor.worker_id = 'cross-worker' AND key.key_id = 'cross-key'`,
  );
  if (executor.rows[0]?.count !== 1) {
    throw new Error("qianfan_executor_registration_missing");
  }
  const terminal = await db.query(
    `SELECT job.status AS job_status, content.status AS content_status,
            delivery.publish_url AS publish_url, delivery.platform_content_id AS platform_content_id
     FROM marketing_publish_jobs AS job
     JOIN marketing_content_variants AS content ON content.id = job.content_variant_id
     JOIN marketing_publish_deliveries AS delivery ON delivery.publish_job_id = job.id
     WHERE job.id = $1`,
    [fixture.publishJobId],
  );
  const row = terminal.rows[0];
  if (row?.job_status !== "succeeded" || row.content_status !== "published"
    || row.publish_url !== "https://www.douyin.com/video/cross-repository"
    || row.platform_content_id !== "cross-repository-content") {
    throw new Error(`qianfan_connector_terminal_callback_missing:${JSON.stringify(row ?? null)}`);
  }

  console.info("Marketing QianFanSync HTTP/HMAC interop verified (claim -> download -> ack -> callback).");
} finally {
  await server.close();
  await db.close();
  await rm(dataDir, { recursive: true, force: true });
}

async function runPythonConnector({ backendDir, dataDir, origin }) {
  const script = String.raw`
import json
import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace

from ext_api.comic_marketing_connector import ComicMarketingConnector, ConnectorConfig
from ext_api.task_queue import TaskStatus
import ext_api.comic_marketing_connector as connector_module

data_dir = Path(sys.argv[1])
db_path = data_dir / "database.db"
connection = sqlite3.connect(str(db_path))
try:
    connection.execute("CREATE TABLE user_info (id INTEGER, type INTEGER, filePath TEXT, userName TEXT, status INTEGER)")
    connection.execute("INSERT INTO user_info VALUES (7, 3, 'authorized-account.json', 'Authorized Account', 1)")
    connection.commit()
finally:
    connection.close()

class Queue:
    running = {}
    queue = None
    def __init__(self):
        self.callbacks = []
        self.tasks = []
    def on_status_change(self, callback):
        self.callbacks.append(callback)
    def add_task(self, task):
        self.tasks.append(task)

class DownloadResponse:
    status_code = 200
    def iter_content(self, chunk_size):
        yield b"qianfan-marketing-interop-video"

class Session:
    def __init__(self):
        import requests
        self.requests = requests.Session()
    def request(self, *args, **kwargs):
        return self.requests.request(*args, **kwargs)
    def get(self, url, **kwargs):
        if url != "https://cos.example.invalid/marketing-delivery/cross-repository/video.mp4":
            raise AssertionError("unexpected_signed_asset_url")
        return DownloadResponse()

# The test environment can have less than the production 30 GiB reserve. This
# supplies the production disk reserve while exercising a local temporary asset.
connector_module.shutil.disk_usage = lambda _path: SimpleNamespace(free=40 * 1024 ** 3)
config = ConnectorConfig(
    base_url=sys.argv[2], worker_id="cross-worker", key_id="cross-key",
    hmac_secret="cross-secret",
    capabilities={
        "workerVersion": "1.0.0",
        "platformCapabilities": [{"platform": "douyin", "supportsVideo": True, "supportsImagePost": True}],
    },
)
queue = Queue()
connector = ComicMarketingConnector(config, task_queue=queue, session=Session(), db_path=db_path)
if not connector.poll_once() or len(queue.tasks) != 1:
    raise AssertionError("delivery was not accepted")
task = queue.tasks[0]
task.status = TaskStatus.RUNNING
for callback in queue.callbacks:
    callback(task)
import time
time.sleep(0.2)
task.publish_result = {
    "status": "succeeded",
    "platformContentId": "cross-repository-content",
    "publishUrl": "https://www.douyin.com/video/cross-repository",
    "publishedAt": connector._occurred_at(),
    "failureCode": None,
    "failureMessage": None,
    "rawResultRef": None,
}
task.status = TaskStatus.SUCCESS
for callback in queue.callbacks:
    callback(task)
time.sleep(0.8)
print("CROSS_REPOSITORY_RESULT=succeeded")
`;
  const output = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.PYTHON ?? "python", ["-c", script, dataDir, origin], {
      cwd: backendDir,
      env: {
        ...process.env,
        PYTHONPATH: backendDir,
        SAU_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`qianfan_connector_probe_failed:${stderr.trim() || code}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
  const match = String(output).match(/CROSS_REPOSITORY_RESULT=(\w+)/);
  if (!match) throw new Error("qianfan_connector_probe_invalid_output");
  return match[1];
}

async function createPublishFixture({ db, createMarketingService, storageAdapter }) {
  const adminId = randomUUID();
  const userId = randomUUID();
  await db.query(
    "INSERT INTO users (id, phone_e164, display_name, password_hash, status, credit_balance_cached) VALUES ($1, '13800138000', 'Marketing Interop Owner', 'plain:000000', 'active', 0)",
    [userId],
  );
  await db.query(
    "INSERT INTO admin_accounts (id, login_name, password_hash, display_name, status, super_admin_slot) VALUES ($1, 'marketing_interop_admin', 'plain:password', 'Marketing Interop Admin', 'active', 1)",
    [adminId],
  );
  await db.query(
    "INSERT INTO admin_account_roles (id, admin_account_id, role_code) VALUES ($1, $2, 'super_admin')",
    [randomUUID(), adminId],
  );
  const storageObjectId = randomUUID();
  await db.query(
    `INSERT INTO storage_objects (
       id, project_id, bucket, object_key, content_type, size_bytes, checksum,
       provider, status, metadata_json, created_by_user_id, created_at
     ) VALUES ($1, NULL, 'interop', 'source/video.mp4', 'video/mp4', $2, $3,
       'creator-dev', 'available', '{}'::jsonb, $4, now())`,
    [storageObjectId, assetBytes.length, createHash("sha256").update(assetBytes).digest("hex"), userId],
  );
  const marketing = createMarketingService({ db, storageAdapter });
  const project = await marketing.createProject({
    ownerUserId: userId, sourceType: "manual", sourceNamespace: "manual", sourceRecordId: "interop-project",
    sourceSnapshot: { version: "v1" }, name: "Cross repository marketing", brandProfile: {},
  }, adminId);
  const source = await marketing.addSource(project.id, {
    sourceNamespace: "manual", sourceRecordId: "interop-facts", sourceVersion: "v1",
    sourceSnapshot: { title: "Authorized project facts" }, authorizationStatus: "owned",
  }, adminId);
  const document = await marketing.createKnowledgeDocument({
    projectId: project.id, sourceId: source.id, title: "Interop facts", documentType: "project_fact", version: "v1",
    authorizationStatus: "owned", content: "This approved fact supports the original demonstration content.",
    applicablePlatforms: ["douyin"], confidenceScore: 100,
  }, adminId);
  await marketing.approveKnowledgeDocument(document.id, adminId);
  const segment = await db.query("SELECT id FROM marketing_knowledge_segments WHERE document_id = $1 ORDER BY sequence_number LIMIT 1", [document.id]);
  const campaign = await marketing.createCampaign({ projectId: project.id, name: "Interop campaign", objective: "views" }, adminId);
  await marketing.savePlatformCapabilityProfile({ platform: "douyin", version: "interop-v1", capability: { video: true }, rules: {} }, adminId);
  const content = await marketing.createContentVariant({
    campaignId: campaign.id, platform: "douyin", contentType: "video", title: "Verified original content",
    body: { description: "A factual original content demonstration.", tags: [], disclosures: [] },
    assetManifest: [{ type: "video", storageObjectId, authorizationStatus: "owned" }],
    knowledgeSegmentIds: [segment.rows[0].id], trackingKey: `interop-${randomUUID()}`,
  }, adminId);
  await marketing.runComplianceCheck(content.id, adminId);
  await marketing.approveContentVariant(content.id, adminId);
  const publishJob = await marketing.createPublishJob({
    campaignId: campaign.id, contentVariantId: content.id, platform: "douyin", executorAccountRef: "qianfan:cross-worker:7",
    idempotencyKey: `interop-job-${randomUUID()}`, scheduledAt: new Date().toISOString(),
    assets: [{ type: "video", storageObjectId }],
  }, adminId);
  return { publishJobId: publishJob.id };
}

function verifySharedContractFile(fileName) {
  const comicFile = resolve("packages/contracts/marketing-qianfan/v1", fileName);
  const qianFanFile = join(qianFanBackend, "ext_api", "contracts", fileName);
  if (!existsSync(comicFile) || !existsSync(qianFanFile)) {
    throw new Error(`marketing_contract_file_missing:${fileName}`);
  }
  const comicHash = createHash("sha256").update(readFileSync(comicFile)).digest("hex");
  const qianFanHash = createHash("sha256").update(readFileSync(qianFanFile)).digest("hex");
  if (comicHash !== qianFanHash) {
    throw new Error(`marketing_contract_drift:${fileName}`);
  }
}

function loadDotEnvFile(envFilePath) {
  if (!existsSync(envFilePath)) return;
  for (const rawLine of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
