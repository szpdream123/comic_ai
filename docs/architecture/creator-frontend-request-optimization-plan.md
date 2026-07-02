# 前台用户端请求性能优化方案

目标：让用户进入前台后“先看到东西，再悄悄补数据”，把绝大多数可见请求压到 1000ms 内，避免页面因非首屏接口阻塞。

## 结论

当前前台不是完全串行，已经有一部分并发和 lazy load。真正拖慢体验的主要是三类：

1. 首屏流程里等待了非首屏接口，比如会员状态、项目详情重载、剧集补充数据。
2. 一些接口返回粒度过大，详情页和工作台一次拿了太多数据。
3. 静态或低频数据每次都重新请求，缓存层还不够完整。

## 现有可复用机制

- `apps/web/src/features/production-workbench/index.js` 已经有 `Promise.all`、`Promise.allSettled`、`runLazyWorkbenchTask`、`assetLibraryCache`、`assetLibraryInFlight`。
- `apps/web/src/shared/creator-api.js` 已经有请求去重 `dedupeKey`，以及 `fresh` 参数支持。
- 这些机制不要推倒重做，应该继续扩展。

## 当前需要优化的前台请求

| 区域 | 当前请求 | 问题 | 建议 |
|---|---|---|---|
| 登录壳层 | `/api/auth/session` | 必需 | 保留同步，但要尽量轻量 |
| 前台壳层 | `/api/creator/state` | 返回面太大，常带出不必要状态 | 拆成 shell state + heavy state，首屏只拿最小壳层数据 |
| 首屏刷新 | `/api/membership/status` | `refresh()` 里先等它再继续 | 改成后台静默刷新，不阻塞首屏渲染 |
| 项目列表 | `/api/creator/projects` | 页面切换时重复拉完整列表 | 列表页只保留当前页，支持缓存和静默刷新 |
| 项目详情 | `/api/creator/projects/:id/detail`、`/api/projects/:id/detail` | 一次加载资产、版本、引用、镜头、剧集、导出、脚本，太重 | 增加 `view=summary|detail|full`，默认 summary |
| 项目导出历史 | `/api/projects/:id/export-tasks` | 只在少数区域需要 | 改成进入导出面板后静默加载 |
| 项目统计 | `/api/creator/projects/:id/stats` | 只在 stats 区域用 | 仅 stats 面板请求，默认不拉 |
| 项目成员 | `/api/creator/projects/:id/members` | 不是所有页都需要 | 进入成员页才请求，可缓存短 TTL |
| 项目脚本/分节 | `/api/creator/projects/:id/script-reader-sections`、`/scripts` | 多个入口会重复触发 | 页面级缓存，编辑后再失效 |
| 剧集工作台 | `/api/episodes/:id/workbench` | 仍可能返回过多上下文 | 默认只返回工作台壳层、权限、积分、必要导航 |
| 分镜列表 | `/api/episodes/:id/storyboards` | 首屏不一定全要 | 首屏只请求当前可见集/首屏分页，剩余静默补 |
| 剧集素材 | `/api/episodes/:id/assets` | 角色/场景/道具三类都拉满 | 默认只拉当前 tab，其他类目按需懒加载 |
| 生成配置 | `/api/episodes/:id/generation-config`、`/api/generation-config` | 配置类数据变化低，但请求频率高 | 本地缓存 + 后台刷新，`fresh=true` 只给手动刷新用 |
| 批量模型选项 | `/api/episodes/:id/batch-image-model-options`、`/api/batch-image-model-options` | 低频静态数据 | 缓存到内存或 sessionStorage |
| 生成任务 | `/api/episodes/:id/generation-tasks` | 首屏不一定需要历史任务全量 | 只在进入“任务/历史”区域后拉取 |
| 资产对话历史 | `/api/episodes/:id/assets/:assetId/conversation`、`/storyboards/:storyboardId/conversation` | 只服务当前选中项 | 选中后再请求，切换时静默补 |
| 团队数据 | `/api/creator/team/overview`、`/members`、`/team/assignable-resources` | 团队页才用 | 仅在团队页请求，支持分页缓存 |
| 画布数据 | `/api/creator/canvas-projects`、`/projects/:id/canvas` | 工具页才用 | 工具页加载，不要跟项目首页绑定 |
| 个人素材库 | `/api/creator/assets/library`、`/api/creator/library/assets`、`/api/creator/media-library*` | 体积和筛选组合容易重 | 先渲染缓存结果，再后台刷新 |
| 会员/收费 | `/api/billing/packages`、`/api/membership/plans`、`/api/membership/status` | 低频静态数据 | 进入价格/会员入口才拉，带 TTL 缓存 |
| 社区页 | `/api/community` | 不是首屏核心 | 完全静默加载，失败回退本地缓存 |

## 推荐实现方式

### 1. 首屏只拿壳层数据

- `refresh()` 里不要先 `await refreshMembershipStatusFromApi()` 再继续。
- `creator state`、`project detail`、`episode workbench` 都拆成“壳层”和“重数据”两段。
- 首屏先 render，随后静默补数据。

### 2. 字段级拆分

下面是按当前代码观察出的“首屏必需字段”和“可延后字段”。这里的“可延后”不是“没用”，而是“这次不挡首屏，后面静默补”。

为了避免把“真的没用”和“只是晚一点才用”混在一起，字段分三类：

- `当前必需`：首屏或当前视图直接消费。
- `当前未用`：当前前台路径里没有消费，至少这次渲染不需要。
- `后续才用`：同一流程后面的 tab、面板、弹窗、展开区会用到，适合静默加载或按需加载。

如果一个字段当前页面任何路径都没消费，就不叫“延后”，直接归到 `当前未用`。

#### `/api/creator/state`

- 当前必需：`project` 的当前 id/name/phase/cover、`script` 的当前 id/title、`creditBalance` 及冻结相关余额字段。
- 当前未用：`assetReview`、`assetCandidates`、`calibration`、`exportPreview`。
- 后续才用：`shots`、`projectDetail`、`exportHistory`。

#### `/api/creator/projects`

- 当前必需：`id`、`name`、`aspectRatio`、`phase/status`、`coverImageUrl`、`createdAt`，以及列表卡片要显示的脚本标题/名称。
- 当前未用：`script` 全量对象、`scripts[]` 全量对象。
- 后续才用：详情页才用的完整脚本、项目深层状态。

#### `/api/creator/projects/:id/detail` 和 `/api/projects/:id/detail`

- 当前必需：`project.id/name/phase/status/coverImageUrl`，概览页要看的 `episodes[].id/title/sequence/status/previewUrl/storyboardCount`，以及概览卡片要看的 `assetSummary`。
- 当前未用：`assetsByType` 全量、`shots` 全量、`exportHistory`、`scripts` 全量、每个 shot 的 `imageVersions/videoVersions/references`。
- 后续才用：进入资产、分镜、导出、脚本管理面板时再补。

#### `/api/episodes/:id/workbench`

- 当前必需：`episode.episodeId/title/sequence/status`、`project.projectId/name/status`、`navigation`、`permissions`、`defaultScopeMode`、`creditBalance`。
- 当前未用：非当前 tab 需要的 `assetsByType` 分类、生成历史、对话历史、任务历史的完整数组。
- 后续才用：生成配置的重字段、资产对话历史、生成任务历史、分镜展开详情。

### 字段判断口径

- `当前必需` 是当前这次渲染必须同步拿到的字段。
- `当前未用` 是当前前台路径里根本没消费的字段，可以直接不进首屏响应。
- `后续才用` 是当前页面后面某个 tab、面板、弹窗会消费的字段，适合静默加载，不适合挡首屏。

#### 低频配置接口

- `getMembershipPlans`、`getMembershipStatus`、`getBillingPackages`：只有会员面板、价格面板相关字段是当前必需，其余是后续页面才用。
- `getProjectStyles`、`getBatchImageStyles`、`getStoryboardPromptPackages`：当前只要下拉菜单、卡片展示、生成选项字段，其余可认为当前未用。
- `getLibraryAssets`、`getPersonalMediaLibrary`：列表页只保留卡片字段，详情/元数据/原始版本信息后续才用。
- `getCommunityBoard`：列表摘要、点赞数、评论计数可先回，深层回复和展开内容后续才用。

### 3. 低频接口本地缓存

建议做一层前端缓存，优先级如下：

- 内存缓存：当前页面内重复打开，立刻复用。
- `sessionStorage`：同一会话内的配置类数据。
- `localStorage`：用户偏好、最近一次列表页、社区缓存。

适合缓存的接口：

- `getMembershipPlans`
- `getMembershipStatus`
- `getBillingPackages`
- `getProjectStyles`
- `getBatchImageStyles`
- `getStoryboardPromptPackages`
- `getCanvasProjects`
- `getWorkspaceScripts`
- `getCommunityBoard`
- `getProjects`
- `getProjectDetail`
- `getEpisodeWorkbench`
- `getLibraryAssets`

### 4. 静默加载优先级

以下数据不应该挡首屏：

- 导出历史
- 项目统计
- 项目成员
- 剧集生成历史
- 资产对话历史
- 团队可分配资源
- 社区帖子
- 个人素材库 summary 之外的列表

### 5. 并发加载

已经在做的并发要保留，并继续扩大：

- 剧集进入时：工作台上下文 + 分镜列表并发。
- 个人素材库：summary + list 并发。
- 会员页：plans + status 并发。
- 工具页：画布项目 + 生成配置并发。

### 6. 只在需要时拉全量

不要把 `pageSize=200/500` 变成默认习惯。

- 列表页只拿当前页。
- 弹窗只拿当前可见选项。
- 选中某个卡片后，再拉该卡片的重数据。
- 生成配置的 `fresh=true` 只保留给手动刷新或 mutation 后刷新。

## 不影响正常功能的约束

- 不删老接口。
- 不改现有字段语义。
- 新增 `view`、`include`、`summary` 之类参数时，老调用必须继续兼容。
- 所有缓存都要在写操作后失效，避免脏数据。
- 生成/提交类接口仍然保留原有 ack 流程，只是把“等待完成”改成“先返回任务 id，再后台继续”。

## 推荐落地顺序

1. 把 `refresh()` 里的会员状态改成静默刷新。
2. 给 `getProjectDetail` 和 `getEpisodeWorkbench` 加 summary 模式。
3. 给会员、配置、风格、社区、素材库加 TTL 缓存。
4. 把项目详情、剧集工作台里的重数据改成进入面板后再请求。
5. 对分页列表加页面缓存和静默刷新。

## 验收标准

- 首屏不再等待会员状态、导出历史、社区、风格包、素材库等非核心数据。
- 项目详情、剧集工作台首屏先出现壳层，再逐步补全。
- 同一个会话内重复进入同一页面，缓存能直接命中。
- 所有读接口都要控制在 1000ms 目标内，若是生成/任务类接口，则必须在 1000ms 内返回受理结果。

## 依据

- `apps/web/app.js`
- `apps/web/src/shared/creator-api.js`
- `apps/web/src/features/production-workbench/index.js`
- `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- `apps/backend/src/modules/project/creator-application.service.ts`
