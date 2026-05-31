# Local Object Storage Ideal Shape Design

> Date: 2026-05-25  
> Owner posture: INTJ / 长期主义 / Framework Architect  
> Status: Draft for engineering research  
> Scope: 本地对象存储 mock 的理想形态、职责边界、接口约束、开源项目筛选标准  
> Out of scope: 直接选定具体开源项目、接入腾讯云 COS / 阿里云 OSS、实现代码

## 1. 背景和目标

当前项目已经有 `StorageAdapter`，但它只覆盖“生成读签名 URL”这一小段能力。本地运行时使用 `CreatorDevStorageAdapter` 生成假 URL，`public_base_url` 模式也只是拼接 CDN 风格 URL。它还不能支撑真实小说文件、图片素材、视频素材上传，也不能用来验证浏览器直传、对象元数据、校验和、租户隔离、对象生命周期和未来云厂商迁移。

本设计要回答一个问题：

> 我们应该找一个什么样的开源本地对象存储，才能让本地测试真实，又让后续接腾讯云 COS 和阿里云 OSS 时不被动？

推荐目标不是“找一个最像阿里云或腾讯云的模拟器”，而是建立一个稳定的 **Storage Port + S3-compatible Local Service**。业务代码只依赖我们的 Storage Port；本地和云上只是不同 adapter。这样本地服务验证的是上传/下载/签名/metadata/权限这些核心行为，而不是某个厂商的偶然细节。

## 2. 当前项目约束

### 2.1 已有事实

- `storage_objects` 表已经保存 `organization_id`、`workspace_id`、`project_id`、`bucket`、`object_key`、`content_type`、`size_bytes`、`checksum`、`metadata_json`。
- `createScopedStorageObject` 已经会生成带组织、工作区、项目和对象 ID 的服务端 object key，避免用户传入任意路径。
- `createSignedReadUrl` 已经在签名 URL 前做 actor / tenant 校验。
- `asset_versions` 当前只保存 `storage_object_key`，没有强引用 `storage_objects.id`。
- 资产导入路径现在允许 `storageObjectKey` 或 `data:` preview 直接进入 asset version，这只是 Local Alpha 过渡态，不是长期形态。
- 导出路径已经更接近长期形态：`export_records.storage_object_id` 指向 `storage_objects`。

### 2.2 业务场景

P0 和近期本地闭环至少需要这些对象类型：

| 对象类型 | 来源 | 典型大小 | 是否用户上传 | 是否生成输出 | 备注 |
| --- | --- | ---: | --- | --- | --- |
| 原始小说/剧本文档 | 用户上传 | KB-MB | Yes | No | `.txt` / `.docx` 优先，`.pdf` 后置 |
| 角色参考图 | 用户上传或 AI 生成 | MB | Yes | Yes | 进入公共资产库 |
| 场景参考图 | 用户上传或 AI 生成 | MB | Yes | Yes | 进入公共资产库 |
| 道具参考图 | 用户上传或 AI 生成 | MB | Yes | Yes | 进入公共资产库 |
| 分镜图 | 模型生成 | MB | No | Yes | immutable asset version |
| 分镜视频 | 模型生成 | MB-GB | No | Yes | 需要 multipart 能力 |
| 导出素材包 | 系统打包 | MB-GB | No | Yes | 需要读签名 URL |

### 2.3 架构不变量

- PostgreSQL 是对象业务事实的真相源；对象存储只是 binary blob store。
- 对象 key 必须由服务端生成；前端不能决定最终 object key。
- 对象默认私有；读写都必须先经过后端鉴权，后端再发短 TTL 签名 URL。
- 资产版本不可变；重传、重生成、转码都创建新对象和新版本，不覆盖旧对象。
- Storage 模块不能理解“角色 / 场景 / 分镜”的业务含义；业务含义属于 Asset / Project / Workflow 模块。

## 3. 推荐方案

### 3.1 方案 A：S3-compatible local service + our Storage Port（推荐）

本地运行一个开源 S3-compatible 对象存储服务。后端实现一个 `S3CompatibleStorageAdapter`，通过 endpoint / bucket / region / credentials / path-style 配置连接本地服务。未来 Tencent COS 和 Aliyun OSS 通过同一个 Port 接入，必要时加 provider preset 或 provider-specific adapter。

优点：

- 本地能验证真实 HTTP 上传、下载、签名、CORS、metadata、ETag、multipart。
- S3 API 是事实上的对象存储通用接口，开源项目选择多。
- 腾讯云 COS 和阿里云 OSS 都提供 S3-compatible 方向的能力，迁移路径更短。
- 业务代码不绑定 AWS / 腾讯 / 阿里 SDK 的私有对象模型。

缺点：

- 需要多做一层 Storage Port 设计，不能只靠现有 `createSignedReadUrl`。
- S3-compatible 不等于完全一致，仍要通过 adapter 屏蔽 path-style、endpoint、签名、ETag、错误码差异。

### 3.2 方案 B：纯本地文件系统 mock

后端把文件写到 `.tmp/storage` 或 `artifacts/storage`，读 URL 通过 dev server 静态路由返回。

优点：

- 最快实现。
- 依赖少，CI 也简单。

缺点：

- 无法验证浏览器直传、签名 URL、CORS、multipart、真实对象 metadata。
- 后续接 COS / OSS 时会暴露大量晚期差异。
- 很容易把本地路径、文件系统语义泄漏到业务代码。

结论：只适合作为单元测试 fake，不适合作为 Local Runnable Alpha 的对象存储 mock。

### 3.3 方案 C：直接分别接 Tencent COS 和 Aliyun OSS SDK，本地写 fake adapter

从一开始就写 `TencentCosStorageAdapter` 和 `AliyunOssStorageAdapter`，本地用 fake adapter。

优点：

- 云厂商上线时可以利用 SDK 私有能力。
- 如果商业部署明确只用其中一家云，短期会直接。

缺点：

- 本地 fake 很难模拟真实差异，测试价值低。
- 业务容易被厂商 SDK 返回结构污染。
- 两家云的重复适配成本会提前压到当前阶段。

结论：不推荐作为第一阶段主方案。可以在 S3-compatible adapter 成熟后，再加厂商 preset 或专用 adapter。

## 4. 理想职责边界

### 4.1 StorageService 负责什么

StorageService 是平台内部的对象存储边界，负责：

- 生成服务端 object key。
- 创建上传会话。
- 生成短 TTL 上传 URL / 下载 URL。
- 校验 actor、organization、workspace、project scope。
- 记录对象元数据：bucket、key、content type、size、checksum、metadata。
- 完成上传后通过 adapter 做 `HEAD` 校验，并把对象状态标记为可用。
- 提供 server-side put / copy / delete / abort multipart 等对象操作的统一入口。
- 把底层错误映射成稳定错误码。

### 4.2 StorageAdapter 负责什么

StorageAdapter 是云 / 本地服务适配器，负责：

- 对接具体对象存储 API。
- 生成 provider-specific signed URL。
- 执行 `HEAD`、`PUT`、`COPY`、`DELETE`、multipart API。
- 规范化 provider 错误。
- 返回 provider ETag、version id、checksum、content length、content type。

Adapter 不负责：

- 判断用户有没有权限。
- 判断对象是否是角色、剧本或分镜。
- 创建 asset version。
- 记录业务审计。
- 决定对象 key 的租户路径。

### 4.3 Asset / Project / Workflow 负责什么

业务模块负责：

- 决定文件属于哪个业务对象。
- 决定是否创建 asset / asset version。
- 决定上传完成后推进项目状态。
- 决定生成任务输出如何写入 asset version。
- 决定导出包是否 ready。

它们只拿 `storageObjectId`、`objectKey`、`contentType`、`metadata`，不直接调用对象存储 SDK。

## 5. 核心模型

### 5.1 StorageObject

`storage_objects` 应继续作为对象事实表，但建议补齐状态字段和 provider 字段：

```ts
type StorageObjectStatus =
  | "pending_upload"
  | "available"
  | "failed"
  | "deleted";

interface StorageObject {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  bucket: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number | null;
  checksum: string | null;
  status: StorageObjectStatus;
  provider: "local_s3" | "tencent_cos" | "aliyun_oss" | "s3_compatible";
  metadata: Record<string, unknown>;
}
```

### 5.2 UploadSession

本地上传和未来云上传都应该走上传会话，而不是让前端直接把 `storageObjectKey` 传进 asset API。

```ts
interface StorageUploadSession {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  storageObjectId: string;
  purpose:
    | "script_source"
    | "character_reference"
    | "scene_reference"
    | "prop_reference"
    | "library_image"
    | "library_video";
  status: "created" | "uploading" | "uploaded" | "aborted" | "expired";
  contentType: string;
  maxSizeBytes: number;
  expiresAt: Date;
  idempotencyKey: string;
}
```

### 5.3 AssetVersion 与 StorageObject 的关系

长期推荐让 `asset_versions` 引用 `storage_object_id`，`storage_object_key` 保留为 denormalized read field 或逐步废弃。

```ts
interface AssetVersion {
  id: string;
  assetId: string;
  storageObjectId: string;
  versionNumber: number;
  metadata: {
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    checksum?: string;
    sourceProviderRequestId?: string;
  };
}
```

这样 tenant auth、signed URL、lifecycle cleanup 都能从 `storage_objects` 统一走，不会散落在 asset version 的字符串 key 上。

## 6. Storage Port 接口约束

### 6.1 Application-facing API

```ts
interface StorageService {
  createUploadSession(input: {
    actor: ActorContext;
    scope: {
      organizationId: string;
      workspaceId?: string | null;
      projectId?: string | null;
    };
    purpose: StorageUploadSession["purpose"];
    fileName: string;
    contentType: string;
    sizeBytes?: number | null;
    checksum?: string | null;
    idempotencyKey: string;
    now: Date;
  }): Promise<{
    uploadSession: StorageUploadSession;
    storageObject: StorageObject;
    upload: {
      method: "PUT";
      url: string;
      headers: Record<string, string>;
      expiresAt: Date;
    };
  }>;

  completeUpload(input: {
    actor: ActorContext;
    uploadSessionId: string;
    providerETag?: string | null;
    checksum?: string | null;
    now: Date;
  }): Promise<StorageObject>;

  createSignedReadUrl(input: {
    actor: ActorContext;
    storageObjectId: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<{
    url: string;
    expiresAt: Date;
    object: StorageObject;
  }>;

  putObjectFromBuffer(input: {
    scope: TenantScope;
    objectName: string;
    contentType: string;
    body: Uint8Array;
    metadata?: Record<string, string>;
    now: Date;
  }): Promise<StorageObject>;

  copyObject(input: {
    sourceStorageObjectId: string;
    targetScope: TenantScope;
    targetObjectName: string;
    now: Date;
  }): Promise<StorageObject>;
}
```

### 6.2 Adapter-facing API

```ts
interface ObjectStorageAdapter {
  createPresignedPutUrl(input: {
    bucket: string;
    objectKey: string;
    contentType: string;
    expiresAt: Date;
    contentLength?: number | null;
    checksum?: string | null;
    metadata?: Record<string, string>;
  }): Promise<{
    url: string;
    headers: Record<string, string>;
    expiresAt: Date;
  }>;

  createPresignedGetUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
    responseContentDisposition?: string;
  }): Promise<{ url: string; expiresAt: Date }>;

  headObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<{
    exists: boolean;
    contentType?: string;
    contentLength?: number;
    eTag?: string;
    checksum?: string | null;
    metadata?: Record<string, string>;
  }>;

  putObject(input: {
    bucket: string;
    objectKey: string;
    contentType: string;
    body: Uint8Array | ReadableStream;
    metadata?: Record<string, string>;
  }): Promise<{ eTag?: string; checksum?: string | null }>;

  deleteObject(input: {
    bucket: string;
    objectKey: string;
  }): Promise<void>;
}
```

Multipart 可以作为第二层能力暴露：

```ts
interface MultipartStorageAdapter {
  createMultipartUpload(...): Promise<{ uploadId: string }>;
  createPresignedUploadPartUrl(...): Promise<{ url: string; headers: Record<string, string> }>;
  completeMultipartUpload(...): Promise<{ eTag?: string }>;
  abortMultipartUpload(...): Promise<void>;
}
```

P0 本地图片上传可以先用 single PUT；视频和导出包必须预留 multipart。

## 7. 上传主流程

### 7.1 用户上传小说 / 图片素材

```text
Browser
  -> POST /api/storage/upload-sessions
      body: purpose, fileName, contentType, sizeBytes, checksum
      header: Idempotency-Key
  <- uploadSession + storageObjectId + presigned PUT URL

Browser
  -> PUT presigned URL directly to local object storage

Browser
  -> POST /api/storage/upload-sessions/:id/complete
      body: etag/checksum

Backend
  -> adapter.headObject()
  -> storage_objects.status = available
  -> Asset/Script command creates asset_version or script source reference
```

关键点：

- 后端先创建 `pending_upload` 对象记录，前端只拿短 TTL 上传 URL。
- complete 阶段必须由后端 `HEAD` 对象确认真实存在、大小和 content type 符合预期。
- 如果 complete 失败，业务对象不能进入 ready。
- 同一个 idempotency key + 同一个请求必须返回同一个 upload session。

### 7.2 模型生成图片 / 视频

```text
Worker
  -> provider returns output url or bytes
  -> StorageService.putObjectFromBuffer() or copyObjectFromProviderUrl()
  -> storage_objects.status = available
  -> asset_versions append immutable version
  -> shot current pointer moves only if task/revision still active
```

生成输出不应该走前端上传会话，但仍然必须落到同一套 `storage_objects` 和签名读取路径。

### 7.3 导出素材包

```text
Export worker
  -> build manifest/package
  -> StorageService.putObjectFromBuffer()
  -> export_records.storage_object_id = storageObject.id
  -> createSignedReadUrl for preview/download
```

## 8. 本地开源项目筛选标准

研发同学找开源项目时，优先按这个评分表判断，而不是只看 star 数。

| 维度 | 必须 / 加分 | 说明 |
| --- | --- | --- |
| S3-compatible API | 必须 | 至少支持 PUT / GET / HEAD / DELETE / presigned URL |
| Browser direct upload | 必须 | 支持 CORS，能从 `http://127.0.0.1:4310` 直传 |
| Presigned URL | 必须 | 支持短 TTL PUT 和 GET，headers 可控 |
| Metadata / Content-Type | 必须 | 能保存和读取 content type、metadata、size、ETag |
| Multipart upload | 强加分 | 视频和导出包需要，P0 可以延后但不能选无法演进的项目 |
| Docker / local binary | 必须 | 新研发一条命令启动；CI 可启动 ephemeral 服务 |
| Persistent local volume | 必须 | 手工 dogfood 刷新后文件仍在 |
| Reset 能力 | 必须 | 测试可清空 bucket / volume，避免污染 |
| Path-style / virtual-host style 可配置 | 强加分 | 本地常用 path-style，云上更偏 virtual-host style |
| S3 SDK 兼容 | 强加分 | 最好可用 AWS SDK v3 `S3Client` 通过 endpoint 接入 |
| 管理控制台 | 加分 | 方便本地调试对象是否存在 |
| License | 必须 | License 允许商业项目本地开发和 CI 使用 |
| 资源占用 | 加分 | 本地启动快，CPU/内存低 |

### 8.1 候选类型

后续调研可以优先看这些类型：

1. **MinIO 类 S3-compatible object storage**  
   最可能符合本地对象存储主需求。重点验证 license、browser CORS、presigned PUT/GET、multipart、AWS SDK v3 endpoint override。

2. **SeaweedFS 类轻量对象存储**  
   如果团队更看重轻量和文件量扩展，可以评估。但必须验证 S3 API 行为和 signed URL 支持是否足够稳定。

3. **LocalStack 类云服务模拟器**  
   如果未来需要同时 mock queue、SNS/SQS、Lambda 等 AWS 生态，可以评估。但对当前单一对象存储需求可能过重。

4. **纯文件系统 mock**  
   只能作为 adapter 单测 fake，不能作为 Local Runnable Alpha 的主 mock。

## 9. 腾讯云 COS / 阿里云 OSS 接入约束

### 9.1 共同策略

- 业务只依赖 Storage Port，不依赖 COS / OSS SDK 的返回结构。
- 第一优先实现 `S3CompatibleStorageAdapter`，通过配置 endpoint 接不同 provider。
- 如果 S3-compatible 子集不能满足生产要求，再加 `TencentCosStorageAdapter` 或 `AliyunOssStorageAdapter`，但外部接口不变。
- 不依赖 ACL、公有 bucket、厂商图片处理、厂商转码等私有能力。
- 不把 ETag 当作跨 provider 一致的 checksum；checksum 应由客户端或后端独立计算和保存。

### 9.2 Endpoint / style 差异

本地服务常用 path-style：

```text
http://127.0.0.1:9000/bucket/key
```

云厂商更偏 virtual-hosted style：

```text
https://bucket.provider-region.example.com/key
```

因此 adapter 配置必须支持：

```text
STORAGE_ENDPOINT
STORAGE_REGION
STORAGE_BUCKET
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
STORAGE_FORCE_PATH_STYLE=true|false
STORAGE_PROVIDER=local_s3|tencent_cos|aliyun_oss|s3_compatible
```

业务层不能解析 URL 判断 bucket / object key，只能使用 `bucket` 和 `objectKey` 字段。

## 10. 安全和 DX 要求

### 10.1 安全要求

- Bucket 默认私有。
- 上传 URL TTL 建议本地 10-15 分钟，生产更短。
- 下载 URL TTL 按用途控制，预览短、导出下载可稍长。
- 所有 object key 由后端生成，必须包含 tenant scope 和 object id。
- 上传前校验 content type allowlist、size limit、业务 purpose。
- complete 阶段必须 `HEAD` 校验。
- 原始小说文本和 prompt 不进入普通日志。
- 未来可以在 complete 后接入病毒扫描 / 内容安全扫描 hook。

### 10.2 DX 要求

本地对象存储必须能被一个新研发这样启动：

```bash
npm run dev:storage
npm run dev
npm run smoke:local
```

文档必须说明：

- 默认 endpoint、bucket、access key、secret key。
- 如何打开管理控制台。
- 如何清空本地 bucket。
- CORS 失败如何排查。
- presigned URL 过期如何排查。
- 如何切换到 Tencent COS / Aliyun OSS sandbox。

## 11. 推荐演进路线

### R0：冻结 Storage Port 和开源筛选标准

- 本文档作为研发同学找开源项目的输入。
- 不直接选型，不直接改业务代码。
- 输出候选项目评分表和推荐候选。

### R1：接入本地 S3-compatible 服务

- 新增 `dev:storage` 或 docker compose。
- 新增 `S3CompatibleStorageAdapter`。
- 新增 upload session API。
- 本地浏览器可上传小说 / 图片到对象存储。
- `smoke:local` 覆盖 create upload session -> PUT -> complete -> signed GET。

### R2：业务接入

- 脚本上传从 `scriptInput` 扩展为 `scriptSourceStorageObjectId`。
- 资产导入不再接受任意 `storageObjectKey`，改为引用 completed upload session / storage object。
- asset_versions 逐步迁移到 `storage_object_id`。

### R3：云厂商 sandbox 接入

- 用同一套 Storage Port 切到 Tencent COS sandbox。
- 用同一套 Storage Port 切到 Aliyun OSS sandbox。
- 记录 S3 compatibility 差异，只在 adapter 内解决。

## 12. 开源调研交付模板

研发同学调研每个候选项目时，建议输出：

```markdown
## Candidate: <name>

### Basic facts
- Repo:
- License:
- Local start command:
- Docker image:
- Admin console:

### Fit score
- S3-compatible API:
- Presigned PUT/GET:
- Browser CORS:
- Multipart:
- Metadata/HEAD:
- AWS SDK v3 endpoint override:
- Path-style / virtual-host style:
- Reset/CI:

### Integration spike
- Can create bucket:
- Can presign PUT:
- Browser PUT result:
- HEAD result:
- Presign GET result:
- Multipart result:

### Risks
- License:
- Compatibility gaps:
- Operational overhead:
- Migration risk to COS / OSS:

### Recommendation
- Adopt / Reject / Needs more spike
- Why:
```

## 13. Research references

- Tencent Cloud COS S3 compatibility docs: https://www.tencentcloud.com/document/product/436/34688
- Alibaba Cloud OSS S3 compatibility docs: https://www.alibabacloud.com/help/en/oss/developer-reference/s3-compatible-api
- AWS S3 presigned upload docs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- MinIO object storage docs: https://min.io/docs/minio/linux/index.html

## 14. Spec self-review

- No placeholder requirement remains. This document intentionally does not pick a final open-source project; that is the next research task.
- The recommended architecture is consistent with current project invariants: DB owns facts, storage owns blobs, Asset owns business meaning.
- The scope is a single implementation direction: local object storage mock and future cloud adapter boundary.
- Ambiguous terms are pinned down: local mock means an S3-compatible external service, not a fake URL generator or filesystem-only adapter.
