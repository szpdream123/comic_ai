# 多项目 AI 营销与多平台分发架构方案

**状态：** 提案

**日期：** 2026-08-15
**范围：** 当前 Comic AI 项目作为营销中台，独立的 QianFanSync 作为本地发布执行器。

## 1. 目标与边界

系统面向漫画项目以及后续接入的课程、软件、品牌、活动和其他业务项目，完成下列闭环：

```text
项目事实与素材 + 管理员营销目标
  -> 网络调研与知识库检索
  -> AI 策划、文案、图文和视频生成
  -> 事实、版权、平台规则和人工审核
  -> QianFanSync 本地账号发布
  -> 发布与效果回传
  -> 知识库和内容策略持续优化
```

系统追求的是可持续的内容质量、受众价值和合规发布，不是规避平台审核、伪装广告或绕过访问限制。应披露的商业合作、推广属性和 AI 生成内容必须按目标平台规则披露。

QianFanSync 不嵌入 Comic AI，也不共享数据库或账号 Cookie。Comic AI 仅提供受保护的发布任务 API；QianFanSync 主动拉取任务、下载临时素材、在本机使用已授权账号执行发布，并回传结果。

首期采用最小化部署：不新增营销应用服务器、向量数据库、独立 Agent 平台或本地模型服务。网页采集和 Agent 均作为当前后端的轻量 Worker 运行；所有推广二进制素材使用现有 COS 临时交付；QianFanSync 单独部署在一台 4 核 CPU、8 GB 内存的发布执行器上。

## 2. 职责划分

### 2.1 Comic AI: 营销中台

| 能力 | 职责 |
| --- | --- |
| 多项目管理 | 创建并维护任何被推广项目的事实资料、品牌资料、版权信息和素材来源。漫画项目只是其中一种来源。 |
| 活动编排 | 定义受众、营销目标、平台、内容形式、节奏、发布时间、禁用表达和人工审批要求。 |
| 内容生成 | 复用现有模型网关、图片/视频/音频生成和 FFmpeg 合成能力，生成多版本内容包。 |
| 网络调研 | 从合规来源检索趋势、受众问题、行业表达和官方平台规则，产出带来源的调研简报。 |
| 知识库 | 保存项目事实、品牌规范、平台规则、热点洞察、审核结论与发布效果。 |
| 质量门禁 | 执行事实、版权、重复度、风险和平台规则检查；只有 `super_admin` 可批准发布。 |
| 发布调度 | 创建、排期、取消、租约管理、幂等控制和任务审计。 |
| 运营看板 | 汇总活动、内容版本、发布链接、失败原因和可获得的表现数据。 |

### 2.2 QianFanSync: 本地发布执行器

| 能力 | 职责 |
| --- | --- |
| 本地账号管理 | 保存平台会话和账号信息；只在本机使用，不向 Comic AI 传递 Cookie、密码或令牌。 |
| 执行器注册 | 使用独立 `workerId` 和密钥声明本机版本、可用平台和账号引用。 |
| 任务消费 | 领取任务、下载临时素材、校验哈希并转为本地 `PublishTask`。 |
| 发布执行 | 复用现有队列和平台适配器，按账号串行上传、发布或定时发布。 |
| 异常处理 | 对登录失效、验证码、平台人工确认等情况回传 `needs_attention`；不自动绕过平台安全控制。 |
| 状态回传 | 回传执行状态、平台内容 ID、发布链接、失败码和可选截图引用。 |
| 指标回传 | 在平台允许且可稳定取得时，回传内容表现和账号级可用指标。 |

### 2.3 营销中台的独立与可迁移边界

营销中台先放在 Comic AI 仓库中，但必须以模块化单体方式实现，而不是把逻辑散落在漫画项目、画布或分镜模块中。营销核心不直接查询漫画项目表，也不依赖漫画领域类型；漫画只通过一个内容源适配器向营销中台提交规范化资料。

```text
Comic AI 漫画模块 -- ComicMarketingSourceAdapter --+
外部项目 API ------ ExternalMarketingSourceAdapter --+--> Marketing Core --> QianFanSync Client
管理员上传 --------- ManualMarketingSourceAdapter ---+
```

营销核心只认识统一的 `MarketingSourceManifest`：项目名称、品牌资料、事实段、授权信息、素材引用、目标受众和来源版本。它不关心资料来自漫画、课程、软件还是人工上传。

建议目录边界如下：

```text
apps/backend/src/modules/marketing/
  domain/          # 营销项目、活动、知识、内容、发布任务的纯领域类型和规则
  application/     # 用例：调研、生成、审核、排期、回调
  ports/           # 内容源、模型、存储、搜索、执行器、任务调度接口
  infrastructure/  # PostgreSQL、COS、BullMQ、HTTP 实现
  adapters/        # comic-internal、external-api、manual、qianfan
  http/             # 独立的 admin/marketing API 路由处理
  workers/          # 轻量采集 Worker 和营销 Agent Worker
```

`domain` 和 `application` 不得直接 import 漫画项目、分镜、Canvas 或 QianFanSync 的实现。它们只能依赖 `ports`；`ComicMarketingSourceAdapter` 是唯一允许读取漫画领域资料的代码。营销数据使用独立表和 `marketing_` 前缀，不建立到漫画项目表的强外键；通过 `source_namespace`、`source_record_id` 和不可变 `source_snapshot` 记录来源，避免迁移时被项目库结构绑定。

权限仍以当前主用户与子用户为唯一业务归属，营销项目记录当前主用户 ID 与创建/审批操作人；不引入历史归属字段。首期只开放 `super_admin` 操作，但数据模型保留当前用户范围，便于未来按权限开放而不改变归属模型。

迁移路径：

1. **当前阶段**：营销模块和 Comic AI 共用部署、身份、PostgreSQL、Redis、COS、模型网关与任务 Worker。
2. **包边界阶段**：将 `domain`、`application` 和 `ports` 提取为独立内部 package；漫画适配器仍留在 Comic AI。
3. **独立服务阶段**：营销 Core 使用自身 API、数据库和 Worker 部署；Comic AI 与其他业务项目都通过 `ExternalMarketingSourceAdapter`/HTTP 推送资料；QianFanSync 接口保持不变。

这一路径避免首期微服务化成本，同时确保将来迁出时不需要搬迁漫画业务逻辑或重写发布契约。

## 3. 核心领域模型

| 对象 | 说明 |
| --- | --- |
| `marketing_project` | 被推广的实体。`source_type` 可为 `comic_internal`、`external_api`、`manual` 或 `knowledge_base`。 |
| `brand_profile` | 品牌口吻、目标受众、事实来源、禁用词、可用承诺、视觉规范和披露要求。 |
| `marketing_campaign` | 一次活动，定义目标、预算外的频率限制、时间窗口、平台和审核策略。 |
| `research_brief` | 调研计划、检索结果、来源、结论、可信度和人工确认状态。 |
| `trend_pattern` | 热点内容的抽象结构，不保存或重用未授权的原始作品。 |
| `content_variant` | 某个目标平台的文案、图文、视频、封面、字幕和版本信息。 |
| `publish_job` | 已审核的最终发布指令，包含平台、账号引用、排期、幂等键和素材清单。 |
| `publish_delivery` | 一个执行器对一个账号的一次交付，包含租约、状态和最终发布结果。 |
| `promotion_executor` | 一台注册的 QianFanSync 实例及其允许使用的平台、账号引用和健康状态。 |
| `promotion_audit_event` | 创建、生成、审核、下发、取消、重试和人工介入的不可变审计记录。 |

## 4. 内容与知识库设计

### 4.1 知识库分层

1. **项目事实库**：产品介绍、功能边界、价格、官方链接、案例、可验证数据、版权和素材授权。
2. **品牌表达库**：语气、受众、价值主张、禁用词、视觉规范、可用的商业披露文案。
3. **平台规则库**：官方规则、尺寸/时长、标题约束、内容声明、敏感类目、历史审核结论。
4. **热点洞察库**：热点主题、内容结构、节奏、视觉特征和来源链接。
5. **内容策略库**：教学、幕后、问答、案例、故事、复盘等原创内容模板。
6. **效果反馈库**：发布版本、时间、平台、指标、人工复盘、适用条件和失效原因。

每条知识记录须保存来源、采集时间、适用范围、可信度、版权/授权状态和版本。模型生成前必须检索对应资料，不能将网络搜索内容直接当作事实。

### 4.2 热点洞察与原创保护

热点采集只可使用平台官方能力、已授权数据服务、允许访问的公开页面或运营人员提交的链接。不得使用 QianFanSync 的发布自动化去抓取平台内容，不以规避访问限制为目标。

热点分析保存的是可泛化模式，例如前 3 秒钩子类型、叙事节奏、镜头密度、字幕密度、标题结构、互动问题和目标受众，而不是原片、原音乐、原脚本或原始图片。

内容生成必须执行以下限制：

- 不复制原视频、图片、音乐、角色、商标、标题、脚本或高度相似的镜头顺序。
- 不把未经核实的热点数据、观点或评论包装为项目事实。
- 对标题、口播、字幕、封面文案、画面指令和素材指纹执行相似度检查。
- 无法确认版权、事实或披露要求时，进入 `manual_review_required`，而不是自动发布。

### 4.3 合规和广告风险检查

发布前检查覆盖以下项目：

- 无依据的绝对化、保证性或效果承诺。
- 虚构数据、虚假评价、虚假稀缺、误导性优惠和不实对比。
- 诱导互动、诱导跳转或违反平台规则的表达。
- 未做必要商业推广或 AI 内容声明的内容。
- 版权、肖像、商标、音乐和素材授权风险。
- 跨平台机械重复和同账号高相似度重复发布。

检查结果必须包含风险等级、命中规则、证据、建议修改和是否强制人工复核。该机制用于合规和内容质量控制，不能被设计为规避识别的替换词库。

### 4.4 知识库的轻量实现

知识库首期不使用向量数据库。它是 PostgreSQL 中一组有审核状态、来源和版本的结构化文本记录，供营销 Agent 在每次生成前检索。

| 表 | 保存内容 | 检索与约束 |
| --- | --- | --- |
| `marketing_knowledge_documents` | 一份知识文档的标题、类型、项目范围、来源、授权状态、可信度、当前版本和审核状态。 | 只允许 `approved` 记录进入模型上下文。 |
| `marketing_knowledge_segments` | 文档按 500-1,500 个中文字符切分后的正文段、摘要、标签、证据定位和来源链接。 | 按项目、类型、标签、可信度和文本相似度取前 8 段。 |
| `marketing_sources` | 外部搜索、人工链接、外部项目 API 或用户上传的来源元数据、内容哈希和采集时间。 | 同 URL + 内容哈希去重；来源撤销后关联段落立即不可检索。 |
| `marketing_trend_patterns` | 从热点中提炼的钩子、节奏、形式、受众、内容价值和风险标签。 | 不保存或复用未授权原视频、原图、原音乐和逐字脚本。 |
| `marketing_content_variants` | 已生成内容、引用的知识段 ID、平台、审核状态和最终结果。 | 用于追溯“这条文案为什么这样生成”。 |
| `marketing_publish_deliveries` | 发布状态、链接、可获得的表现数据和人工复盘。 | 只向效果反馈库增加权重，不覆盖项目事实。 |

中文检索采用 PostgreSQL 内置 `pg_trgm` 的 GIN 索引匹配标题、正文和标签，并结合 `project_id`、知识类型、审核状态、来源可信度和时间衰减排序。`tsvector` 可保留给英文、标签和已分词字段，但不能单独依赖它做中文正文检索。这样无需引入分词服务、向量库或额外服务器。

入库流程如下：

```text
来源导入
  -> 去重、URL/授权/大小校验
  -> 正文提取或人工摘要
  -> 分类为事实、规则、热点模式、策略或复盘
  -> 文本分段与标签提取
  -> 人工批准或自动低风险批准
  -> PostgreSQL 检索可用
```

生成时，Agent 先按项目、活动、平台和任务类型检索知识段；项目事实和平台规则优先级高于热点模式和历史效果。模型上下文中必须携带段 ID 和来源 URL，输出内容也记录使用过的段 ID。第三方网页只保存实现调研所需的来源信息、短摘要和结构化洞察；项目自有或获得授权的资料才可保存完整正文。

### 4.5 抖音热点洞察与原创改编

抖音热点不是“下载热门视频并改一改”的素材库，而是内容策略信号。`DouyinTrendSource` 只接收以下来源：抖音官方能力、已授权数据服务、运营人员导入的公开链接和已获授权的样本素材。批量爬取、绕过登录/验证码、下载他人作品或用发布自动化反向抓取均不在范围内。

对每条可用来源提取并保存：标题、描述、话题、公开可得的发布时间/互动信号、内容类型、封面信息、授权状态和来源链接。对授权样本或运营人员提供的转写/截图，可进一步分析开场钩子、叙事结构、镜头节奏、字幕密度、目标受众和互动方式，并写成 `marketing_trend_patterns`。

改编流程固定为：

```text
热点模式 + 项目事实 + 平台规则 + 管理员目标
  -> 原创内容策略
  -> 原创脚本、标题、分镜与视觉提示
  -> 相似度和版权检查
  -> 人工审核
  -> QianFanSync 发布
```

生成器不得复用原内容的逐字文案、音乐、角色、商标、关键画面或高度相同的镜头顺序。吸引用户依赖教学、幕后、案例、故事和问答等内容价值；后续转化只使用目标平台允许的主页、合集、小程序、商品或官方链接能力。

## 5. 端到端工作流

1. 管理员创建 `marketing_project`，或由外部项目 API 推送事实和素材。
2. 管理员创建活动，填写目标用户、推广目标、平台、内容风格、禁用项和期望发布时间。
3. 调研 Agent 生成检索计划；搜索服务返回可追溯来源；模型产出 `research_brief`。
4. 策划 Agent 从知识库检索事实、规则、热点和历史表现，提出可审核的内容策略。
5. 文案、图像、视频和音频能力生成每个平台的原创 `content_variant`。
6. 质量门禁完成事实、版权、相似度、平台规则和风险检查。
7. `super_admin` 审核、编辑、批准内容并选择账号与排期。
8. Comic AI 创建 `publish_job`；合格的 QianFanSync 执行器拉取并领取任务。
9. QianFanSync 下载临时素材、校验后入本地队列，执行平台发布并持续回传状态。
10. Comic AI 归档结果与表现数据，将人工复盘和经验证的效果写回知识库。

## 6. Comic AI 与 QianFanSync 的 API 契约

以下为建议新增的 Comic AI 对外接口。QianFanSync 仅作为 API 客户端；不要求 Comic AI 访问 QianFanSync 的数据库或本地服务。

| 接口 | 方法 | 作用 |
| --- | --- | --- |
| `/api/integrations/qianfan/capabilities` | `POST` | 注册或心跳；上报执行器版本、平台能力和本地账号引用。 |
| `/api/integrations/qianfan/publish-jobs/next` | `POST` | 拉取并原子领取一条匹配执行器能力的任务。 |
| `/api/integrations/qianfan/publish-jobs/{jobId}/ack` | `POST` | 素材下载、哈希验证和本地入队成功后确认。 |
| `/api/integrations/qianfan/publish-jobs/{jobId}/events` | `POST` | 回传过程状态、发布链接、平台内容 ID、错误和人工处理信息。 |
| `/api/integrations/qianfan/publish-jobs/{jobId}/heartbeat` | `POST` | 长时上传或定时等待时续约。 |
| `/api/integrations/qianfan/publish-jobs/{jobId}/cancel-state` | `GET` | 在提交平台前确认任务未被后台撤销。 |
| `/api/integrations/qianfan/analytics` | `POST` | 回传平台允许获得的表现指标。 |

`publish-jobs/next` 响应包含任务 ID、幂等键、租约期限、平台、`executorAccountRef`、排期、经审核的文案字段以及视频/封面/字幕的短期签名 URL 和 SHA-256。绝不包含 Cookie、密码、API 密钥或数据库连接信息。

状态转换统一为：

```text
draft -> approved -> scheduled -> leased -> downloading -> downloaded
-> queued -> running -> succeeded | failed | needs_attention | canceled
```

任务的 `idempotencyKey` 应至少由活动、内容版本、平台、账号引用和计划批次组成。一个账号在同一时刻只允许一个 `running` 任务；网络重试、租约恢复和事件重复投递不得产生二次发布。

### 6.1 外部项目内容源接口

后续业务项目不直接操作 QianFanSync，而是接入 Comic AI 的营销中台。首期可通过管理员上传；需要自动同步时，外部项目使用以下受认证保护的接口：

| 接口 | 方法 | 作用 |
| --- | --- | --- |
| `/api/marketing/projects` | `POST` | 创建推广项目，注册项目类型、品牌资料和来源归属。 |
| `/api/marketing/projects/{projectId}/sources` | `POST` | 推送事实资料、公开链接、产品说明、素材元数据或短期下载地址。 |
| `/api/marketing/projects/{projectId}/sources/{sourceId}` | `PATCH` | 更新或撤销事实来源、授权状态和有效期。 |
| `/api/marketing/campaigns` | `POST` | 创建活动，提交受众、目标、平台、风格、禁用项和排期要求。 |
| `/api/marketing/campaigns/{campaignId}/research` | `POST` | 启动带来源记录的调研任务。 |
| `/api/marketing/campaigns/{campaignId}/content` | `POST` | 基于已批准的事实、调研和策略生成内容版本。 |
| `/api/marketing/content/{contentId}/approve` | `POST` | 由 `super_admin` 审核、编辑并批准内容版本。 |
| `/api/marketing/publish-jobs` | `POST` | 将已批准内容排入发布计划，供 QianFanSync 消费。 |

外部项目只能提交其拥有或被授权使用的事实和素材，且必须携带稳定的来源 ID、版本、授权状态和撤销能力。Comic AI 不信任外部项目传来的性能承诺、用户评价或第三方内容；这些内容仍要经过事实和合规门禁。

## 7. 安全、权限和可靠性

- 只有 `super_admin` 可创建、批准、撤销和重试推广发布任务。
- 每台执行器拥有独立的 `workerId` 和可轮换密钥。所有接口经 HTTPS 调用，并校验 HMAC-SHA256、时间戳、nonce 和请求体哈希以防重放。
- 素材使用短期签名 URL；下载后校验 SHA-256；QianFanSync 在任务结束或过期后清理临时文件。
- Comic AI 使用 PostgreSQL 持久化任务、租约、Outbox 和审计事实；QianFanSync 继续使用其本地 SQLite 队列与账号资料。
- 发布提交前二次读取取消状态；当本地发生账号登录失效或人工确认时，立即停止自动提交并上报 `needs_attention`。
- 生产环境连接、搜索服务、对象存储和模型服务均从各项目的 `.env` 读取，密钥不出现在任务日志、审计详情或 API 响应中。

### 7.1 COS 临时素材生命周期

推广素材使用当前 COS 的独立前缀，例如 `marketing-delivery/{publishJobId}/`，不复制到 QianFanSync 之外的长期文件系统。每个对象记录任务 ID、内容版本、哈希、创建时间和删除截止时间。

1. 审核中素材保留在现有项目资产或 COS 临时区，直到活动取消或批准。
2. 任务被 QianFanSync 领取后，Comic AI 下发 4 小时有效的下载 URL；执行器校验后写入本地临时目录。
3. 发布成功后保留 COS 文件 72 小时用于人工复核与有限重试，再由 COS 生命周期规则删除。
4. 发布失败或 `needs_attention` 时，最多延长至人工处理窗口结束；超过上限自动删除并要求重新生成或重新下发。
5. PostgreSQL 长期仅保留任务元数据、素材哈希、审核记录、最终发布链接和错误信息，不长期保存推广二进制文件。

业务项目的原始素材、用户创作资产和正式项目导出不受本节删除策略影响；该策略只处理营销发布交付副本。

## 8. 技术实现建议与开源参考

### 8.1 首期最小部署

优先复用当前项目的 TypeScript、PostgreSQL、Redis/BullMQ、对象存储、模型网关、视频生成和 FFmpeg 能力。知识库首期使用 PostgreSQL 表、`pg_trgm` 中文文本检索、可选 `tsvector` 和结构化标签，不引入 `pgvector`。网络调研通过一个按需调用的 `ResearchProvider` 对接已授权搜索 API，并由轻量网页采集 Worker 提取白名单来源的正文、元数据和发布时间。QianFanSync 只新增任务源客户端和状态回传适配层。

| 部署单元 | 首期配置 | 职责与限制 |
| --- | --- | --- |
| 现有 Comic AI 服务 | 沿用现有服务 | 新增营销模块、任务 API、知识库表与审核页；不新增独立应用服务器。 |
| 现有 PostgreSQL / Redis | 沿用现有实例 | 保存文本、来源、任务、审计和租约；不保存营销视频或图片二进制。 |
| 现有 COS | 独立临时前缀 + 生命周期规则 | 存放待发布视频、封面、图集和字幕；发布后自动删除交付副本。 |
| 轻量调研 Worker | 与现有后台 Worker 共用进程或单独 1 个低并发进程 | 搜索结果规范化、允许来源的正文提取、去重和入库；限制为 1 个并发抓取和低频调度。 |
| 轻量营销 Agent | 与现有任务 Worker 共用 | 将“调研 -> 策划 -> 生成 -> 检查”实现为数据库持久化的顺序状态机；模型调用使用现有网关。 |
| QianFanSync 执行器 | 4 核 CPU、8 GB 内存、80 GB SSD | 1 个发布 Worker，至多 1-2 个浏览器会话；保留至少 30 GB 临时下载空间。 |
| 云模型与搜索服务 | 调用现有/外部 API | 文案、图像、视频、转写和网络搜索不在本地推理。 |

QianFanSync 当前发布逻辑依赖本地浏览器会话。执行器应使用可持久登录的 Windows 桌面或带图形会话的 Windows Server，保持稳定出网和人工登录入口；4 核 8 GB 足够承担单账号或少量账号的发布，不承担媒体生成、视频转码集群或热点采集任务。

| 领域 | 推荐技术/项目 | 适配理由 |
| --- | --- | --- |
| 工作流编排 | 现有 PostgreSQL + Outbox + BullMQ；复杂 Agent 流程可参考 [LangGraph](https://github.com/langchain-ai/langgraph) | 首期把 Agent 实现为当前 Worker 的顺序状态机，不引入常驻 Agent 服务；工作流分支增多后再采用 LangGraph 这个库。 |
| 知识库和 RAG | PostgreSQL `pg_trgm` + JSONB + 可选 `tsvector`；后期可评估 [pgvector](https://github.com/pgvector/pgvector) 和 [Qdrant](https://github.com/qdrant/qdrant) | 首期只做中文文本、事实和标签检索；需要语义检索后再增加向量能力。 |
| 文档解析 | [Docling](https://github.com/docling-project/docling) 或 [Unstructured](https://github.com/Unstructured-IO/unstructured) | 可将 PDF、Office、网页和多媒体元数据规范化为知识库文档。 |
| 搜索与采集 | 外部合规搜索 API + 当前后端的轻量 `ResearchProvider` / 内容提取 Worker；后期可评估 [SearXNG](https://github.com/searxng/searxng) | 首期只抓取白名单、允许自动访问的来源；HTTP 提取优先，不用常驻浏览器或大规模爬虫集群。 |
| Agent 原型/运营编排 | 现有任务编排；后期可评估 [Dify](https://github.com/langgenius/dify) 或 [Flowise](https://github.com/FlowiseAI/Flowise) | 首期以后台明确的顺序任务实现，避免额外常驻服务。 |
| 语音、字幕、镜头分析 | [Whisper](https://github.com/openai/whisper)、[PySceneDetect](https://github.com/Breakthrough/PySceneDetect)、现有 FFmpeg | 用于自有或已授权热点样本与项目素材的转写、镜头切分和字幕制作。 |
| 本地模型服务 | [vLLM](https://github.com/vllm-project/vllm) 或 [Ollama](https://github.com/ollama/ollama) | 有私有化文本推理或成本控制需求时，经现有 OpenAI-compatible 网关接入。 |
| 图像/视频工作流 | [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | 适合后期接入可控图像、视频和批量工作流；模型权重与节点的单独许可必须审查。 |
| 质量评测 | [Ragas](https://github.com/explodinggradients/ragas)、[promptfoo](https://github.com/promptfoo/promptfoo) | 建立事实引用、规则命中、提示词和模型回归评测。 |
| 发布执行 | 现有 [QianFanSync](/D:/Claudecode/AIProject/QianFanSync) | 复用本地账号、发布队列与平台适配器；不迁移其数据库或会话。 |

不要在首期引入 Dify、pgvector、Qdrant 或 ComfyUI。推荐先以现有后端任务框架、PostgreSQL 全文检索、轻量采集 Worker 和持久化 Agent 状态机完成闭环；只有在检索质量、内容量或复杂分支需求被真实数据证明后，再引入相应组件。

### 8.2 搜索与热点采集适配层

建立 `ResearchProvider` 和 `TrendSourceProvider` 抽象，避免业务代码直接依赖某个搜索引擎或平台页面。每个 Provider 返回标准化的来源记录：URL、标题、摘要、作者/发布时间（若可获得）、抓取时间、许可/可用性标记、数据质量和内容哈希。轻量内容提取 Worker 只使用普通 HTTP 请求提取允许来源的正文和元数据；遇到必须动态浏览器访问、登录、验证码或禁止自动访问的网站时停止，改为官方 API 或人工链接/素材导入。

平台官方 API、授权数据服务、人工链接导入和允许访问的公开页面可分别实现 Provider。Provider 必须在请求前执行来源 allowlist、每域名限速、内容大小上限、重试上限和用途限制；对于不允许自动采集的站点，仅允许人工导入公开链接或接入官方能力。首期建议单并发、每次活动最多 20 个来源、单页面正文最多 2 MB，采集 Worker 的内存预算控制在 512 MB 到 1 GB。

### 8.3 首期代码实现拆分

Comic AI 在现有 `apps/backend/src/modules` 下新增 `marketing` 领域模块，不创建单独服务。建议按以下职责拆分文件和小服务：

| 模块 | 实现方式 |
| --- | --- |
| `marketing-project.service` | 管理项目、品牌资料、事实来源、素材授权和外部项目同步。 |
| `marketing-knowledge.service` | 使用 PostgreSQL `JSONB` 保存结构化内容，使用 `pg_trgm` 文本索引和可选 `tsvector` 检索；按项目、类型、来源可信度和更新时间排序。 |
| `marketing-research.worker` | 通过 `ResearchProvider` 搜索；用普通 HTTP `fetch` 获取 allowlist 页面；提取标题、正文、发布时间和 canonical URL；入库前去重。 |
| `marketing-agent.worker` | 以数据库状态机顺序执行 `research -> strategy -> copy -> media -> compliance`，每一步调用现有模型网关或现有媒体任务。 |
| `marketing-compliance.service` | 规则检查、事实来源检查、相似度检查和人工复核判定；不通过时阻断后续发布。 |
| `marketing-publish.service` | 创建发布任务、COS 交付清单、签名 URL、租约、幂等键、取消和 QianFanSync 回调处理。 |
| `marketing-admin-api` | 在现有后台鉴权后提供项目、活动、调研、内容、审核、任务和执行器管理接口。 |

数据库迁移只新增营销领域表及必要索引：`marketing_projects`、`marketing_brand_profiles`、`marketing_sources`、`marketing_knowledge_documents`、`marketing_knowledge_segments`、`marketing_research_briefs`、`marketing_trend_patterns`、`marketing_content_variants`、`marketing_publish_jobs`、`marketing_publish_deliveries`、`marketing_executors` 和 `marketing_audit_events`。启用 PostgreSQL `pg_trgm` 扩展并为知识标题、正文和标签建立 GIN 索引。营销任务属于后台内部任务，不创建用户积分预留或扣减记录。

轻量采集 Worker 使用现有 Node 运行时和 BullMQ，不启动浏览器。HTTP 请求的超时、最大响应体、每域名限速和允许域名均从配置读取。页面正文可使用 `@mozilla/readability` 加 `jsdom`，或使用更小的 HTML 文本提取实现；无法普通 HTTP 提取的页面不升级为绕过式浏览器采集。

营销 Agent 不是独立的聊天服务。它是一个可恢复的任务记录，输入为活动要求与检索到的知识，输出为结构化策略和内容草稿。每一步都把输入摘要、模型版本、来源 ID、输出和状态写入数据库，因此任务失败可从上一步恢复，人工审核也能查看依据。

### 8.4 QianFanSync Connector 实现

QianFanSync 在现有 Python Flask 后端中新增一个 Comic AI 任务源客户端，而不改动其平台适配器的业务边界。实现步骤如下：

1. 在本地配置中保存 `COMIC_AI_BASE_URL`、`COMIC_AI_WORKER_ID`、签名密钥引用、轮询间隔和本地账号引用映射；不保存 Comic AI 数据库凭据。
2. 启动一个低频后台循环，调用 `capabilities` 注册执行器，并调用 `publish-jobs/next` 领取匹配账号的任务。
3. 下载 COS 临时 URL 到任务专属目录，校验 SHA-256、时长、文件大小和封面尺寸；校验失败立即回传失败事件。
4. 将已验证任务映射为现有 `PublishTask.payload`，复用 QianFanSync 已有 `TaskQueue` 和抖音/其他平台的 `publish_video` 实现。
5. 通过队列状态回调向 Comic AI 回传 `ack`、心跳、运行状态、发布 URL、平台内容 ID 或 `needs_attention`。
6. 到达终态后删除本地临时目录；Comic AI 的 COS 生命周期规则负责删除交付副本。

QianFanSync 单台 4 核 8 GB 执行器首期只开启 1 个发布 Worker。单账号强制串行，最多保留 1-2 个浏览器会话，避免内存竞争和同账号重复提交。

## 9. 分阶段实施

### Phase 0: 架构与合规基线

- 冻结领域模型、状态机、`super_admin` 权限和 QianFanSync API 契约。
- 定义内容披露、版权、事实来源、热点分析和人工审核的不可绕过规则。
- 建立接口签名、幂等、租约、审计和错误码规范。

### Phase 1: 多项目营销活动与人工发布

- 新建多项目、品牌资料、活动、内容版本和审核记录。
- 复用现有模型与媒体能力生成并导出推广包。
- 不接入自动发布，使用人工下载/上传验证内容与审核流程。

### Phase 2: 轻量知识库、调研和质量门禁

- 接入项目事实库、平台规则库和品牌表达库。
- 引入轻量采集 Worker、网络调研来源记录、引用展示、事实检查和广告/版权风险检查。
- 使用 PostgreSQL 全文检索、标签和来源权重建立检索基线。

### Phase 3: 热点洞察和原创改编

- 接入合规的趋势来源和人工链接导入。
- 建立转写、OCR、镜头节奏、结构模式和相似度分析。
- 基于趋势模式生成原创内容大纲，增加跨项目和跨平台重复度检查。

### Phase 4: QianFanSync Connector

- 当前项目实现任务领取、确认、续约、状态和取消接口。
- QianFanSync 实现 Comic AI 任务源客户端、临时素材下载、账号引用映射和状态回传。
- 部署到一台 4 核 8 GB 的独立 Windows 执行器；首先只支持一个官方抖音账号和人工确认路径，再逐平台扩展。

### Phase 5: 表现回流与策略优化

- 回传可获得的发布结果和表现指标。
- 将人工复盘、内容版本、平台、受众和时间窗口关联到效果数据。
- 推荐下轮选题、内容形式和发布节奏，但不把规避审核或伪装推广作为优化目标。

## 10. 验收标准

1. 能创建非漫画项目并产出带来源引用的多平台内容策略。
2. 每个发布内容均可追溯到项目事实、调研来源、审核人和素材版本。
3. 未通过事实、版权、平台规则或披露检查的内容无法进入发布任务。
4. QianFanSync 可通过签名 API 领取一条任务、下载校验素材、发布并回传链接；重复请求不重复发布。
5. Comic AI 从不保存 QianFanSync 的 Cookie 或平台密码；QianFanSync 不访问 Comic AI 数据库。
6. 热点学习只产生结构化洞察与原创内容建议，不能复用未授权原始作品。
7. 发布失败、账号失效和人工确认均在后台可见、可审计且可安全恢复。

## 11. 主要风险与决策

| 风险 | 决策 |
| --- | --- |
| 平台规则变化和账号限制 | 以官方能力为优先，Provider 和执行器按平台隔离；失败进入人工处置。 |
| 内容版权与热点复制 | 保存来源与授权状态，只提取抽象模式，实施相似度和人工审核。 |
| 模型幻觉和夸大宣传 | 项目事实库优先，所有事实需可追溯；高风险结论不自动发布。 |
| 搜索数据质量不稳定 | 多来源记录、可信度评分、时间衰减和人工确认。 |
| 双系统分布式故障 | 使用 HMAC、幂等键、租约、心跳、签名素材 URL 和终态单向迁移。 |
| 过早引入过多基础设施 | 首期复用现有队列和 PostgreSQL 全文检索，按观测指标逐步增加组件。 |

## 12. 后续待确认事项

1. 目标平台的首批顺序、每个账号是否允许定时发布，以及是否具备官方开放平台授权。
2. 可使用的搜索数据源、热点数据源及其授权范围。
3. 每类项目的商业披露、行业合规和素材版权审批责任人。
4. 需要回收的效果指标，以及这些指标的获取方式是否符合各平台能力与规则。
5. QianFanSync 执行器是运营人员桌面机、专用 Windows 服务器，还是两者并存。

## 13. 运营要求与首期范围

### 13.1 活动目标和效果指标

每个 `marketing_campaign` 必须有一个主目标，不能只使用“吸引用户”这类不可衡量描述。可选目标包括播放、完播、互动、关注、主页访问、私信、留资和允许归因的转化。活动必须同时定义观察窗口、目标值和允许的内容形式。

首期至少记录发布成功率、播放、完播、点赞、评论、收藏/转发（平台可得时）、主页访问和最终发布链接。无法通过官方能力稳定获取的指标，标记为“不可用”或由运营人员人工录入，不能由模型推断。

### 13.2 平台能力清单

维护一份受版本控制的 `platform_capability_profile`，声明每个平台及账号是否支持视频、图文、定时发布、话题、合集、音乐、主页跳转、商品/小程序、内容声明和效果数据回收。内容生成、审核表单和 QianFanSync 派发都以该清单为约束，禁止下发执行器不支持的字段。

平台能力或规则更新后，所有尚未发布的内容应重新执行规则检查；不符合新规则的任务自动转为 `manual_review_required`。

### 13.3 调研来源与网页安全

来源白名单需记录域名、允许用途、抓取频率、最大页面大小、是否允许正文保存和人工负责人。网页正文、标题和评论均属于不可信数据：采集 Worker 只能将它们作为引用资料传给模型，不能让其中的指令改变系统提示、审批规则、工具调用或发布目标。Agent 的系统规则、项目事实和平台合规规则始终拥有更高优先级。

搜索和热点来源失效、被撤销或被判定不可信后，关联知识段应立即停止检索；依赖这些段落的草稿和待发布任务需要标记为 `stale` 并进入复核。

### 13.4 审核、原创与披露责任

审核记录至少拆分为：项目事实确认、素材/版权确认、商业和 AI 内容披露确认、最终发布批准。`super_admin` 负责最终批准，但每一项都应保存操作人、时间、依据版本和决定。

原创检查除文案相似度外，必须覆盖封面、镜头结构、配乐、角色、商标、第三方素材和剧情表达。发现无法判断的高风险内容时，系统只能阻断或要求人工处理，不能以同义词替换或隐藏标识作为解决方法。

### 13.5 生成成本和配额

营销任务不向用户计费，但系统仍应记录模型调用量、媒体时长、失败次数和活动成本。每个活动配置生成次数上限、视频时长上限、单日任务上限和人工确认阈值；Agent 无法自行突破这些上限。重试应复用请求幂等键，避免模型调用和视频生成被重复提交。

### 13.6 QianFanSync 执行器运行要求

执行器需要上报心跳、软件版本、账号可用状态、最后成功发布时间和磁盘可用空间。Comic AI 在执行器离线、账号登录失效或磁盘空间不足时停止派发新任务并发出告警。

单账号严格串行。执行器本地仅保留发布所需的临时目录；账号配置应加密备份，恢复后重新注册并确认账号引用映射。发布失败后的重试必须由后台显式创建新尝试，不允许执行器无边界重复提交。

### 13.7 COS 生命周期与可恢复性

每个 COS 交付对象、发布任务、QianFanSync 本地目录和审计事件使用同一 `publishJobId` 关联。删除流程必须检查任务终态、审核窗口、执行器确认和是否存在活动的人工复核；任何一个条件不满足都延后删除。

COS 删除、执行器下载、发布成功和回调均可能发生重试或乱序，因此后台以不可变事件和终态单向迁移为准。对象丢失时不能盲目重发平台发布，而是重新创建交付副本并要求执行器确认下载。

### 13.8 首期最小闭环

第一阶段只验收一个可人工控制的闭环：

```text
一个推广项目
  -> 一次活动和不超过 5 个合规来源
  -> 三个内容版本
  -> 人工审核
  -> 一个抖音账号
  -> QianFanSync 发布
  -> 回写发布链接和基础表现数据
```

首期不做多账号批量发布、自动化全网热点抓取、复杂 A/B 分流、独立向量库或本地模型。每增加一种平台、来源、内容形态或自动化决策，都必须单独通过相同闭环验收。

## 14. 上线前必须闭合的链路

| 未闭合点 | 必须补齐的设计 | 验收结果 |
| --- | --- | --- |
| 项目事实、授权或素材变更 | 来源版本和撤销事件使关联草稿/任务变为 `stale`；未复核不得发布。 | 撤销素材后没有待发布任务仍可下载或提交。 |
| 平台规则更新 | 平台能力版本化，重新扫描未发布内容。 | 已排期任务在规则变化后能自动拦截。 |
| 网页提示注入与虚假来源 | 网页内容仅作低优先级资料；固定系统规则和来源审计不可被网页覆盖。 | 恶意网页文本不能改变模型目标或触发工具调用。 |
| QianFanSync 离线和租约过期 | 心跳、租约到期、任务重新可领取和执行器告警。 | 执行器断电后任务不丢失、不重复发布。 |
| 回调重复、乱序或丢失 | 回调事件使用事件 ID 幂等；任务终态单向迁移；可查询执行器状态。 | 相同回调多次发送只产生一个结果。 |
| 定时任务撤销竞态 | 发布前读取取消状态，并在后台原子冻结任务。 | 撤销与执行并发时，不会产生未授权发布。 |
| 平台数据无法取得 | 指标字段区分真实回传、人工录入和不可用。 | 看板不展示模型虚构的效果数据。 |
| 内容效果无法归因 | 活动、内容版本、账号、发布时间和允许的跳转/标记关联。 | 能比较不同原创版本，不把自然波动当作模型效果。 |
| 失败处理无负责人 | `needs_attention` 需指定处理人、截止时间和处理结果。 | 登录失效等异常不会无限停留在队列。 |
| 监控和审计缺失 | 为任务创建、派发、下载、发布、回调、删除和人工操作记录结构化事件。 | 可按活动、任务和账号完整还原一次发布。 |

上述链路闭合后，才进入多平台、多账号、自动热点洞察和更复杂 Agent 分支的扩展阶段。

## 15. 落地契约与待准入能力

### 15.1 抖音热点数据来源结论

2026-08-15 对抖音开放平台公开文档入口进行了验证：[开放平台 OpenAPI 列表](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/) 包含内容能力、搜索能力和数据开放服务导航；[外部视频数据能力入口](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/data-ability/data-external-item/) 与 [视频列表能力入口](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/video-list/) 可访问。公开页面未能确认一个面向任意公开作品、可用于全站热点发现或榜单抓取的通用 API。因此不能把“自动发现抖音热点”列为首期承诺。

`DouyinTrendSource` 分阶段实现：

| 阶段 | 可用来源 | 是否可作为首期验收 |
| --- | --- | --- |
| V1 | 运营人员导入公开链接及其标题/话题/截图/转写；项目自有或已授权样本；已导出的授权数据。 | 是 |
| V2 | 抖音官方应用在获得所需 scope 后取得的授权账号自身内容/数据。 | 仅在控制台、scope、数据字段和使用限制验证后启用 |
| V3 | 与已授权的第三方趋势数据服务签署合同后的 API 数据。 | 仅在合同、字段、用途、保存期限和调用限额写入 Provider 配置后启用 |

每个 V2/V3 Provider 上线前必须提交“能力准入记录”：供应商/应用、官方文档 URL、scope、允许访问的数据对象、调用限额、数据保存期限、商业使用限制、负责人和失效日期。未通过准入的 Provider 只能作为人工链接导入，不能自动抓取。

### 15.2 QianFanSync 结果标准化

现有 QianFanSync `TaskQueue` 将执行成功与失败持久化，但发布函数的返回值不会自动填充 `publish_url`。Connector 必须新增 `PublishResultNormalizer`，不能只依赖状态回调。

每个平台适配器完成后先转换为统一结果：

```json
{
  "platformContentId": "string-or-null",
  "publishUrl": "https-url-or-null",
  "publishedAt": "RFC3339-or-null",
  "status": "succeeded|failed|needs_attention",
  "failureCode": "stable-code-or-null",
  "failureMessage": "redacted-message-or-null",
  "rawResultRef": "local-redacted-reference-or-null"
}
```

只有得到该标准结果后，Connector 才能更新本地 `PublishTask`、持久化 `publish_url` 并发送终态事件。平台未返回公开链接时允许 `publishUrl=null`，但必须携带可追查的内容 ID 或明确的 `result_unavailable` 原因，不能伪造成功链接。

### 15.3 v1 API、签名和事件契约

Comic AI 与 QianFanSync 共享一个版本化的 OpenAPI/JSON Schema 文件；任何一端升级前必须跑 Node 与 Python 的契约测试。所有请求使用以下 Header：

| Header | 说明 |
| --- | --- |
| `X-Marketing-Version` | 固定 `v1`。 |
| `X-Marketing-Worker-Id` | 已注册执行器 ID。 |
| `X-Marketing-Key-Id` | 当前签名密钥 ID，用于服务端选择和轮换密钥。 |
| `X-Marketing-Timestamp` | UTC Unix 毫秒时间戳。 |
| `X-Marketing-Nonce` | UUID；服务端保存 10 分钟以拒绝重放。 |
| `X-Marketing-Content-SHA256` | 原始请求体的十六进制 SHA-256；无请求体时为空字符串哈希。 |
| `X-Marketing-Signature` | `v1=<base64url(HMAC-SHA256)>`。 |

签名原文固定为 `v1\nMETHOD\nPATH_WITH_QUERY\nWORKER_ID\nKEY_ID\nTIMESTAMP\nNONCE\nBODY_SHA256`。服务端拒绝超过 5 分钟时钟偏差、重复 nonce、未知 worker、错误版本和错误签名。密钥按 `keyId` 轮换，旧密钥在明确过渡窗口后失效；日志只记录 `keyId`，不记录签名原文或密钥。

`publish-jobs/next`、`ack`、`heartbeat` 和 `events` 的请求/响应必须包含 `jobId`、`attemptId`、`eventId`、`occurredAt`、`status`、`idempotencyKey` 和 schema 版本。终态事件以 `eventId` 幂等，状态只能前进；回调失败按指数退避重试，超过上限转为 `callback_pending` 并在后台告警。

### 15.4 排期、撤销和 COS URL 语义

首期的排期由 Comic AI 作为唯一时钟源管理，所有时间以 UTC 存储、在管理端按 `Asia/Shanghai` 展示。QianFanSync 不保存跨天定时任务，也不自行判断发布日期。

当 `scheduledAt - 15 minutes` 到达时，Comic AI 才允许匹配执行器领取任务；任务携带 `notBefore`、`executeDeadline` 和 4 小时素材 URL。QianFanSync 只能在该窗口内执行，并在提交平台前读取一次取消状态。管理员在任务被领取前可撤销；领取后到外部提交前撤销会使执行器终止；一旦外部提交已开始，任务进入 `result_unknown` 或等待平台结果，不能盲目重发。

平台原生“预约发布”能力不属于首期功能，只有在 `platform_capability_profile` 和该平台适配器完成验证后才允许使用。

### 15.5 采集出网与外部模型数据边界

`ResearchProvider` 只允许 HTTPS、已批准域名和明确 Content-Type（HTML、JSON、文本）。每次重定向都重新校验主机名与 DNS 结果，拒绝 IP 字面量、回环、私网、链路本地、保留地址和非标准端口；最大重定向 3 次、最大响应 2 MB、无 Cookie、无认证头、无内网代理。

项目资料在发送到外部搜索、模型或趋势数据 Provider 前分为 `public`、`internal` 和 `restricted`：仅 `public` 或经负责人明确批准的最小化字段可外发。`internal` 与 `restricted` 内容只能由本地规则处理、人工摘要，或发送到已经单独批准的数据处理 Provider。每次外发记录 Provider、字段分类、内容哈希和批准依据。

### 15.6 效果归因和实验记录

`marketing_content_variants` 需要新增稳定 `trackingKey`；每个发布版本、账号、平台和发布时间唯一。仅在平台允许的主页、合集、小程序、商品或官方链接能力中使用相应的标记/跳转参数。

指标记录包含 `metricSource`（`platform_api`、`manual`、`executor_observed`、`unavailable`）、`observedAt`、观察窗口、原始数值和人工修订审计。比较内容版本时，只在相同平台、账号、目标和观察窗口内比较；样本不足时展示“无结论”，不把自然波动解释为模型效果。

### 15.7 第三方组件准入

新增任何开源组件或模型前，必须建立组件准入记录：版本、许可证、商业使用限制、模型权重许可、维护活跃度、已知漏洞、数据处理位置、升级策略、移除方案和负责人。Dify、LangGraph、RAGFlow、FastGPT、SearXNG、ComfyUI、模型权重和第三方 Node/Python 包都适用该流程。

### 15.8 首期契约测试与故障验收

首期自动化测试至少覆盖：

1. Node/Python 对同一请求生成一致 HMAC，且签名错误、nonce 重放、时钟偏差和已撤销密钥均被拒绝。
2. `next -> ack -> running -> succeeded`、`needs_attention`、取消、租约到期、回调重复/乱序和执行器断电恢复。
3. QianFanSync 平台返回有/无链接、失败、未知结果时的 `PublishResultNormalizer` 映射。
4. COS URL 过期、SHA-256 不匹配、对象丢失和清理延迟时不产生重复发布。
5. 私网 URL、重定向到私网、超大响应、非允许 Content-Type 和恶意网页提示文本均被采集 Worker 拒绝或隔离。
6. 来源撤销、项目事实变更和平台规则变更后，待发布内容会变为 `stale` 并阻止执行。
