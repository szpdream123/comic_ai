# AI 智能分镜生成流程设计

> Date: 2026-06-06
> Status: Design only
> Scope: 单集弹框点击「AI 智能分镜」后，结合后台分镜提示词、角色提示词、场景提示词，请求文本模型生成结构化预览，并在用户确认后创建分镜。
> Out of scope: 本文不修改代码，不实现真实 DeepSeek 调用，不改变后台提示词管理页面。

## 1. 目标

用户在项目工作台的单集弹框中输入原文，并选择：

- 题材看点
- 情绪看点
- 镜头看点

点击「AI 智能分镜」后，前端把原文和配置 ID 交给后端。后端读取后台管理中的：

- 分镜提示词包：题材包、情绪包、镜头包、输出格式包、通用禁忌包
- 角色提示词模板：角色抽取、角色合并、角色设定表
- 场景提示词模板：场景拆分、场景要素抽取、场景库合并、场景详情、场景图提示词

后端按固定流程组装提示词，第一次请求 DeepSeek 文本模型生成【剧本】，并把剧本回显到同一个前端预览页。随后后端无感触发第二轮：根据【剧本】和后台提示词模板组装提示词，再请求 DeepSeek 文本模型生成「场景词、人物词、道具词、分镜词」。用户只点击一次「AI 智能分镜」，不需要再点第二次生成。前端最终在同一个页面展示剧本和四类词结果，等待用户点击「创建章节」或「创建分镜」后，才写入业务数据。

## 2. 现有后台能力对齐

### 落地性检查结论

按用户要求的完整链路：

```text
小说原文
-> 文本模型
-> 剧本
-> 同一个预览页显示剧本，同时后端无感触发第二轮
-> 后端根据【剧本】组装场景/人物/分镜提示词
-> 文本模型
-> DeepSeek 输出人物词/场景词/道具词/分镜词
-> 同一个预览页补齐人物/场景/道具/分镜结果
-> 用户确认创建
-> 写入角色、场景、道具、分镜选项卡
```

当前项目已有能力可以支撑大部分链路。当前阶段的落地口径如下：

1. 「小说转剧本」必须作为独立第一阶段，由前端用户选择的题材看点、情绪看点、镜头看点，以及后台默认输出格式包、通用禁忌包共同组装提示词。
2. 道具当前先顺带抽取：从 `scriptDraft`、场景抽取结果和分镜结果中归一化出道具表与道具提示词。等整体链路跑通后，再补独立道具提示词后台模块。

落地判断：

| 环节 | 当前能力 | 是否可落地 | 说明 |
| --- | --- | --- | --- |
| 小说输入 | 单集弹框已有文本输入 | 可落地 | 前端可直接传 `scriptText` |
| 文本模型调用 | `TextModelGatewayService` | 可落地 | 可接 DeepSeek 文本模型 |
| 小说转剧本 | `admin-storyboard-prompts.compose` | 可落地 | 使用题材/情绪/镜头 + 默认输出格式包 + 通用禁忌包生成并回显【剧本】 |
| 场景提示词 | `admin-scene-prompts` | 基本可落地 | 需补 `compose` 方法 |
| 人物提示词 | `admin-character-prompts` | 可落地 | 已有 `compose` |
| 道具提示词 | 暂无独立后台模块 | 当前可顺带落地 | 先从剧本、场景和分镜中抽取并归一化，后续再补后台模块 |
| 分镜提示词 | `admin-storyboard-prompts` + `admin-shot-prompts` | 可落地 | 分镜包负责整体风格，shot 模板负责具体镜头/图片/视频提示词 |
| 页面预览 | 文档已设计 | 可落地 | 全屏深色表格页 |
| 写入数据 | assets/shots/shot_reference_assets 已有基础表 | 可落地 | 提交时写入角色、场景、道具资产和 shots |

### 分镜提示词

已有模块：

`apps/backend/src/modules/admin-storyboard-prompts/admin-storyboard-prompt.service.ts`

已支持：

- `package_type = genre`：题材包
- `package_type = emotion`：情绪包
- `package_type = camera`：镜头包
- `package_type = output`：输出格式包
- `package_type = taboo`：通用禁忌包
- `compose(input)`：把基础任务、题材、情绪、镜头、输出格式、禁忌包拼成完整分镜提示词

本流程应复用 `compose`，不要在前端拼提示词。

### 分镜镜头提示词

已有模块：

`apps/backend/src/modules/admin-shot-prompts/admin-shot-prompt.service.ts`

已支持模板阶段：

- `stage = outline`：把剧情拆成分镜大纲
- `stage = panel`：生成可执行分镜面板，包含画面、对白、静态图提示词、视频提示词
- `stage = camera`：强化镜头语言、节奏、运镜、视频运动提示词
- `stage = image`：生成单个分镜静态图片提示词

本流程中，`admin-storyboard-prompts` 负责题材、情绪、镜头看点、输出格式、禁忌包的组合；`admin-shot-prompts` 负责把剧本结构进一步加工成可落入分镜表的镜头级结果。

当前 `admin-shot-prompts` 主要支持模板管理和列表，尚未提供与角色提示词一致的 `compose(input)`。实现时需要补齐。

### 角色提示词

已有模块：

`apps/backend/src/modules/admin-character-prompts/admin-character-prompt.service.ts`

已支持：

- `stage = extract`：从原文或剧本片段抽取角色线索
- `stage = merge`：合并去重，形成最终角色档案
- `stage = grid`：生成角色设定图提示词
- `compose(input)`：按模板变量渲染角色提示词

本流程至少使用 `extract` 和 `merge`，展示页需要角色名称、服装、角色描述。`grid` 可作为后续生成角色设定图提示词的扩展。

### 场景提示词

已有模块：

`apps/backend/src/modules/admin-scene-prompts/admin-scene-prompt.service.ts`

已支持模板管理与默认模板：

- `stage = split`：把章节拆成可追踪场景
- `stage = extract`：抽取场景要素
- `stage = merge`：合并场景库，保证同一地点一致
- `stage = detail`：生成场景设定拆解表
- `stage = image`：生成场景概念图提示词

当前场景服务主要是模板 CRUD/list。实现时建议补一个与角色服务一致的 `compose(input)`，用于按模板变量渲染场景提示词。

### 道具提示词

当前没有独立的后台道具提示词模块，也没有 `prop_prompt_templates` 数据表。

当前阶段不阻塞主链路，先采用顺带抽取方案：

- `scriptDraft.scriptBeats[].props` 提供第一层候选道具。
- `scene_extract_elements` 的场景要素抽取补充空间内道具。
- 分镜生成结果里的 `props` 补充分镜级关键道具。
- 后端统一合并、去重、补描述，生成道具表和道具图片提示词。

整体链路跑通后，再新增独立道具提示词后台模块：

```text
apps/backend/src/modules/admin-prop-prompts/admin-prop-prompt.service.ts
packages/db/migrations/00xx_prop_prompt_templates.sql
```

建议阶段：

- `stage = extract`：从剧本、场景、分镜里抽取道具
- `stage = merge`：合并同一物件，形成统一道具档案
- `stage = detail`：生成道具名称、道具描述、用途、出现位置、连续性规则
- `stage = image`：生成道具图片提示词

## 3. 前端交互流程

### 入口

用户在单集弹框内点击：

```text
AI 智能分镜
```

前端读取：

- `scriptText`：文本框原文
- `genrePackageId`：题材看点选中 ID，可为空
- `emotionPackageId`：情绪看点选中 ID，可为空
- `cameraPackageId`：镜头看点选中 ID，可为空
- `projectId`

### 加载态

点击后不要立即进入工作台，也不要立即创建分镜。页面切换到 AI 解析预览态：

```text
AI解析中，请稍后
```

加载过程中展示阶段：

- 正在读取后台提示词配置
- 正在分析场景
- 正在分析角色
- 正在生成分镜
- 正在整理预览结果

两轮模型调用必须在同一个预览页无感串联：

1. 用户点击一次「AI 智能分镜」。
2. 前端进入同一个全屏预览页。
3. 后端第一轮请求 DeepSeek，生成【剧本】。
4. 前端在该页面先展示【剧本】，同时继续显示第二轮进度。
5. 后端自动根据【剧本】触发第二轮 DeepSeek 请求，生成场景词、人物词、道具词、分镜词。
6. 第二轮完成后，同一个页面补齐场景、角色、道具、分镜表格。
7. 全流程中用户不需要再点击“继续生成”或“生成提示词”。

### 成功态

结果按用户给的参考图展示为四块表格：

```text
场景
角色
道具
分镜
```

表格字段：

场景：

- 场景名称
- 场景描述

角色：

- 角色名称
- 角色描述

道具：

- 道具名称
- 道具描述

分镜：

- 分镜剧情
- 对话/旁白
- 静态图片提示词
- 动态视频提示词

右上角保留主按钮：

```text
创建章节
```

或后续按业务命名改成：

```text
创建分镜
```

只有用户点击该按钮后，才把预览结果写入项目章节、场景、角色、分镜记录。

## 4. API 设计

### 生成 AI 分镜预览

```http
POST /api/creator/projects/:projectId/ai-storyboard-preview
```

请求体：

```json
{
  "scriptText": "用户输入的单集文本",
  "packages": {
    "genrePackageId": "uuid 或 null",
    "emotionPackageId": "uuid 或 null",
    "cameraPackageId": "uuid 或 null"
  },
  "model": "deepseek-chat"
}
```

返回体：

```json
{
  "previewId": "uuid",
  "status": "ready",
  "data": {
    "scenes": [
      {
        "id": "scene_001",
        "name": "城内街道/秋季晚霞傍晚",
        "description": "开阔的城内主街，两侧分布拥挤摊位...",
        "imagePrompt": "城内主街，秋季傍晚，低矮木石建筑..."
      }
    ],
    "characters": [
      {
        "id": "char_001",
        "name": "任小野",
        "description": "一位约17岁的东方少年，身穿深旧短衣...",
        "costume": "旧布短衣",
        "imagePrompt": "17岁东方少年，深灰旧短衣，清瘦但警觉..."
      }
    ],
    "props": [
      {
        "id": "prop_001",
        "name": "小草的饭食",
        "description": "闵婶子交给任小野带回去的食物...",
        "imagePrompt": "粗布包裹的饭食，旧木桌上，生活化质感..."
      }
    ],
    "storyboards": [
      {
        "shotNo": 1,
        "plot": "任小野向闵婶子托付任小草并提到伙食费。",
        "dialogue": "闵婶子：今天又得麻烦您照看小草了。",
        "imagePrompt": "城内旧街傍晚，东方少年站在旧木屋前...",
        "videoPrompt": "镜头1 0-4秒，中景固定镜头，任小野递出钱袋...",
        "durationSec": 8,
        "sceneId": "scene_001",
        "characterIds": ["char_001"]
      }
    ]
  }
}
```

### 用户确认创建

```http
POST /api/creator/projects/:projectId/ai-storyboard-preview/:previewId/commit
```

请求体：

```json
{
  "episodeTitle": "自动生成或用户编辑的章节标题",
  "commitMode": "create_episode_and_storyboards"
}
```

提交成功后：

- 创建单集/章节
- 写入角色资产或项目角色表
- 写入场景资产或项目场景表
- 写入道具资产
- 写入分镜列表
- 前端进入该章节的分镜工作台

## 5. 后端模型调用流程

建议用一个业务服务承接：

```text
AiStoryboardPreviewService
```

核心步骤如下。

### Step 1：读取并校验配置

后端根据请求读取用户选择的三个包：

- `genrePackageId` 必须是启用状态的 `genre`
- `emotionPackageId` 必须是启用状态的 `emotion`
- `cameraPackageId` 必须是启用状态的 `camera`

然后后端自动读取：

- 默认启用的 `output` 包，优先使用 `output_type = json` 或 `is_default = true`
- 所有 `is_global_default = true` 且启用的 `taboo` 包

前端不传输出格式包和通用禁忌包，避免用户绕过后台规则。

### Step 2：小说转剧本

第一轮 DeepSeek 调用只做一件事：把小说原文转成可继续处理的【剧本】，不直接生成最终场景词、人物词和分镜词。

输入：

```text
小说原文
+ 题材看点包
+ 情绪看点包
+ 镜头看点包
+ 输出格式包
+ 通用禁忌包
+ 剧本结构输出要求
```

这一轮提示词来源必须固定：

- 前端传入用户选择的 `genrePackageId`、`emotionPackageId`、`cameraPackageId`。
- 后端根据后台管理配置自动读取默认 `output` 包。
- 后端根据后台管理配置自动读取通用 `taboo` 包。
- 后端调用 `admin-storyboard-prompts.compose` 组装完整提示词。
- 前端不传输出格式包和通用禁忌包。

DeepSeek 输出 `scriptDraft`，即【剧本】：

```json
{
  "title": "章节标题",
  "logline": "本集一句话梗概",
  "scriptBeats": [
    {
      "beatNo": 1,
      "sourceText": "对应小说片段摘要",
      "plot": "剧本事件",
      "characters": ["任小野", "闵婶子"],
      "locationHint": "闵婶家门前",
      "props": ["饭食", "铜钱"],
      "dialogue": "可视化后的对白/旁白",
      "emotion": "克制、愧疚、生活压力"
    }
  ]
}
```

这一阶段的目的：

- 保留小说因果和人物关系。
- 把心理描写转成动作、表情、对白、旁白。
- 给后续角色、场景、道具、分镜提示词提供统一输入。
- 后续所有阶段优先基于 `scriptDraft`，必要时再引用原文。
- 前端页面需要先显示这份【剧本】，后续场景、人物、分镜词都必须基于这份【剧本】继续生成。

### Step 3：根据【剧本】生成场景词

后端使用后台场景提示词模板组装第二轮场景提示词，然后发送给 DeepSeek 文本模型。注意：最终场景词必须是 DeepSeek 输出的词，不是后端自己拼接出来的文案。

1. `scene_split_long_novel`
   - 后端组装输入：`scriptDraft` + 原文
   - DeepSeek 输出：场景列表

2. `scene_extract_elements`
   - 后端组装输入：单个场景 JSON + 对应剧本片段/原文片段
   - DeepSeek 输出：环境、空间层次、道具、声音、伏笔、连续性信息

3. `scene_merge_library`
   - 后端组装输入：所有场景抽取结果 + 已有项目场景库
   - DeepSeek 输出：统一场景库，避免同一地点前后描述不一致

4. `scene_detail_breakdown`
   - 后端组装输入：场景 JSON + 场景抽取结果 + 场景库
   - DeepSeek 输出：页面展示用的场景名称和场景描述

5. `scene_image_concept_art`
   - 后端组装输入：场景详情 + 风格补充
   - DeepSeek 输出：场景图片提示词

DeepSeek 最终输出：

```json
{
  "scenes": [
    {
      "sceneId": "scene_001",
      "sceneName": "城内街道/秋季晚霞傍晚",
      "sceneDescription": "开阔的城内主街，两侧分布拥挤摊位...",
      "sceneImagePrompt": "城内主街，秋季傍晚，低矮木石建筑...",
      "continuityRules": ["街道拥挤", "墙面斑驳", "屋檐低矮"]
    }
  ]
}
```

### Step 4：根据【剧本】生成人物词

后端使用后台角色提示词模板组装第二轮人物提示词，然后发送给 DeepSeek 文本模型。注意：人物描述、服装和人物图片提示词必须是 DeepSeek 输出的词。

1. `novel_character_extract`
   - 后端组装输入：`scriptDraft` + 原文或按长度分块后的原文
   - DeepSeek 输出：角色线索、别名、身份、服装、证据

2. `novel_character_merge`
   - 后端组装输入：所有分块角色抽取结果
   - DeepSeek 输出：最终角色档案

3. `character_grid_sheet`
   - 后端组装输入：角色档案
   - DeepSeek 输出：人物图片提示词/角色设定图提示词

页面展示阶段主要使用 `merge` 结果：

- 角色名称
- 角色服装
- 角色描述

DeepSeek 最终输出：

```json
{
  "characters": [
    {
      "characterId": "char_001",
      "characterName": "任小野/旧布短衣",
      "characterDescription": "一位约17岁的东方少年...",
      "costume": "深灰旧棉布短衣与耐磨长裤",
      "characterImagePrompt": "17岁东方少年，深灰旧短衣，清瘦但警觉..."
    }
  ]
}
```

### Step 5：道具顺带抽取与提示词归一化

当前阶段道具先不新增独立后台提示词管理，随整体链路顺带抽取。后端仍要把道具处理成稳定结构，方便页面展示和后续落库。

道具来源：

1. `scriptDraft.scriptBeats[].props`
   - 小说转剧本阶段顺带列出的关键道具

2. `scene_extract_elements`
   - 场景要素抽取中出现的空间道具、伏笔道具、生活物件

3. 分镜生成结果
   - 分镜中特写、递交、拾取、遗失、反复出现的关键道具

归一化要求：

- 同名或近义道具要合并，例如 `饭食`、`小草的饭食` 合并为同一个道具。
- 每个道具必须有 `propName`、`propDescription`、`propImagePrompt`。
- `propImagePrompt` 当前优先在第二轮 DeepSeek 输出中顺带补齐；后端只做合并、去重、字段归一化。
- 道具必须记录出现在哪些场景或分镜，方便创建后挂到资产或分镜引用。
- 等整体链路完整后，再把这一步替换为独立 `admin-prop-prompts` 模块。

最终输出：

```json
{
  "props": [
    {
      "propId": "prop_001",
      "propName": "小草的饭食",
      "propDescription": "闵婶子交给任小野带回去的简单饭食...",
      "propImagePrompt": "粗布包裹的饭食，旧木桌上，生活化质感...",
      "continuityRules": ["出现在闵婶家门前", "任小野带回给小草"]
    }
  ]
}
```

### Step 6：根据【剧本】生成分镜词

使用后台分镜提示词包 `compose`：

```text
基础分镜改编任务
+ scriptDraft 剧本结构
+ 题材看点包
+ 情绪看点包
+ 镜头看点包
+ 输出格式包
+ 通用禁忌包
+ 已生成的场景列表
+ 已生成的角色列表
+ 已生成的道具列表
```

然后结合后台 `admin-shot-prompts` 继续组装第二轮分镜提示词，并发送给 DeepSeek。注意：分镜剧情、对白/旁白、静态图片提示词、动态视频提示词必须是 DeepSeek 输出的词。

1. `outline`
   - 后端组装输入：`scriptDraft`
   - DeepSeek 输出：分镜大纲

2. `panel`
   - 后端组装输入：分镜大纲 + 人物参考 + 场景参考 + 道具参考
   - DeepSeek 输出：分镜剧情、对白/旁白、静态图片提示词、动态视频提示词

3. `camera`
   - 后端组装输入：分镜面板
   - DeepSeek 输出：镜头语言、节奏、运镜、视频运动提示词

4. `image`
   - 后端组装输入：单个分镜 + 人物/场景/道具参考
   - DeepSeek 输出：最终静态图片提示词

强制输出 JSON，不要 Markdown：

```json
{
  "storyboards": [
    {
      "shotNo": 1,
      "sceneId": "scene_001",
      "characterIds": ["char_001"],
      "plot": "分镜剧情",
      "dialogue": "对话/旁白",
      "imagePrompt": "静态图片提示词",
      "videoPrompt": "动态视频提示词",
      "props": ["prop_001"],
      "durationSec": 8
    }
  ]
}
```

### Step 7：结果归一化

后端把场景、角色、道具、分镜统一整理成前端表格需要的结构。

归一化规则：

- 场景 ID 必须稳定，例如 `scene_001`
- 角色 ID 必须稳定，例如 `char_001`
- 分镜必须引用已有场景和角色
- 道具可从场景抽取或分镜内容中汇总
- 静态图片提示词必须融合角色、场景、动作、服装、光线、镜头
- 动态视频提示词必须包含镜头顺序、时长、动作、转场、音效
- 单个分镜总时长不超过 15 秒

## 6. DeepSeek 调用建议

第一版按两轮模型输出设计，避免后端把最终词“硬拼出来”。

### 第一轮：小说转剧本

```text
后端组装：
小说原文
+ 用户选择的题材看点包
+ 用户选择的情绪看点包
+ 用户选择的镜头看点包
+ 后台默认输出格式包
+ 后台通用禁忌包

发送给 DeepSeek 文本模型

DeepSeek 输出：
【剧本】scriptDraft
```

第一轮输出完成后，前端页面要显示这份【剧本】。后续所有词都基于这份【剧本】继续生成。

### 第二轮：基于剧本生成词

```text
后端组装：
【剧本】scriptDraft
+ 后台场景提示词模板
+ 后台人物提示词模板
+ 后台分镜提示词模板
+ 已抽取/顺带汇总的道具线索

发送给 DeepSeek 文本模型

DeepSeek 输出：
场景词
人物词
道具词（当前随剧本/场景/分镜顺带输出）
分镜词
```

第二轮必须由后端在第一轮成功后自动触发。它可以在实现上拆成多个 provider request，例如场景、人物、分镜分别请求，但业务语义仍然是“基于【剧本】再次请求 DeepSeek 输出最终词”。最终展示和落库必须使用 DeepSeek 第二轮输出的词，后端只负责字段归一化、校验、补空和映射。

## 7. 页面状态设计

建议前端状态：

```ts
type AiStoryboardPreviewState =
  | { status: "idle" }
  | { status: "generating_script"; step: "script"; partial?: null }
  | { status: "generating_prompts"; step: "scene" | "character" | "storyboard" | "normalizing"; scriptDraft: ScriptDraft }
  | { status: "ready"; previewId: string; data: AiStoryboardPreviewData }
  | { status: "committing"; previewId: string }
  | { status: "error"; message: string; rawText?: string };
```

加载态文案：

```text
AI解析中，请稍后
```

阶段文案：

- `generating_script`：`正在生成剧本`
- `generating_prompts.scene`：`剧本已生成，正在生成场景词`
- `generating_prompts.character`：`剧本已生成，正在生成人物词`
- `generating_prompts.storyboard`：`剧本已生成，正在生成分镜词`
- `generating_prompts.normalizing`：`正在整理预览结果`

当状态进入 `generating_prompts` 后，页面必须先显示剧本区，下面的场景、角色、道具、分镜区域可以显示骨架屏或“生成中”。不允许跳转到第二个页面，也不允许要求用户再次点击。

失败态：

- DeepSeek 未配置：`DeepSeek 未配置，请联系管理员`
- 输出 JSON 解析失败：`AI返回格式异常，可重试`
- 原文为空：`请先填写单集内容`
- 配置包失效：`所选看点已被后台停用，请重新选择`

成功态：

- 先展示第一轮 DeepSeek 输出的【剧本】
- 展示四个表格
- 允许关闭返回
- 允许重新生成
- 允许点击「创建章节」

## 8. AI 智能分镜预览页视觉设计

点击「AI 智能分镜」后，页面应切换到与参考图一致的全屏预览页，而不是继续停留在弹框里。

### 整体布局

页面使用深色沉浸式工作区：

- 背景：接近黑色，保留轻微蓝绿色暗光氛围，与当前项目工作台一致。
- 页面内容宽度：桌面端约 `calc(100vw - 240px)`，左右留出明显边距。
- 顶部固定操作区：
  - 左上角：`‹ 返回`
  - 右上角：浅蓝主按钮 `创建章节`
  - 主按钮右侧：关闭按钮 `X`
- 内容区纵向滚动，浏览器右侧保留细滚动条。
- 不使用多层卡片，不把表格包进额外说明卡。每个结果区直接由标题 + 表格组成。

### 顶部行为

`返回`：

- 从预览页回到单集输入弹框或项目详情页。
- 不提交预览数据。

`创建章节`：

- 只有 `status = ready` 时可点击。
- 点击后进入 `committing` 状态，按钮显示提交中。
- 提交成功后写入章节、角色、场景、道具、分镜，并进入分镜工作台。

`关闭`：

- 关闭 AI 预览页。
- 如果已有预览结果但未创建，保留一次二次确认，避免用户误关。

### 加载态

加载态仍在同一个全屏预览页内展示，避免页面跳动：

```text
AI解析中，请稍后
```

建议位置：

- 页面中央偏上。
- 下方显示当前步骤，例如 `正在分析场景`。
- 顶部仍保留返回和关闭按钮。
- `创建章节` 按钮禁用。

### 结果区顺序

结果必须按参考图的阅读顺序展示：

1. 剧本
2. 场景
3. 角色
4. 道具
5. 分镜

每个区块标题使用大号粗体，左对齐，例如：

```text
场景
角色
道具
分镜
```

标题与表格之间保持固定间距。区块之间留出明显纵向间距，方便滚动扫描。

### 剧本区

剧本区展示第一轮 DeepSeek 返回的【剧本】，位于场景表之前。

字段建议：

```text
剧情节点 | 剧本内容 | 人物 | 场景提示 | 道具线索 | 对话/旁白
```

如果第一轮返回的是完整剧本文本，后端也要归一化成可显示结构：

- `剧情节点`：第几段/第几拍。
- `剧本内容`：该段可拍摄剧情。
- `人物`：本段出现的人物名称。
- `场景提示`：本段发生地点或环境。
- `道具线索`：本段出现的道具。
- `对话/旁白`：可直接用于后续分镜的对白或旁白。

剧本区只展示，不直接落入正式分镜。点击「创建章节」时，`scriptDraft` 作为后续追溯和重新生成依据保存。

### 表格视觉

表格要与参考图一致：

- 深色表格底色。
- 1px 细描边，颜色为低对比灰蓝。
- 表头行比正文略暗。
- 单元格只用横向分隔线，不做复杂斑马纹。
- 表格圆角不超过 8px。
- 文本颜色为浅灰白，表头颜色略低。
- 正文使用较粗字重，长文本自动换行。
- 表格宽度撑满内容区。

### 场景表

字段：

```text
场景名称 | 场景描述
```

列宽建议：

- 场景名称：约 48%
- 场景描述：约 52%

场景名称应允许包含地点、季节、时间、氛围，例如：

```text
城内街道/秋季晚霞傍晚
靠近城墙木屋巷道/阴冷傍晚
闵婶家门前灶炉处/昏暗傍晚
```

这些名称后续要直接落入「场景」选项卡的数据表。

### 角色表

字段：

```text
角色名称 | 角色描述
```

列宽建议：

- 角色名称：约 48%
- 角色描述：约 52%

角色名称建议采用：

```text
姓名/服装或身份特征
```

例如：

```text
任小野/旧布短衣
任小草/粗布麻衣
闵婶子/旧围裙粗布衣
```

角色描述必须包含年龄感、性别、外貌、服装、气质、动作习惯。后续创建时：

- `角色名称` 映射到角色选项卡名称。
- `角色描述` 映射到角色选项卡描述。
- 如果后端拆出 `costume`，前端可在提交时附加到角色扩展字段。

### 道具表

字段：

```text
道具名称 | 道具描述
```

道具不是截图第一屏重点，但应与场景、角色保持同一表格样式。道具描述要说明：

- 外观
- 材质
- 用途
- 出现在哪些分镜或场景

后续创建时映射到资产或分镜道具字段。

### 分镜表

字段顺序必须与参考图一致：

```text
分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词
```

桌面端分镜表可以横向较宽，但不能挤压成难读窄列。建议：

- 表格外层允许横向滚动。
- `分镜剧情` 最小宽度 360px。
- `对话/旁白` 最小宽度 360px。
- `静态图片提示词` 最小宽度 360px。
- `动态视频提示词` 最小宽度 520px。

动态视频提示词通常最长，要允许多行换行。每条分镜内部建议包含：

```text
【镜头1】0-4秒 转场/景别/机位/画面描述/核心动作/音效
【镜头2】4-8秒 转场/景别/机位/画面描述/核心动作/音效
```

单条分镜总时长仍不超过 15 秒。

### 小屏适配

移动或窄屏下：

- 顶部操作区仍固定。
- 表格不强制压缩成卡片。
- 场景、角色、道具、分镜表都使用横向滚动。
- 标题、按钮文字不能换行遮挡。

## 9. 模型返回样式与归一化要求

模型返回结果必须最终处理成与页面表格一致的结构。可以有两种方式：

1. 提示词要求模型直接返回标准 JSON。
2. 如果模型返回 Markdown、自然语言或字段名不一致，后端必须做归一化处理。

前端只接收归一化后的表格数据，不在前端猜字段。

### 标准归一化结构

```json
{
  "displayTables": {
    "script": {
      "title": "剧本",
      "columns": ["剧情节点", "剧本内容", "人物", "场景提示", "道具线索", "对话/旁白"],
      "rows": [
        {
          "beatNo": 1,
          "scriptContent": "任小野向闵婶子托付小草，并提到伙食费。",
          "characters": "任小野、闵婶子",
          "sceneHint": "闵婶家门前",
          "propHints": "饭食、铜钱",
          "dialogue": "闵婶子：今天又得麻烦您照看小草了。"
        }
      ]
    },
    "scenes": {
      "title": "场景",
      "columns": ["场景名称", "场景描述"],
      "rows": [
        {
          "sceneName": "城内街道/秋季晚霞傍晚",
          "sceneDescription": "开阔的城内主街，两侧分布拥挤摊位..."
        }
      ]
    },
    "characters": {
      "title": "角色",
      "columns": ["角色名称", "角色描述"],
      "rows": [
        {
          "characterName": "任小野/旧布短衣",
          "characterDescription": "一位约17岁的东方少年..."
        }
      ]
    },
    "props": {
      "title": "道具",
      "columns": ["道具名称", "道具描述"],
      "rows": [
        {
          "propName": "小草的饭食",
          "propDescription": "闵婶子交给任小野带回去的食物..."
        }
      ]
    },
    "storyboards": {
      "title": "分镜",
      "columns": ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"],
      "rows": [
        {
          "plot": "任小野向闵婶子托付任小草并提到伙食费。",
          "dialogue": "闵婶子：今天又得麻烦您照看小草了。",
          "imagePrompt": "城内旧街傍晚，东方少年站在旧木屋前...",
          "videoPrompt": "【镜头1】0-4秒，中景固定镜头..."
        }
      ]
    }
  },
  "commitPayload": {
    "scriptDraft": {},
    "scenes": [],
    "characters": [],
    "props": [],
    "storyboards": []
  }
}
```

`displayTables` 用于页面展示，必须贴近参考图。

`commitPayload` 用于后续写入业务表，字段可以更结构化，例如 `sceneId`、`characterIds`、`durationSec`、`shotNo`。二者可以来自同一份模型结果，但职责不同：

- `displayTables` 解决用户看到的样式一致。
- `commitPayload` 解决落库字段稳定。

### 字段映射

创建章节时映射如下：

| 预览表格 | 表格字段 | 落入目标 |
| --- | --- | --- |
| 剧本 | 剧情节点/剧本内容 | 预览记录 `scriptDraftJson` |
| 剧本 | 人物/场景提示/道具线索 | 第二轮生成词的输入依据 |
| 剧本 | 对话/旁白 | 分镜对白/旁白生成依据 |
| 场景 | 场景名称 | 场景选项卡名称 |
| 场景 | 场景描述 | 场景选项卡描述 |
| 场景 | 场景图片提示词 | 场景选项卡提示词/metadata |
| 角色 | 角色名称 | 角色选项卡名称 |
| 角色 | 角色描述 | 角色选项卡描述 |
| 角色 | 人物图片提示词 | 角色选项卡提示词/metadata |
| 道具 | 道具名称 | 道具资产名称或分镜道具 |
| 道具 | 道具描述 | 道具资产描述 |
| 道具 | 道具图片提示词 | 道具资产提示词/metadata |
| 分镜 | 分镜剧情 | 分镜剧情/画面内容 |
| 分镜 | 对话/旁白 | 分镜对白或旁白 |
| 分镜 | 静态图片提示词 | 分镜静态图提示词 |
| 分镜 | 动态视频提示词 | 分镜视频提示词 |

### 后端归一化规则

- 模型字段名可以不同，但后端返回前必须转换成固定字段。
- 如果模型漏了某一列，后端填空字符串，不让前端表格缺列。
- 如果模型把多条场景或角色写在一个文本块里，后端应拆成多行。
- 如果模型返回 Markdown 表格，后端解析后转成 JSON。
- 如果解析失败，可追加一次 `JSON 修复` 模型调用。
- 最终仍失败时，返回错误态和原始文本摘要，不进入创建流程。

## 10. 持久化边界

生成预览时只写入一个预览记录，不创建正式分镜。

建议新增预览记录，保存：

- `previewId`
- `projectId`
- `createdByUserId`
- `scriptHash`
- `selectedPackageIds`
- `resolvedPackageSnapshot`
- `status`
- `resultJson`
- `scriptDraftJson`
- `displayTablesJson`
- `commitPayloadJson`
- `errorCode`
- `createdAt`

用户点击「创建章节」后才正式写入：

- episode/chapter
- scenes
- characters
- props
- storyboards/shots

这样用户看到 AI 结果不满意时，可以关闭或重新生成，不会产生垃圾章节。

## 11. 安全与一致性

- 只允许创作者接口访问，不开放后台权限。
- 后端必须重新校验 packageId，不能相信前端传来的类型。
- DeepSeek API key 只在后端读取。
- provider request 继续走 `TextModelGatewayService`，复用 request hash、payload hash、usage 记录。
- 日志只记录摘要和 hash，不记录完整原文和完整提示词。
- 输出格式包和通用禁忌包以后端读取为准。

## 12. 验收标准

完成实现后，应满足：

1. 单集弹框点击「AI 智能分镜」会进入加载态。
2. 请求体包含原文和三个看点 ID。
3. 后端先用题材看点、情绪看点、镜头看点、默认输出格式包、通用禁忌包组装提示词，请求 DeepSeek 输出【剧本】`scriptDraft`。
4. 第一轮完成后，同一个预览页必须先显示 DeepSeek 输出的【剧本】。
5. 第一轮成功后，后端必须无感触发第二轮，用户不需要再次点击。
6. 第二轮根据【剧本】读取后台启用的分镜、角色、场景提示词，组装第二轮提示词。
7. 第二轮必须再次发送给 DeepSeek 文本模型，由 DeepSeek 输出场景词、人物词、道具词和分镜词。
8. 后端能使用 `admin-shot-prompts` 让 DeepSeek 输出镜头级静态图片提示词和动态视频提示词。
9. 道具当前从 `scriptDraft`、场景词、分镜词中顺带抽取并归一化，不阻塞整体链路。
10. 后端能自动追加输出格式包和通用禁忌包。
11. DeepSeek 返回后，页面显示与参考图一致的全屏深色预览页。
12. 预览页包含左上返回、右上创建章节、右上关闭按钮。
13. 页面显示剧本、场景、角色、道具、分镜五块内容，表头和列顺序固定。
14. 模型返回不是标准样式时，后端必须归一化成页面表格结构。
15. 归一化后的数据能映射到角色、场景、道具、分镜选项卡。
16. 归一化结果必须包含人物图片提示词、场景提示词、道具提示词、分镜静态图片提示词、分镜动态视频提示词。
17. 未点击「创建章节」前，不创建正式分镜。
18. 点击「创建章节」后，才把结果写入项目并进入分镜工作台。
19. 后台停用某个包后，前端再提交应提示配置失效。
20. JSON 解析失败时，页面能提示重试，不白屏。

## 13. 推荐实施顺序

1. 后端新增 AI 分镜预览接口。
2. 给场景提示词服务和分镜镜头提示词服务补 `compose` 方法。
3. 实现提示词配置读取和校验。
4. 实现第一轮模型调用：后端组装「小说原文 + 题材/情绪/镜头 + 默认输出格式包/通用禁忌包」并发送给 DeepSeek，得到【剧本】`scriptDraft`。
5. 前端接入同一个预览页的【剧本】展示区。
6. 实现第二轮模型调用：后端在第一轮成功后无感触发，根据【剧本】和后台场景/人物/分镜提示词模板组装提示词，再发送给 DeepSeek。
7. 接收 DeepSeek 第二轮输出的场景词、人物词、道具词、分镜词。
8. 道具先实现顺带抽取与归一化。
9. 接入 `TextModelGatewayService` 调 DeepSeek。
10. 实现 JSON 解析和归一化。
11. 前端接入全屏深色预览页、两轮生成进度、剧本区和四类词表格。
12. 实现「创建章节」提交。
13. 补后端接口测试、前端渲染测试和浏览器 QA。
