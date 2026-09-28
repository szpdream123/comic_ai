# Wan 3.0 提示词与分镜模板修复

## 长度口径

- `wan3.0-r2v` / `globalaiopc_video` 的 **平台上限为 5000 个 Unicode 字符**，统计最终拼接、供应商引用转换后的提示词，包含系统附加内容。
- 这不是供应商公开承诺的最大长度。接入文档：<https://docs.globalaiopc.com/api-reference/model-center/video-gen/wan3.0-r2v>。
- 其他模型保持各自配置；字符、字节和 token 不互相猜测换算。未知上限不套用 Wan 的值。
- `20261113` 只移除该模型历史 2500 默认值，`20261114` 设置最终 5000 平台策略；两条前向迁移均按完整模型标识筛选，保留定价等其他字段。

## 用户操作

工作台已暂时移除 AI 精简按钮，并阻止旧按钮触发精简；超限时提示用户手动缩短提示词。模型长度计量、提交校验及历史精简稿的原稿恢复保持可用。后端精简实现暂时保留，未来重新开放入口时仍须用户主动请求、预览确认后才替换编辑稿；不扣用户积分，不自动发起图片或视频生成。语义核验只能降低信息丢失风险，不能保证所有模型输出完全等价。

新分镜模板以信息完整为先，仅消除重复描述和格式装饰。人物与物件状态、动作限定词及因果、完整对白、镜头参数、光照、风格与必要负面约束必须保留。已有完整分镜默认沿用；真实长度或时长预算不足时才对新规划内容技术分段。模板规则仍需结合实际输出验收，不能用字数通过代替质量验收。

## 官方模板发布与恢复

`scripts/refine-lingxi-shot-template-quality.mjs` 是针对 **2026-09-26 源模板版本** 的受控补丁，仅更新三套指定官方工作流的 `SKILL.md`、`references/shot.md`、`references/分镜.md` 及入口镜像。其他文档和字段保持原样；已知旧剧本专属文档通过运行时阶段过滤排除，不删除原文档。

从项目根目录运行，连接始终读取正式 `.env`：

```powershell
node --env-file=.env scripts/refine-lingxi-shot-template-quality.mjs
```

默认只生成 `.local/run/lingxi-shot-quality-20260927-v2/` 中的对照稿和 `proposed.json`，不写数据库。检查三套完整前后文本，并验收代表性剧情中的台词、动作因果、镜头参数和承接状态。确认当前提案通过后，在同目录保存 `validation.json`，记录 `status: "passed"` 及 `proposalSha256`（对 `JSON.stringify(JSON.parse(proposed.json))` 的 UTF-8 内容计算 SHA-256）。提案变化必须重新验收。

```powershell
node --env-file=.env scripts/refine-lingxi-shot-template-quality.mjs --apply
node --env-file=.env scripts/refine-lingxi-shot-template-quality.mjs --rollback
```

发布要求当前数据库内容与原始快照完全一致，并在一个事务中更新全部三套工作流；遇到并发修改、归属或发布状态变化会整批回滚。回滚同样要求内容仍是该次发布版本，避免覆盖之后的编辑。发布前先写 `rollback-backup.json`；即使提交后 `applied.json` 写入失败，仍可从备份恢复。已发布后不要重新生成或覆盖快照，保留整个输出目录；该目录不提交 Git。

代码合并不会自动执行这个模板发布脚本，也不会自动回滚已发布模板。

## 验证记录（2026-09-27）

- 真实供应商验证：生产适配器提交 **3231 字符**（含 2930 汉字）的提示词，返回成功，产出 10 秒 720p 视频，确认请求未被本地截断。该结果验证了超过 2500 的一个样本，未证明所有 5000 字符提示词都能生成。
- 相关回归覆盖最终拼接预算、5000 边界、未知上限、手动精简、原稿恢复、阶段过滤与发布恢复。发布恢复测试使用合成模板和内存数据库，不依赖线上快照：`node --test scripts/refine-lingxi-shot-template-quality.test.mjs`。
