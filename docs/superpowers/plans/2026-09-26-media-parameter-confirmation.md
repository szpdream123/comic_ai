# 会话媒体参数确认实施计划

> 按 superpowers:executing-plans 在本会话逐项实施；用户已确认设计。提交与远程操作未获授权，不执行。

**目标：** 缺参先确认，确认值完整保存在节点并传入生成请求。
**架构：** 复用审批生命周期，增加纯参数合同/校验辅助模块和卡片控件；现有打包资产仅做局部补丁。
**技术：** JavaScript ES modules、现有 React runtime、node:test。
**设计：** ../specs/2026-09-26-media-parameter-confirmation-design.md

## 全局约束

- 不改数据库、供应商协议和无关功能，不覆盖工作区其他改动。
- 选项来自模型能力；缺参数不自动采用项目或模型默认值。
- 已确认输入通过现有 schema/authorize 校验，等待不得提交媒体任务。

## 审查重点

- LLM 猜测值不能作为用户确认；多节点自然语言映射不明时确认。
- 等待中修改节点/模型，以及旧审批提交必须失败。
- 自主模式与 canvas_run_nodes 也必须等待补参。
- 图片参数必须真正传入执行器。
- 取消和失败不能让下一轮自动绕过确认。

## 任务 1：合同与持久化

- [x] 在 apps/web/tests/canvas-agent-media-parameters.spec.mjs 编写实际 placeholder 参数保存测试，观察 15 秒字段缺失失败。
- [x] 新增 assets/mediaParameterConfirmation.js：合同字段、明确需求提取、审批项目、白名单选择校验和节点参数映射。测试缺参/枚举/范围/模型变化/图片/旧节点。
- [x] main-upstream-665b2cc.js 局部修改 createMediaPlaceholder 保存已有视频及图片字段。

## 任务 2：审批与执行守卫

- [x] 扩展 agentRoundExecutor 的 pn/mn，补参优先于自动执行；继续保留 Plan 拒绝、原 schema 和 authorize。
- [x] conversationExecutionController 中为节点批次提供目标列表，在执行前检查确认凭据。图片比例/分辨率传给原生成方法。
- [x] canvasAgentBatch 以已确认参数覆盖本批节点，批次开始前验证全部目标，避免部分先收费。
- [x] 测试自主模式、确认/取消、能力变化、节点改变、首次生成和重试一致性。

## 任务 3：交互与验收

- [x] 新增小型确认卡片组件，复用 React runtime，支持每节点模型与参数选择、错误提示、缺项禁用、重复点击保护。
- [x] ChatPanel 仅在 media_parameters 请求时接入组件，保留其他审批 UI。
- [x] 执行新测试与原视频合同/队列/批次/轮次失败测试；浏览器或受控组件测试核对选项到提交值。
- [x] 独立审查本次差量补丁，修复发现，记录真实通过范围和供应商未验证边界。

## 执行记录

- 设计已获用户确认。
- 基线：video-contract 与 queue-lifecycle 共 31 项通过；实际 placeholder 复现 15 秒丢失后重跑 5 秒。

- 最终：20 项新增回归测试，相关合计 74/74 通过；生产前端构建和 JS 语法检查通过。
- 独立审查发现的三个 P2 均修复并复核。追加模板变量校验与参考素材变化测试后通过。
- gstack 浏览器组件验收完成；4310 当前实例已提供新模块，未做真实付费生成。
- 实施范围裁定：自定义工作流保持 workflowInputs 专用合同；未公开能力的非通用模型不猜参数，提示更换或完善配置。
