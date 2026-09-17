# 创作 Agent 会话方案

> Date: 2026-09-15
> Status: Future multi-turn session design; the current first phase uses the existing AI storyboard preview/commit compatibility layer
> Scope: 在不改变现有首页项目工作流入口、项目工作台和项目数据结构的前提下，用 Agent 控制「Skill + 小说/剧本 → 分析 → 按 Skill 提取 → 按项目格式收口 → 创建项目」。
> Isolation: 项目制作 Agent 与新画布 Agent 业务隔离；两者统一由任务中心调度，不能互相调用工具或写入对方业务数据。

## 1. 目标

用户在首页 Composer 里发送 Skill、正文/附件后，进入一个**对话会话**，而不是固定五阶段流水线。

Agent 自己完成：

1. 读 Skill 目录和用户正文，判断这次要做什么。
2. 按 Skill 自己的写法决定读哪些手册、产出什么。
3. 逐步写出会话产物。
4. 最后按项目需要的格式收口，询问或自动创建项目。

平台**不解析、不约定** Skill 里有哪些文件名。`script.md`、`shot.md`、`角色.md`、用户自命名的 `语气要求.md` 一律只是 Skill 包里的普通文件。读不读、何时读，由模型根据 `SKILL.md` 和当前任务决定。

## 2. 产品形态

对齐 OpenCode：主 Agent 对话 + 按需加载 Skill + 工具写工作区 + 权限询问。

发送后可以进入 Agent 解析状态和结构化预览。现有项目工作流入口位置保持不变；旧预览 UI 可以在同一入口内逐步接入 Agent 控制，不要求新增首页入口。

```text
左：对话时间线
  用户消息 / Agent 文本 / 工具调用卡片 / 确认卡片

右：会话工作区
  源文件、中间产物、project.json
  还不是正式项目
```

顶部：返回、会话标题、模型、模式切换。没有常亮的「创建项目」。创建项目是工具，由当前模式决定是询问还是自动执行。

首页 Composer 仍可 @Skill、上传附件、选模型。发送后只建 **session**，不建 project。

## 3. 两种模式

首页现有 Agent 模式选择器改为这两种。默认「请求确认」。会话中途可切换，只影响**尚未发生**的确认点，不回溯已写出的产物。

### 3.1 请求确认

对应 OpenCode 的 Plan/ask。

Agent 可以读、可以分析、可以加载 Skill 文件，但下列动作必须先问用户，得到允许才执行：

- 开始写下一份产物（改编剧本、抽角色、抽场景、抽道具、抽分镜，或 Skill 声明的其它产物）
- 把产物收成 `project.json`
- 创建项目

典型对话：

```text
Agent：这是小说，不是现成剧本。Skill 要求先改编再抽取。
       下一步将加载改编手册并写出剧本。是否继续？
用户：继续
Agent：剧本已写入 screenplay.md。接下来要抽角色、场景、道具。是否继续？
用户：只要角色
Agent：只抽角色。写完后停，不自动建项目。
```

用户可随时改范围、停在某一步、或要求重做当前产物。

### 3.2 自动确定

对应 OpenCode 的 Build。

分析完成后，Agent **自己确定**整条路径并连续执行，不再逐步询问。包括：

- 判断源文本类型
- 决定加载哪些 Skill 文件
- 连续写出全部产物
- 收成 `project.json`
- 创建项目并进入工作台

仍要在对话里展示每一步在干什么（加载了哪份文件、写了哪个产物），只是不等用户点「继续」。

用户随时可点停止。停止后已写出的产物保留，模式切回「请求确认」，从断点继续。

创建项目前若格式化失败、产物为空、或用户已在本会话点过停止，自动模式不得建项目。

## 4. 原则

1. **主 Agent 只编排**。每一轮只带当前需要的上下文，禁止把整个 Skill 包拼进 system。
2. **Skill 是手册，不是流水线开关。** @ 某个 Skill 只表示「这份手册可用」。
3. **文件名对平台无意义。** 平台只提供文件清单（路径 + 短摘要），不按 `script`/`shot`/`character` 做路由。
4. **产物先落在会话工作区**，确认（或自动确定）后再变成项目。
5. **创建项目是工具。** 请求确认模式 = ask；自动确定模式 = allow。
6. **禁止一轮完成全部提取。** 即便自动确定，内部仍按「加载当前手册 → 写一份产物 → 再决定下一步」循环。

## 5. 角色

| 角色 | 职责 |
|---|---|
| 创作 Agent | 主对话。读意图、调工具、向用户汇报、在请求确认模式下提问 |
| Skill | Plaza 上的可复用手册。至少有 `SKILL.md`（name + description）。其它文件任意 |
| 会话工作区 | 本次任务的源文件与产物。创建项目前不属于任何 project |
| 项目 | 仅 `create_project` 成功后存在 |

不引入按阶段写死的子 Agent。若某步要并行（例如角色/场景/道具），由主 Agent 发起多个同类工具调用，每个调用自己加载自己的手册。

## 6. Skill 如何被看见

### 6.1 目录，不是全文

会话开始时，模型只看到用户 @ 过的 Skill 目录：

```text
available_skills:
- name: novel-to-script-pipeline
  description: 小说转剧本，再从详细剧本抽角色、场景、道具、分镜
  files:
    - SKILL.md
    - references/script.md
    - references/shot.md
    - references/character_extract.md
    - references/scene_extract.md
    - references/prop_extract.md
    - references/format-spec.md
    - references/example.md
    - references/qa-checklist.md
    - references/adaptation-workflow.md
    - scripts/validate_screenplay.md
- name: my-tone-guide
  description: 对白要短，口语化
  files:
    - SKILL.md
    - 语气要求.md
```

`description` 来自 Skill 自己的 frontmatter 或简介。`files` 只给路径，**不给正文**。

用户自己上传的 Skill 同样只露 name、description、文件清单。平台不检查文件是否叫 `script.md`。

### 6.2 按需加载

Agent 通过工具读文件：

- `load_skill(name)`：读该 Skill 的 `SKILL.md`
- `read_skill_file(skill, path)`：再读包内任意一份文件

读完才进入当前轮上下文。未读的文件不得被系统偷偷拼进去。

`scripts/` 下的文件也只是清单里的一项。默认不读。手册要求校验或用户要求时，Agent 自己决定要不要读。平台不做「deferred」特殊名单。

### 6.3 多 Skill

用户可 @ 多个 Skill。Agent 读各自的 `SKILL.md` 后决定：

- 以哪个为主手册
- 哪些是补充约束（例如语气、画风）
- 冲突时在请求确认模式问用户；自动确定模式选主 Skill 并在对话里说明取舍

## 7. 工具

平台只提供通用工具。工具参数里**没有** `stage=script|shot|...`。

| 工具 | 作用 | 请求确认 | 自动确定 |
|---|---|---|---|
| `load_skill` | 加载某个 Skill 的 `SKILL.md` | 允许 | 允许 |
| `read_skill_file` | 读 Skill 包内任意文件 | 允许 | 允许 |
| `list_skill_files` | 再看该 Skill 的文件清单 | 允许 | 允许 |
| `read_source` | 读用户上传/粘贴的源文本，可分段 | 允许 | 允许 |
| `write_artifact` | 把当前步骤结果写成会话文件 | 询问 | 允许 |
| `read_artifact` | 读已有会话产物 | 允许 | 允许 |
| `ask_user` | 向用户提问并等待 | 允许 | 仅失败/歧义时使用 |
| `format_project` | 按项目 schema 把产物收成 `project.json` | 询问 | 允许 |
| `create_project` | 用 `project.json` 创建项目 | 询问 | 允许 |

约束：

- `write_artifact` 一次只写一份产物。不得在一次调用里同时写剧本和分镜。
- `format_project` 只做结构对齐，不改情节、不发明源文本或已有产物里没有的实体。
- `create_project` 必须已有合法 `project.json`。没有则拒绝。
- 没有「按阶段注入 Skill」的系统工具。需要哪份手册，Agent 自己 `read_skill_file`。

## 8. 会话链路

全程由模型分析驱动。下面是一条**常见**路径，不是平台写死的状态机。换一份 Skill，步骤可以完全不同。

### 8.1 用户发送

输入只有：

- 文本（可空）
- 附件（小说、剧本、其它文本）
- @Skill（可多个）
- 模式：请求确认 / 自动确定
- 文本模型

系统创建 session，把附件放进工作区源文件，把 Skill 目录交给 Agent。此时没有 `projectId`。

### 8.2 理解任务

Agent 通常会：

1. `load_skill` 读 `SKILL.md`
2. 如有必要，`read_skill_file` 读手册点名的其它文件
3. `read_source` 看用户正文是小说、已成剧本、还是其它

然后得出自己的判断，例如：

```text
源文本：小说
Skill 目标：先改编成详细剧本，再从剧本抽角色、场景、道具、分镜
下一步：读改编相关手册，写出剧本产物
```

或：

```text
源文本：已是剧本
Skill 目标：只抽角色
下一步：读角色相关手册，写出角色产物，然后结束
```

或用户 Skill 完全是另一套：

```text
源文本：小说
Skill 目标：只出分集大纲，不要分镜
下一步：按该 Skill 写大纲产物，不抽资产
```

平台不校验这些判断是否属于 `script|scene|character|prop|shot`。只要 Agent 能根据手册和正文自圆其说即可。

请求确认：把判断说给人听，问是否按此执行。  
自动确定：把判断写进对话，直接开始写。

源文本看不清、多个 Skill 互相矛盾、用户没给正文时：两种模式都先问，不得猜测着生成。

### 8.3 逐步提取

每一步同一套路：

```text
根据 SKILL.md 和已有产物，决定下一步要写什么
read_skill_file(这一步需要的手册，可能 0 份或多份)
read_source 或 read_artifact(这一步的输入)
模型只做这一步
write_artifact(一份产物)
```

输入约定由手册决定，不由平台决定。常见但非强制：

- 改编剧本：输入是源文本
- 抽角色/场景/道具：输入是已经写出的剧本草稿，而不是回头吃小说
- 抽分镜：输入是剧本 + 已抽出的名称清单

若手册没写输入从哪来，Agent 自己判断；请求确认模式下应说明判断再写。

自动确定时，角色/场景/道具若互相不依赖，可并行发起多个 `write_artifact`。每个调用的上下文只含自己读过的手册，不得把其它步骤手册带进去。

### 8.4 收口为项目格式

用户要的最终结果是**能创建项目的数据**，不是会话里的随意 Markdown。

当 Agent 判断「Skill 要求的产物已经齐」或用户说「就这些」时，另开一轮，**不再加载 Skill 手册**。只给：

- 固定的项目 schema
- 当前会话里已有的产物文件

调用 `format_project`，写出 `project.json`：

```json
{
  "title": "项目标题",
  "scriptText": "详细剧本文本，可空",
  "scenes": [
    { "sceneName": "", "sceneDescription": "", "sceneImagePrompt": "" }
  ],
  "characters": [
    { "characterName": "", "characterDescription": "", "characterImagePrompt": "" }
  ],
  "props": [
    { "propName": "", "propDescription": "", "propImagePrompt": "" }
  ],
  "storyboards": [
    {
      "shotNo": 1,
      "plot": "",
      "dialogue": "",
      "imagePrompt": "",
      "videoPrompt": ""
    }
  ]
}
```

规则：

- 缺的类别出空数组，不得编造
- 名称必须来自已有产物
- Skill 若根本不产分镜，`storyboards` 为空仍可创建项目（进入资产工作台）
- 这一轮禁止再读 Skill 全文，避免手册体量污染结构化输出

请求确认：先展示将要入库的摘要（标题、角色数、场景数、道具数、分镜数），用户点创建。  
自动确定：格式化成功后直接 `create_project`。

### 8.5 创建项目

```text
create_project({ sessionId })
```

成功后才有项目，并进入工作台。失败则留在会话，允许改产物后重新 `format_project`。

创建内容对齐现有项目结构：剧本文本、角色/场景/道具资产、分镜行。具体落库是 `create_project` 的实现细节，不在对话层让模型直接写数据库。

## 9. 每一轮模型实际看到什么

由 Agent 自己读过的内容决定，平台不按阶段拼包。

| 轮次 | 典型上下文 |
|---|---|
| 理解任务 | Skill 目录 + `SKILL.md` + 源文本切片 |
| 写某份产物 | `SKILL.md` + 这一步读过的手册文件 + 这一步的输入产物/源文本 |
| 格式化 | 项目 schema + 已有产物，无 Skill 手册 |
| 创建 | 不需要再调大模型，工具执行 |

因此即使用户 Skill 里有超大分镜手册和校验器，剧本轮也不会自动带上它们——除非模型这一步主动 `read_skill_file`。这是上下文爆炸的根治，且不依赖文件名规则。

若单份手册仍然过大，由 Agent 分段读，或只读手册目录后再读需要的小节。平台可给 `read_skill_file` 提供 offset/limit，但不替模型决定读哪一段。

## 10. 界面

### 10.1 对话

每条消息可含：

- Agent 文本（判断、说明、摘要）
- 工具卡片：加载了哪份 Skill 文件、写了哪个产物
- 确认卡片（仅请求确认模式）：继续 / 只要这一项 / 停 / 重做
- 创建卡片：项目摘要 + 创建 / 返回修改

自动确定模式没有逐步确认卡片，仍有工具卡片和停止按钮。

### 10.2 工作区

右侧列出会话文件。用户可点开看正文。请求确认模式下，允许在确认下一步之前改产物；改完后 Agent 以文件为准，不继续用上一轮模型输出的旧副本。

### 10.3 与首页的关系

| 现有 | 本方案 |
|---|---|
| 工作流模式：上传文件 → 解析剧本 → 预览 | 保留入口和页面位置，只将解析、提取、校验和提交控制交给项目制作 Agent |
| 画布 Agent | 不动。画布仍是画布，继续使用独立上下文和工具注册表 |
| 自由生成 | 不动 |

推荐：首页「Agent」Tab 就走本会话。工作流 Tab 若保留，也只是「必须带附件」的同一 Agent，不再进旧 overlay。

## 11. 失败与边界

| 情况 | 请求确认 | 自动确定 |
|---|---|---|
| 没给正文 | 问用户要原文 | 同样先问，不得生成 |
| Skill 没有 `SKILL.md` | 用简介 + 文件清单，问用户这份 Skill 要产出什么 | 读全部小文件试着理解；文件总大小超阈值则停下来问 |
| 模型要读不存在的文件 | 工具报错，Agent 改计划 | 同左 |
| 写产物中途模型失败 | 保留已完成产物，问是否重试当前步 | 自动重试当前步一次，仍失败则切到请求确认 |
| 格式化后 schema 不合法 | 展示错误，不建项目 | 自动再格式化一次，仍失败则切到请求确认 |
| 用户中途停止 | 停在当前产物 | 同左，后续改请求确认 |
| 用户不要建项目 | 只保留会话 | 自动模式在用户明确说「不要创建」时也不得创建 |

## 12. 明确不做

- 不按文件名把 Skill 文件映射到 `script/scene/character/prop/shot`
- 不在系统层维护「剧本阶段只准带这五份文件」的白名单
- 不把整个 Skill 包注入每一轮
- 不让主模型一轮吐出完整 `project.json` 并同时生成全部资产
- 不先创建空项目再生成
- 不把 `/ai-storyboard-preview` 的固定阶段暴露为未来主 Agent 的长期对话模型；第一阶段允许把它作为兼容执行层
- 不把本会话接到 canvas-agent
- 不要求用户按官方目录结构上传 Skill

## 13. 与旧链路的关系

现有 `ai-storyboard-preview`、首页 workflow overlay 和 Plaza Skill 选择逻辑继续保留，作为项目 Agent 的兼容适配层。Agent 负责决定读取哪些 Skill、生成哪些结构化产物以及何时调用它们；最终仍调用现有项目服务创建项目、剧集、资产和 shots。新画布链路不接入本方案。

`create_project` 落库时，项目表、资产、分镜的数据结构与现有工作台对齐，便于创建后无缝进入。对话过程和预览页状态机不对齐。

## 14. 落地顺序

建议按增量方式实现：

1. 在现有首页工作流入口内增加 Agent 解析状态，不移动入口，不删除现有预览页
2. Skill 目录 + `load_skill` + `read_skill_file` + `read_source`：能分析「这份 Skill 要做什么、正文是什么」
3. 两种模式：请求确认会停，自动确定会连续写
4. `write_artifact` / `read_artifact`：能按模型自己的计划写出多份产物
5. `format_project` + `create_project`：收口并真正建项目

第一刀验收：用户从现有首页项目工作流入口上传小说并选择 Skill，Agent 只加载它认为必要的文件，生成与现有项目预览兼容的结构化结果；项目任务由统一任务中心执行，并验证项目任务不会调用画布工具或修改画布 revision。
