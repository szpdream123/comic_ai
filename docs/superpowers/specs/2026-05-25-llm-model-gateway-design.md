# LLM Model Gateway Design

> Date: 2026-05-25  
> Owner posture: INTJ / 长期主义 / Framework Architect  
> Status: Design baseline for engineering research and future service extraction  
> Scope: LLM 文本 / 多模态推理网关的职责边界、接口约束、token 用量模型、开源筛选标准  
> Out of scope: 直接选定唯一开源项目、实现真实 provider、支付、对象存储、完整公开开发者平台

## 1. 背景和目标

当前项目已经有 `ModelGateway` 的雏形：`provider_requests` 会在外部 provider 调用前落库，`ProviderAdapter.submit` 负责提交外部请求，已有 dev / HTTP / OpenAI Images adapter，并且已经通过测试保护“外部提交开始后不能盲重试”。

但它现在还不是一个完整的 LLM 网关。它缺少 LLM 所需的模型目录、统一请求 envelope、provider 路由、流式响应、token 用量归一化、provider 成本事实、OpenAI-compatible 对外接口和未来 API key / rate limit / quota 边界。

本设计回答一个问题：

> 我们需要什么样的 LLM 模型网关，才能先服务当前剧本 / 创作链路，又能在未来拆成独立 API 服务，对外暴露类似 OpenRouter 的完整大模型网关能力？

推荐方向：

**Internal LLM Gateway Core + OpenAI-compatible Edge + Provider Adapters**。

也就是：先在当前 modular monolith 中实现一个边界清晰的 LLM Gateway Core；内部业务只调用我们的 gateway contract；provider 差异被 adapter 吸收；token / cost / request facts 由 gateway 归一化落库；未来把同一套 core 单独部署为 API 服务，对外提供 OpenAI-compatible 路由、模型列表、用量查询和开发者 key。

## 2. 设计原则

### 2.1 业务不碰 provider SDK

Project、Workflow、Script、Shot、Asset 等业务模块不能 import OpenAI、Anthropic、Gemini、DashScope、DeepSeek、OpenRouter 或任何 provider SDK。

业务模块只表达业务意图：

```text
parse script
summarize character
generate storyboard prompt
rewrite shot description
classify unsafe content
```

Gateway 决定用哪个 provider、哪个 model、如何计算 token、如何记录成本、如何做 fallback。

### 2.2 Gateway 记录事实，不决定业务价格

LLM Gateway 可以记录：

- provider request / attempt。
- provider 原始 usage。
- 归一化 token usage。
- provider 原始成本和换算成本。
- provider 错误、延迟、fallback、routing decision。

LLM Gateway 不直接决定：

- 创作者扣多少积分。
- 哪个套餐能用哪个商业能力。
- 任务是否业务成功。
- 资产版本是否可用。

这些属于 `Credit/Billing`、`Workflow/Task`、`Asset`、`Quality/Review`。

### 2.3 Provider-reported usage 优先，gateway estimate 只做前置预算

token 计量必须分两层：

1. **Preflight estimate**：调用前估算，用于 context window、预算、quota、限流、用户提示。
2. **Reported usage**：provider 返回的真实 usage，用于最终 provider cost fact、对账和用户侧结算依据。

如果 provider 没有返回 usage，gateway 可以记录 estimated usage，但必须标记 `usageSource = "estimated"`，不能伪装成真实账单事实。

### 2.4 每一次外部 side effect 都必须有 durable attempt

当前 `provider_requests` 的不变量继续保留：

- 外部调用前先创建本地 provider request。
- 标记 `external_submission_started_at` 后不能盲重试。
- worker crash / timeout 后进入 lookup、reconciliation 或 manual review。
- fallback 到另一个 provider 是新的 attempt，不是覆盖旧 attempt。

### 2.5 OpenAI-compatible 是对外协议，不是内部领域模型

OpenAI-compatible API 是生态事实，应该作为外部 API 和一类 adapter 的协议。

但内部模型不能完全等同 OpenAI Chat Completions，因为 Anthropic Messages、Gemini GenerateContent、DashScope native、reasoning token、cache token、image/audio/video token、tool-use token 都有差异。内部要有稳定的 normalized envelope。

## 3. 当前项目映射

### 3.1 已有事实

| 当前事实 | 位置 | 对 LLM Gateway 的意义 |
| --- | --- | --- |
| `provider_requests` | `packages/db/migrations/0001_foundation.sql` | 可作为 provider attempt journal；已具备 request key、payload hash、status、external start、external id、redacted payload/response |
| `ProviderAdapter.submit` | `apps/backend/src/modules/model-gateway/provider-adapter.contract.ts` | 当前是通用 submit 形态，后续需要 LLM-specific adapter contract |
| `submitProviderRequest` | `apps/backend/src/modules/model-gateway/provider-request.service.ts` | 已实现 create-or-reuse、pre-call persistence、no blind retry 基础安全 |
| `operationNames` | `packages/contracts/domain/operation-names.ts` | 现有 `script.parse`、`shot.image.generate` 等 operation 可映射到 gateway operation |
| `credit_reservation_allocations.provider_request_id` | foundation schema | 可把用户侧积分 settlement 和 provider attempt 串起来 |
| `Credit/Billing` | 架构文档 | 拥有 credit ledger / provider cost ledger，不执行 provider HTTP calls |
| `Admin/Ops` | 架构文档 | 负责 result_unknown、manual_review、成本异常和 provider health 操作视图 |

### 3.2 当前缺口

| 缺口 | 为什么重要 | 推荐补齐方式 |
| --- | --- | --- |
| LLM request parent | 一个用户请求可能有多个 provider attempt / fallback | 新增 `llm_gateway_requests` 或在 service 层先建 parent concept |
| 模型目录 | 不能让业务硬编码 provider model id | 新增 `llm_model_catalog` 配置 / 表 |
| usage ledger | token 和成本需要 append-only fact | 新增 `llm_usage_records` / `provider_cost_entries` |
| token estimator | 调用前预算和 context 保护 | adapter 提供 `estimateTokens`，catalog 指定 tokenizer kind |
| streaming support | LLM 对话和创作体验需要 SSE | gateway 负责流式 chunk 归一化和最终 usage closure |
| routing policy | 成本、质量、区域、延迟、fallback 都需要策略 | `RoutingPolicy` + provider health + model capabilities |
| public API keys | 未来对外服务需要租户 / key / quota | 非 P0，但 contract 预留 |

## 4. 方案比较

### 4.1 方案 A：Internal Gateway Core + OpenAI-compatible Edge + Provider Adapters（推荐）

在当前后端中实现 LLM Gateway Core。对内暴露 TypeScript contract；对外预留 OpenAI-compatible HTTP edge。provider 通过 adapter registry 接入。

优点：

- 最贴合当前 `provider_requests` 和任务 / 积分 / 资产边界。
- 当前业务可以最快获得可控的 LLM 能力。
- 后续可拆成独立 API 服务，核心模型不用推倒重来。
- 能接入开源 gateway 的优势，但不会被开源项目的用户体系 / 账本 / UI 绑架。

缺点：

- 需要我们自己定义 normalized usage、routing、catalog 的最小内核。
- 短期没有成熟开源网关开箱即用的 dashboard。

适用判断：

- 我们要做的是“创作平台内生的模型能力 + 未来可外部化”，不是今天就卖一个通用 API 中转站。

### 4.2 方案 B：直接把 LiteLLM / Portkey / Helicone / One API 作为独立服务接入

把开源 AI gateway 当作旁路服务，业务请求先发到它，再由它路由到各 provider。

优点：

- 上手快，provider 覆盖广。
- 许多项目已有 OpenAI-compatible API、fallback、budget、dashboard、observability。
- 适合快速做 provider matrix 和 benchmark。

缺点：

- 容易让开源项目接管 API key、用量、账本、路由策略，和我们自己的 `provider_requests` / credit ledger 冲突。
- 很多 gateway 的 usage / cost 语义是给“API 中转站”设计的，不一定符合我们的创作工作流、任务恢复和积分结算。
- 对 provider side effect 的 pre-call persistence、no-blind-retry 可能无法满足我们当前架构不变量。

适用判断：

- 可以作为研究对象、短期本地 simulator、adapter backend 或 benchmark harness；不建议直接成为业务真相源。

### 4.3 方案 C：业务模块直接用各家 SDK

每个业务能力自己接 OpenAI、Anthropic、Gemini、Qwen、DeepSeek 等 SDK。

优点：

- 单点 demo 最快。
- 初期少写一层 gateway。

缺点：

- SDK 和 provider payload 会污染业务模块。
- token usage、错误、成本、fallback、限流到处散落。
- 后续拆独立 API 服务几乎等于重写。
- 很难保证 provider 请求的幂等、恢复和对账。

结论：拒绝。它解决的是今天的 demo，不是长期的开发者问题。

## 5. 职责边界

### 5.1 Project / Creator Domain

负责：

- 剧本、项目、角色、分镜、资产的业务状态。
- 决定什么时候需要一次 LLM 能力。
- 构造业务级输入快照。
- 使用 gateway 返回的结果更新业务事实。

不负责：

- provider model id。
- provider SDK。
- token 计量。
- provider key。
- fallback。
- provider HTTP 错误解释。

### 5.2 Workflow / Task

负责：

- 长任务创建、claim、attempt、lease、finalize。
- 任务级幂等。
- 任务状态聚合。
- 对 `result_unknown` / `manual_review_required` 的执行态承接。

不负责：

- provider-specific status query。
- provider usage parsing。
- provider cost calculation。

### 5.3 LLM ModelGateway

负责：

- LLM model catalog。
- provider adapter registry。
- request normalization。
- routing / fallback policy。
- provider request parent / attempt journal。
- preflight token estimate。
- provider-reported usage parsing。
- normalized usage record。
- provider cost fact。
- error normalization。
- rate-limit / budget admission 的网关侧事实。
- streaming chunk normalization。
- provider health signal。
- redaction、payload hash、raw payload object reference。

不负责：

- 创作者项目状态。
- asset version 业务含义。
- 用户侧 credit pricing。
- 支付和充值。
- provider 之外的业务工具执行成本。

### 5.4 Provider Adapter

负责：

- 把 normalized request 转成 provider request。
- 调用 provider 或上游 gateway。
- 解析 provider response / stream chunk。
- 解析 provider usage。
- 解析 provider error。
- 执行 provider status query，若 provider 支持。
- provider-specific tokenizer estimate，若可用。

不负责：

- tenant 权限。
- 用户侧计费。
- 业务状态更新。
- provider routing 决策。

### 5.5 Credit / Billing

负责：

- 用户侧积分 reservation / consume / release。
- 基于业务 operation 的价格策略。
- 消费 gateway 的 provider cost / usage fact。
- 毛利、异常成本、成本对账。

不负责：

- 直接调用 LLM provider。
- 解析 provider payload。
- 持有 provider secret。

### 5.6 Admin / Ops

负责：

- provider request 查询。
- result_unknown 处理。
- usage/cost 异常审查。
- provider health 和 routing override。
- paid/charged but no business result 的修复工作流。

不负责：

- 绕过领域命令直接改业务结果。
- 静默改 token ledger。

### 5.7 Future External API Service

未来独立服务负责：

- API key / virtual key。
- developer organization / project。
- public OpenAI-compatible routes。
- rate limits。
- quota / budget。
- developer usage API。
- model list API。
- public audit logs。

不负责：

- 漫画创作平台的 Project / Shot / Asset 领域状态。
- 内部积分套餐和充值订单。

## 6. 核心架构

```text
Creator Web / Internal Worker
  -> Project / Workflow command
    -> LLM Gateway Core
      -> Model Catalog
      -> Routing Policy
      -> Token Accounting
      -> Provider Request Journal
      -> Provider Adapter
        -> OpenAI / Anthropic / Gemini / DashScope / DeepSeek / OpenRouter / Local LLM
    -> Workflow / Asset / Credit facts

Future External Developer
  -> Public OpenAI-compatible API Edge
    -> same LLM Gateway Core
```

拆分时，Gateway Core 可以从进程内模块变成独立服务。业务模块的 contract 不变，只是从 direct function call 换成 internal HTTP/gRPC call。

## 7. 核心模型草案

### 7.1 Provider 与能力

```ts
type LLMProvider =
  | "openai"
  | "anthropic"
  | "google_gemini"
  | "dashscope"
  | "deepseek"
  | "openrouter"
  | "local_openai_compatible"
  | "mock_llm";

type LLMOperation =
  | "llm.chat.completions"
  | "llm.responses"
  | "llm.embeddings"
  | "llm.rerank"
  | "llm.moderation"
  | "llm.count_tokens";

type LLMCapability =
  | "chat"
  | "responses"
  | "streaming"
  | "json_schema"
  | "tool_calling"
  | "parallel_tool_calls"
  | "vision_input"
  | "audio_input"
  | "video_input"
  | "reasoning"
  | "prompt_cache"
  | "embeddings"
  | "rerank"
  | "moderation"
  | "batch";
```

### 7.2 模型目录

```ts
interface LLMModelCatalogEntry {
  modelId: string;              // public canonical id, e.g. "llm/gpt-4.1-mini"
  provider: LLMProvider;
  providerModelId: string;      // provider native model id
  displayName: string;
  capabilities: LLMCapability[];
  contextWindowTokens: number;
  maxOutputTokens: number;
  tokenizerKind:
    | "openai_tiktoken"
    | "anthropic_native"
    | "gemini_count_tokens"
    | "dashscope_native"
    | "deepseek_openai_compatible"
    | "unknown_estimator";
  pricing: {
    currency: "USD" | "CNY";
    inputPerMillionMinor: number;
    outputPerMillionMinor: number;
    cachedInputPerMillionMinor?: number;
    cacheWritePerMillionMinor?: number;
    reasoningOutputPerMillionMinor?: number;
    imageInputPerUnitMinor?: number;
    audioInputPerMinuteMinor?: number;
  };
  routing: {
    status: "active" | "shadow" | "disabled" | "deprecated";
    qualityTier: "low" | "standard" | "high" | "frontier";
    latencyTier: "low" | "standard" | "slow";
    regionPolicy: "domestic" | "international" | "local";
    fallbackModelIds: string[];
  };
  safety: {
    allowUserContent: boolean;
    allowSensitiveContent: boolean;
    dataRetention: "provider_default" | "zero_retention" | "unknown";
  };
}
```

模型目录是 gateway 的核心产品面。业务模块不应该知道 provider-native model id；业务只选择稳定的 gateway model id 或 routing policy。

### 7.3 请求 envelope

```ts
interface LLMGatewayRequest {
  gatewayRequestId: string;
  organizationId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  actorUserId?: string | null;

  operation: LLMOperation;
  businessOperationName: string; // e.g. "script.parse"
  idempotencyKey: string;
  requestHash: string;

  model: {
    mode: "exact" | "policy";
    modelId?: string;
    policy?: RoutingPolicy;
  };

  input: {
    messages?: LLMMessage[];
    prompt?: string;
    multimodalRefs?: LLMMediaRef[];
    tools?: LLMToolDefinition[];
    responseFormat?: LLMResponseFormat;
  };

  parameters: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stop?: string[];
    stream?: boolean;
    reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  };

  budget: {
    maxEstimatedInputTokens?: number;
    maxOutputTokens?: number;
    maxProviderCostMinor?: number;
    currency?: "USD" | "CNY";
  };

  safeMetadata: Record<string, string | number | boolean | null>;
}
```

### 7.4 路由策略

```ts
type RoutingPolicy =
  | {
      kind: "exact";
      modelId: string;
    }
  | {
      kind: "cost_optimized";
      requiredCapabilities: LLMCapability[];
      qualityFloor: "low" | "standard" | "high";
      regionPolicy?: "domestic_only" | "international_allowed" | "local_only";
    }
  | {
      kind: "latency_optimized";
      requiredCapabilities: LLMCapability[];
      maxP95LatencyMs: number;
    }
  | {
      kind: "quality_optimized";
      requiredCapabilities: LLMCapability[];
      preferredModelIds: string[];
      fallbackModelIds: string[];
    }
  | {
      kind: "fallback_chain";
      modelIds: string[];
    };
```

P0 内部创作链路建议优先使用 `exact` 或 `fallback_chain`，避免过早做复杂自动路由。面向外部 API 服务时，再开放 cost / latency / quality policy。

### 7.5 Provider adapter contract

```ts
interface LLMProviderAdapter {
  provider: LLMProvider;

  estimateTokens(input: {
    model: LLMModelCatalogEntry;
    request: LLMGatewayRequest;
  }): Promise<LLMTokenEstimate>;

  submit(input: {
    providerRequestId: string;
    model: LLMModelCatalogEntry;
    request: LLMGatewayRequest;
    timeoutMs: number;
  }): Promise<LLMProviderSubmitResult>;

  stream?(input: {
    providerRequestId: string;
    model: LLMModelCatalogEntry;
    request: LLMGatewayRequest;
    timeoutMs: number;
  }): AsyncIterable<LLMStreamChunk>;

  queryStatus?(input: {
    providerRequestId: string;
    externalRequestId: string;
    model: LLMModelCatalogEntry;
  }): Promise<LLMProviderStatusResult>;

  normalizeError(error: unknown): LLMProviderError;
}
```

`ProviderAdapter.submit` 现有 contract 可以继续作为低层通用抽象，但 LLM 需要在其上加一层 LLM-specific adapter，否则 token / stream / model catalog 无法干净表达。

### 7.6 标准响应

```ts
interface LLMGatewayResponse {
  gatewayRequestId: string;
  providerRequestId: string;
  provider: LLMProvider;
  modelId: string;
  providerModelId: string;
  externalRequestId: string | null;
  status: "succeeded" | "failed" | "canceled" | "result_unknown";
  output: {
    text?: string;
    messages?: LLMMessage[];
    toolCalls?: LLMToolCall[];
    embeddings?: number[][];
    rawOutputRef?: string;
  };
  finishReason:
    | "stop"
    | "length"
    | "tool_call"
    | "content_filter"
    | "provider_error"
    | "unknown";
  usage: LLMNormalizedUsage;
  safeMetadata: Record<string, unknown>;
}
```

## 8. Token 用量模型

### 8.1 归一化 usage

```ts
interface LLMNormalizedUsage {
  usageSource: "provider_reported" | "gateway_estimated" | "reconciled";
  tokenizationSource:
    | "provider_native"
    | "provider_count_tokens_api"
    | "gateway_tokenizer"
    | "heuristic";

  inputTokens: number;
  outputTokens: number;
  totalTokens: number;

  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningOutputTokens?: number;
  toolCallOutputTokens?: number;

  imageInputTokens?: number;
  audioInputTokens?: number;
  videoInputTokens?: number;

  providerRawUsageHash: string;
  providerRawUsageRedacted: Record<string, unknown>;

  cost: {
    providerCurrency: "USD" | "CNY";
    providerCostMinor: number;
    normalizedCurrency: "USD" | "CNY";
    normalizedCostMinor: number;
    priceVersion: string;
    costSource: "catalog_price" | "provider_reported" | "manual_reconciled";
  };
}
```

### 8.2 计量规则

| 阶段 | 用途 | 规则 |
| --- | --- | --- |
| Preflight estimate | context window、预算、quota、限流 | adapter 根据 model catalog 估算；估算失败则进入保守 heuristic；不可作为最终成本真相 |
| Provider reported usage | 最终 token fact、provider cost、对账 | 优先使用 provider response 中的 usage；保留 raw hash 和 redacted usage |
| Streaming usage | 流式响应最终 token fact | 优先读取 final chunk usage；若连接中断且 provider 无 query，则标记 `result_unknown` 或 `usageSource=estimated` |
| Cache tokens | 成本与性能分析 | cached read、cache write 必须单独字段，不混入普通 input token 的成本 |
| Reasoning tokens | 成本与输出上限 | 归入 output cost，但保留 `reasoningOutputTokens`，避免用户看不到却被计费时无法解释 |
| Tool tokens | 模型输出 / 输入的一部分 | tool schema 属于 input estimate；tool call JSON 属于 output；外部工具执行成本另算 |
| Multimodal tokens | 图像 / 音频 / 视频输入 | 能拆则拆字段；不能拆则放入 inputTokens 并保留 raw usage |
| Retry / fallback | 成本归因 | 每个 provider attempt 单独记 usage；gateway request 聚合；用户侧是否为失败 attempt 付费由 Billing 策略决定 |

### 8.3 Provider usage 映射

| Provider / 协议 | 常见 usage 字段 | 映射策略 |
| --- | --- | --- |
| OpenAI Chat Completions | `prompt_tokens`、`completion_tokens`、`total_tokens`、`prompt_tokens_details.cached_tokens`、`completion_tokens_details.reasoning_tokens` | prompt -> input；completion -> output；cached / reasoning 保留细分 |
| OpenAI Responses | `input_tokens`、`output_tokens`、`total_tokens`、`input_tokens_details.cached_tokens`、`output_tokens_details.reasoning_tokens` | 直接映射 input / output；reasoning 单独保留 |
| Anthropic Messages | `input_tokens`、`output_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens` | input/output 直接映射；cache creation/read 单独字段；注意 token 不一定等于可见内容 |
| Google Gemini | `promptTokenCount`、`candidatesTokenCount`、`totalTokenCount`、`cachedContentTokenCount`、`thoughtsTokenCount`、modality details | prompt -> input；candidates -> output；thoughts -> reasoning；modality details 分拆 image/audio/video |
| DashScope / Qwen OpenAI-compatible | `prompt_tokens`、`completion_tokens`、`total_tokens`、`prompt_tokens_details`、`completion_tokens_details` | 按 OpenAI-compatible 映射；若使用 native DashScope，则映射 `input_tokens` / `output_tokens` |
| DeepSeek OpenAI-compatible | `prompt_tokens`、`completion_tokens`、`total_tokens`、`prompt_cache_hit_tokens`、`prompt_cache_miss_tokens` | prompt -> input；completion -> output；cache hit -> cached input；miss -> ordinary input |
| OpenRouter | OpenAI-like `usage`，可能带 cost / native token stats | 作为上游 gateway 时必须记录实际 upstream provider/model；OpenRouter usage 可做 provider-reported usage，但仍保留 raw |

### 8.4 用户侧 token 解释原则

对用户和运营解释 token 时要说人话：

- 输入 token：系统提示、用户文本、历史上下文、工具定义、多模态输入共同消耗。
- 输出 token：模型生成的可见文本、tool call JSON、隐藏 reasoning 都可能计入。
- cached token：不代表免费，只代表 provider 用缓存计价或加速；价格由 provider/model 价格表决定。
- streaming 中断：用户看到了部分输出，不代表 provider 没有计费；必须进入 reconciliation。

## 9. 数据记录建议

### 9.1 最小新增概念

| 概念 | 推荐形态 | 说明 |
| --- | --- | --- |
| `llm_gateway_requests` | 表或 service-level parent record | 一个用户 / 业务 LLM 请求的父级事实，可包含多个 provider attempts |
| `llm_model_catalog` | 表或 versioned config | model id、provider id、capability、context、price、routing |
| `llm_usage_records` | append-only table | 每个 provider attempt 的 usage 和 cost fact |
| `llm_routing_decisions` | JSON snapshot 或独立表 | 记录为何选这个模型、为何 fallback |
| `llm_api_keys` | 未来外部服务表 | public gateway API key；P0 不实现 |

### 9.2 与现有表的映射

```text
llm_gateway_requests 1 -> N provider_requests
provider_requests 1 -> 0..1 llm_usage_records
provider_requests 1 -> 0..N credit_reservation_allocations
credit_reservation_allocations 1 -> 0..1 credit_ledger_entries(settlement)
```

在只做内部 P0 时，可以先不新增 `llm_gateway_requests` 表，而是在 service 层把 `requestKey` 设计成稳定父请求 key。但长期要拆独立 API 服务时，父请求表是必要的。

### 9.3 Payload 与隐私

- raw prompt 不直接进 `provider_requests.payload_redacted_json`。
- 大 prompt、剧本文本、图片引用进入 object storage 或受控 payload store，`payload_ref` 指向它。
- `payload_hash` 用于幂等和审计。
- redacted payload 只放 operation、model policy、长度、资产 ID、shot ID、token estimate、safe metadata。
- provider response 同理：业务需要的文本结果进入业务表或对象存储；provider raw response 只留 hash/ref/redacted summary。

## 10. 调用流程

### 10.1 非流式内部调用

```text
Workflow worker
  -> LLMGateway.createRequest(idempotencyKey, businessOperation, payloadRef/hash)
  -> Gateway resolves model catalog + routing policy
  -> Gateway estimates tokens and checks budget/context
  -> Gateway creates provider_requests before external call
  -> Gateway marks external_submission_started_at
  -> Adapter calls provider
  -> Adapter normalizes response + usage
  -> Gateway writes usage/cost fact
  -> Gateway updates provider_requests status
  -> Workflow finalizes attempt
  -> Credit/Billing settles user-facing credits according to business policy
```

### 10.2 流式调用

```text
Client
  -> Public/Internal streaming endpoint
  -> Gateway creates durable request before first upstream byte
  -> Adapter streams provider chunks
  -> Gateway normalizes chunks to SSE
  -> Gateway buffers minimal final state / output ref
  -> Final chunk carries normalized usage if provider provides it
  -> If stream breaks before final usage, request enters usage reconciliation
```

流式响应不是绕过持久化的理由。只要请求可能产生 provider 侧计费，就必须先有 durable request。

### 10.3 Fallback

Fallback 的正确形态：

```text
gateway_request: req_123
  provider_request: attempt_1, provider=openai, status=failed, usage maybe exists
  provider_request: attempt_2, provider=anthropic, status=succeeded, usage exists
```

错误形态：

```text
same provider_request overwritten from openai to anthropic
```

每个外部 side effect 都是独立 attempt，否则成本和事故审计会失真。

## 11. 对外 API 服务形态

未来拆分为独立服务时，推荐 API surface：

| Endpoint | 形态 | 说明 |
| --- | --- | --- |
| `GET /v1/models` | OpenAI-compatible + extended metadata | 返回可用模型、能力、context、价格摘要 |
| `POST /v1/chat/completions` | OpenAI-compatible | 优先兼容生态工具 |
| `POST /v1/responses` | OpenAI-compatible / extended | 面向新一代 responses / agent 工作流 |
| `POST /v1/embeddings` | OpenAI-compatible | 以后支持 RAG |
| `POST /v1/rerank` | Gateway-native | 兼容 rerank providers |
| `POST /v1/moderations` | OpenAI-compatible | 内容安全 |
| `POST /v1/tokens/count` | Gateway-native | 统一 token estimate |
| `GET /v1/usage` | Gateway-native | 按 key / project / model 查询用量 |
| `GET /v1/requests/{id}` | Gateway-native | request / attempt / usage / cost 详情 |

### 11.1 外部服务必须新增的边界

- API key / virtual key。
- key scope：organization、project、allowed models、budget。
- per-key rate limit。
- per-key token budget。
- provider key 管理，支持平台 key 和 BYOK。
- abuse detection。
- prompt / response redaction policy。
- developer-facing usage export。
- SLA / provider health page。

这些不是 P0 创作平台必须实现的内容，但当前 contract 不能把它们堵死。

## 12. Provider 接入策略

### 12.1 Provider 类型

| 类型 | 例子 | 接入方式 |
| --- | --- | --- |
| OpenAI-compatible provider | OpenAI Chat Completions、DeepSeek、DashScope compatible mode、Moonshot/Kimi compatible mode、SiliconFlow、OpenRouter | `OpenAICompatibleAdapter` + provider preset |
| Native Messages provider | Anthropic | `AnthropicMessagesAdapter` |
| Native GenerateContent provider | Google Gemini / Vertex AI | `GeminiAdapter` |
| Native DashScope provider | Qwen / QVQ / multimodal native | `DashScopeAdapter` |
| Upstream gateway | LiteLLM / Portkey / OpenRouter / One API | `GatewayUpstreamAdapter`，仍需记录 upstream model/provider |
| Local model server | vLLM / SGLang / llama.cpp / Ollama OpenAI-compatible | `LocalOpenAICompatibleAdapter` |

### 12.2 接入顺序建议

1. `mock_llm`：固定输出、固定 usage、失败注入，用于本地和测试。
2. `openai_compatible` generic adapter：覆盖 DeepSeek、DashScope compatible mode、本地 vLLM/Ollama、OpenRouter。
3. `anthropic_messages` adapter：验证非 OpenAI schema 的 normalized model。
4. `gemini` adapter：验证 multimodal / thinking / native usageMetadata。
5. `dashscope_native` adapter：验证国内多模态和 native usage。

这个顺序不是按商业价值，而是按架构验证价值：先把“兼容协议”和“非兼容协议”都打通。

## 13. Mock LLM Provider

本地 LLM mock 不应该只是返回一句假文本。它应该能模拟 gateway 最容易出错的地方：

```ts
type MockLLMScenario =
  | "success"
  | "tool_call"
  | "json_schema_success"
  | "content_filter"
  | "rate_limited"
  | "timeout_before_external_start"
  | "timeout_after_external_start"
  | "stream_interrupted_before_usage"
  | "usage_missing"
  | "usage_mismatch"
  | "context_length_exceeded"
  | "provider_5xx"
  | "fallback_success";
```

Mock 必须支持：

- 固定 input/output token。
- cached token。
- reasoning token。
- streaming final usage chunk。
- final usage 丢失。
- provider error code。
- 延迟和超时。
- external request id。

这样才能在真实 provider 接入前验证 token、fallback、结算、Ops 修复链路。

## 14. 开源项目筛选标准

### 14.1 候选方向

| 项目方向 | 代表项目 | 适合用途 |
| --- | --- | --- |
| 多 provider LLM gateway / proxy | LiteLLM、Portkey AI Gateway、One API / New API | 研究 provider 覆盖、OpenAI-compatible proxy、fallback、budget、dashboard |
| LLM observability gateway | Helicone、Langfuse gateway/observability 生态 | 研究 tracing、cost、prompt/response 可观测性 |
| API gateway with AI plugins | Kong AI Gateway 等 | 研究企业级 rate limit、auth、traffic policy |
| Local inference server | vLLM、SGLang、Ollama、llama.cpp server | 研究本地模型接入和 OpenAI-compatible adapter |
| Provider SDK | OpenAI SDK、Anthropic SDK、Google GenAI SDK、DashScope SDK | 实现 native adapter，不决定领域模型 |

### 14.2 打分矩阵

| 维度 | 权重 | 高分标准 |
| --- | ---: | --- |
| Provider 覆盖 | 15 | 同时覆盖海外和国内主流模型，支持 OpenAI-compatible 和 native provider |
| Usage / cost 透明度 | 20 | 能返回每次请求 token、cache、reasoning、cost，并可导出 / hook |
| 可嵌入性 | 15 | 可作为 library、sidecar 或 upstream adapter，不强迫接管业务数据库 |
| 幂等与恢复 | 15 | 能支持 request id、timeout、retry/fallback、attempt 日志；不隐藏外部 side effect |
| Streaming 支持 | 10 | final usage chunk、断流处理、SSE 兼容 |
| 扩展性 | 10 | 新 provider / 新模型 / 新参数可插件化 |
| 安全与隐私 | 10 | secret 管理、prompt redaction、tenant isolation、BYOK 可能性 |
| 运维体验 | 5 | dashboard、health、metrics、日志、告警 |

### 14.3 一票否决

以下情况不选，或者只能作为研究材料：

- 强行接管我们的用户、组织、项目、任务或积分账本。
- 不能拿到每个 provider attempt 的 raw usage / cost。
- 无法区分 estimated usage 和 provider-reported usage。
- fallback 会隐藏失败 attempt。
- 不支持 self-host 或核心能力闭源不可控。
- 需要把 provider secret 下发到前端。
- 无法做 prompt/response redaction。
- 不能在 external submission 前拿到本地 request id。

## 15. 推荐研发切片

### 15.1 P0 内部最小闭环

目标：服务剧本解析 / 分镜文本生成 / prompt 生成等 LLM 能力，同时验证 gateway 内核。

包含：

- `LLMProviderAdapter` contract。
- `mock_llm` adapter。
- `openai_compatible` adapter。
- versioned `llm_model_catalog` config。
- `LLMNormalizedUsage`。
- provider request payload redaction 规范。
- `provider_operation = "llm.chat.completions"`。
- 用 `provider_requests` 记录每个 attempt。
- usage record 最小落库或先写入 redacted response 中的明确结构。

不包含：

- 公开 API key。
- BYOK。
- 完整开发者 dashboard。
- 复杂自动路由。

### 15.2 P1 Gateway 内核增强

- `llm_gateway_requests` parent。
- `llm_usage_records` append-only。
- provider cost price version。
- streaming。
- Anthropic/Gemini/DashScope native adapters。
- provider health。
- fallback chain。
- Admin/Ops usage/cost 查询。

### 15.3 P2 外部 API 服务

- 独立部署 gateway service。
- `GET /v1/models`。
- `POST /v1/chat/completions`。
- API key / virtual key。
- quota / budget / rate limit。
- developer usage API。
- BYOK。
- dashboard。

## 16. 验收清单

这份设计后续实现时必须能回答：

- 本地业务调用 LLM 时，谁拥有业务状态，谁拥有 provider request？
- provider SDK 能不能进入 Project / Workflow / Asset？答案必须是不能。
- token 是如何估算的？如何最终确认？
- provider 返回 usage 缺失怎么办？
- streaming 断在 final usage 前怎么办？
- fallback 产生多个 provider attempts 时，用户侧怎么结算？
- OpenRouter / LiteLLM / Portkey 这类上游 gateway 接入时，如何避免它们吞掉真实 provider attempt？
- 后续拆成独立 API 服务时，哪些 contract 保持不变？
- 研发找开源项目时，哪些能力是加分，哪些是一票否决？

## 17. 参考资料

- OpenRouter API Reference: https://openrouter.ai/docs/api/reference/overview
- OpenRouter Usage Accounting: https://openrouter.ai/docs/cookbook/administration/usage-accounting
- OpenAI token usage help: https://help.openai.com/en/articles/6614209
- OpenAI prompt caching usage fields: https://openai.com/index/api-prompt-caching/
- OpenAI Responses usage fields: https://platform.openai.com/docs/api-reference/responses/input-tokens
- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Google Gemini token counting: https://ai.google.dev/api/tokens
- Google Gemini GenerateContent usage metadata: https://ai.google.dev/api/generate-content
- DeepSeek Chat Completion API: https://api-docs.deepseek.com/api/create-chat-completion
- Alibaba Cloud Model Studio / DashScope compatible mode usage examples: https://www.alibabacloud.com/help/en/model-studio/stream
- Qwen Cloud DashScope chat API: https://docs.qwencloud.com/api-reference/chat/dashscope
- LiteLLM: https://github.com/BerriAI/litellm
- Portkey AI Gateway: https://github.com/Portkey-AI/gateway
- Helicone: https://github.com/Helicone/helicone
