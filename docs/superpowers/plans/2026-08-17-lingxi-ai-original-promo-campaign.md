# 灵曦AI原创宣传图三联画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成三张突出灵曦AI三模式创作、故事上下文连续性和数字剧组能力的原创竖版宣传图。

**Architecture:** 内置 ImageGen 只负责生成无文字、无品牌标识的电影级主视觉底图；HTML/CSS 负责准确呈现当前羽翼 Logo、中文标题和产品文案；gstack 负责 1024 × 1536 原尺寸导出与视觉检查。三张图共享品牌排版系统，但分别采用三空间共生、连续匹配剪辑和数字摄影棚构图。

**Tech Stack:** built-in ImageGen、HTML/CSS、gstack browse、PowerShell/System.Drawing

## Global Constraints

- 最终输出为三张 1024 × 1536 PNG。
- 使用 `apps/web/assets/brand/lingxi-ai-favicon.png`，禁止使用旧 SVG 图标或生成式仿制 Logo。
- 不使用参考图的五段手机卡片、连续箭头、价格框、模型名称横条和底部四宫格功能说明。
- 不加入价格、无限并发、具体模型名称、速度数字或效果保证。
- ImageGen 底图不生成中文、Logo、品牌字样或可读 UI 文本。
- 保留现有宣传图，所有新资产使用 `v3` 文件名。

---

### Task 1: 生成三张原创主视觉底图

**Files:**
- Create: `artifacts/promo/lingxi-ai-v3-background-three-modes.png`
- Create: `artifacts/promo/lingxi-ai-v3-background-story-memory.png`
- Create: `artifacts/promo/lingxi-ai-v3-background-digital-studio.png`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-08-17-lingxi-ai-original-promo-campaign-design.md`
- Produces: 三张无文字、无 Logo、顶部留有标题安全区的 1024 × 1536 PNG 底图。

- [ ] **Step 1: 生成“三种创作方式”底图**

  使用内置 ImageGen，分类为 `ads-marketing`。中央故事核心由剧本文字纹理、角色轮廓和电影光束构成；外围分别展开 Agent 星图、连续剧工作台和自由媒体生成空间。三个空间必须共生于同一场景，禁止三列卡片、粗箭头、手机边框、文字和 Logo。

- [ ] **Step 2: 生成“故事有记忆”底图**

  使用内置 ImageGen，分类为 `ads-marketing`。同一名古风女主在一幅连续电影画面中依次呈现为剧本文字中的轮廓、角色设定、分镜草图和最终成片人物；面部、发型、服装、月夜场景和关键发簪保持一致。使用一条克制的发光记忆线连接介质，禁止流程卡、粗箭头、文字和 Logo。

- [ ] **Step 3: 生成“数字摄影棚”底图**

  使用内置 ImageGen，分类为 `ads-marketing`。俯视未来摄影棚从中央创作画布展开，场记板代表剧本，角色和场景资产成为布景，3D 导演台控制机位，分镜显示在监视器上，剪辑时间线承接成片。整体像真实可工作的片场系统，禁止普通节点网络、文字和 Logo。

- [ ] **Step 4: 检查并复制底图**

  用 `view_image` 检查三张图的主体、构图、顶部标题安全区、无文字和无伪 Logo。将选中结果从 `$CODEX_HOME/generated_images/` 复制到上述三个 workspace 路径，不覆盖 V1/V2 文件。

### Task 2: 建立原创广告排版系统

**Files:**
- Create: `artifacts/promo/lingxi-ai-posters-v3-20260817.html`

**Interfaces:**
- Consumes: Task 1 的三张底图和 `apps/web/assets/brand/lingxi-ai-favicon.png`
- Produces: 可由 gstack 分别选择 `#v3-three-modes`、`#v3-story-memory`、`#v3-digital-studio` 导出的三张海报 DOM。

- [ ] **Step 1: 创建 1024 × 1536 三海报页面**

  每张海报使用独立 `<section>`，背景对应 Task 1 的 PNG；共用 `.brand-lockup`、`.hero-copy`、`.proof-line` 和 `.campaign-signature`。主体不增加功能卡片。

- [ ] **Step 2: 排入准确品牌和广告文案**

  海报一：`一个故事，三种创作方式`、`Agent 替你规划｜工作流连续生产｜自由生成随时开做`、`同一个项目，同一份创作上下文`。

  海报二：`故事有记忆`、`角色、场景、分镜和结果，沿着同一份上下文继续生长`、`不是每一镜重新开始`。

  海报三：`把整个剧组，装进一张画布`、`Agent 调度创作，资产进入镜头，分镜推进成片`、`导演台预演｜批量生产｜剪映草稿导出`。

- [ ] **Step 3: 设置缩略图可读性**

  主标题字号不低于 60px，使用实色浅色文字、暗部遮罩和明确阴影；副标题不低于 20px。Logo 使用 96px 以上的真实羽翼 PNG，并与品牌名组成固定锁定区。

### Task 3: 导出并验证三张终稿

**Files:**
- Create: `artifacts/promo/lingxi-ai-promo-v3-01-three-modes.png`
- Create: `artifacts/promo/lingxi-ai-promo-v3-02-story-memory.png`
- Create: `artifacts/promo/lingxi-ai-promo-v3-03-digital-studio.png`

**Interfaces:**
- Consumes: Task 2 的三个海报 DOM。
- Produces: 三张可对外使用的 1024 × 1536 PNG。

- [ ] **Step 1: 使用 gstack 原尺寸导出**

  打开 `file:///D:/project/code/comic_ai_fork/comic_ai/artifacts/promo/lingxi-ai-posters-v3-20260817.html`，设置足以容纳 1024 × 1536 海报的 viewport，然后按三个 section selector 分别截图到目标路径。

- [ ] **Step 2: 检查浏览器错误**

  运行 `console --errors`。预期结果为 `(no console errors)`；若资源 404，修正相对路径后重新导出。

- [ ] **Step 3: 原尺寸视觉检查**

  用 `view_image` 逐张检查真实羽翼 Logo、标题文字、人物一致性、画面裁切、对比度和是否意外出现伪文字。任何问题每次只做一个定向修正并重新检查。

- [ ] **Step 4: 检查尺寸和备份**

  用 `System.Drawing.Image::FromFile()` 验证三张均为 1024 × 1536，并复制终稿与 HTML 到 `C:/Users/索志朋/.codex/visualizations/2026/08/17/01a00ed0-f41f-72e2-8c48-2a0dd0741665/`。

- [ ] **Step 5: 提交交付清单**

  报告三张终稿的绝对路径、最终 ImageGen 提示词摘要、使用的内置模式，以及 gstack 的尺寸和控制台检查结果。

