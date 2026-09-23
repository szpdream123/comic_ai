# 自由会话创作流程实施计划

Goal: 完成已批准的文档、Skill、确认和持续创作路径，降低会话界面密度。

Spec: ../../diagnostics/2026-09-23-agent-video-workflow-reference.md

约束：沿用现有接口和数据结构；实施阶段不提交、不推送，后续合入已获用户明确授权；不进行付费测试生成；不修改其他工作区；遵循当前审批模式。

设计：沿用主题的 background/surface/foreground/muted/accent/control-border 变量，正文使用现有中文系统字体，镜号和时长采用等宽数字。会话只展示摘要与产物入口，详情以宽文档阅读器呈现。签名结构是按真实顺序排列的镜头与片段，避免装饰性面板。

- [x] 文档交互：canvas-agent-panel.js 局部接入 free-conversation-documents.js；完整内容在原生 modal dialog 中安全渲染，支持复制、下载、继续编辑，关闭还原焦点。测试文档 ID/版本定位、转义、原文下载。
- [x] 界面：free-conversation-agent.css 收紧输入框和信息层级；创作计划折叠，最新计划呈现紧凑阶段栏；桌面/窄屏截图检查。
- [x] Skill 与工作流：free-conversation-tools.ts、canvas-agent-executor.ts 复用现有授权 Skill，保持多轮选择；明确素材清单、故事板和逐片段提示词文档，测试文本范围与选择优先级。
- [x] 确认：核对现有事件和报价字段，展示真实生成内容和服务报价，保持审批 ID 和既有幂等；无报价不能显示虚构数字。
- [x] 持续创作：基于已选文档/媒体填充明确修改请求，不隐式提交；历史版本保留，后续建议根据产物状态出现。
- [x] 验证：相关 web/backend 测试、生产构建、gstack 页面与响应式检查、独立 diff 审查；修复实际发现问题。

重点边界：旧文档版本不能误操作成新版本；异步返回不跨会话；HTML/Markdown 转义；报价缺失与零积分区分；正在生成时不可重复建议同一任务。

## 实施结果

首版已完成，详见 [验收记录](../../diagnostics/2026-09-23-free-conversation-verification.md)。当前沿用逐任务审批，未新增批量勾选协议；高级视频后处理功能仍以现有真实能力为限。真实付费生成和登录后的整段模型输出尚未进行端到端验收。
