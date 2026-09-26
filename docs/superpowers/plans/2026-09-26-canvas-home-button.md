# Canvas Home Button Implementation Plan

> Execution: superpowers:executing-plans; implement in the current workspace, then independent review.

**Goal:** 左上角提供明确的返回主页入口，退出前保存画布。
**Architecture:** 扩展现有 host header，复用 onOpenHome 和 flushProjectCanvasSave；不修改运行时打包组件。
**Tech Stack:** JavaScript、CSS、Node test、gstack 浏览器。
**Spec:** ../specs/2026-09-26-canvas-home-button-design.md

## Constraints and review focus

保留现有未提交改动，不提交、不推送。重点检查保存失败、重复点击、键盘触发、组件重挂载、窄屏遮挡。用户已批准方案并授权实施，不重复请求实施许可。

## Task 1: Navigation and header

- [x] 修改 apps/web/app.js 的 installAiCanvasRuntimeHeaderChrome：常驻原生返回按钮、统一 click 处理、忙碌状态与错误提示、清理新增元素和监听器。
- [x] 修改 apps/web/src/features/production-workbench/index.js 的 onOpenHome：等待完整文档和位置保存队列，再执行既有主页导航。
- [x] 修改 runtime-brand-overrides.css：36px 按钮、明确文字、焦点和窄屏样式；保留主题兼容。
- [x] 行为测试覆盖保存阻塞/失败与重试；浏览器检查键盘和重复点击。

## Task 2: Verification and review

- [x] 执行相关现有测试、语法检查和生产构建。
- [x] 浏览器验证标题栏暗/浅色和窄屏布局，记录截图。
- [x] 独立 review 仅审查本次增量，修复发现的问题并复验。
- [x] 记录实际验证结果及运行环境限制。

## Execution ledger

- 2026-09-26 用户纠正目的地：常驻按钮改为「返回画布」→ onOpenProjects → /new-canvas 全部画布列表。原菜单首页入口不变，两者共用现有保存保护。10/10 导航与保存测试通过，独立 review 无 P1/P2；生产构建成功，4310 服务重启完成；真实画布点击后 URL=/new-canvas、列表可见、编辑器卸载，刷新仍为列表。截图 .local/canvas-list-return/returned-list.png。

- 2026-09-26: 当前工作区有前序功能改动，已保存本次涉及文件的改前快照到 .local/canvas-home-button。使用现有目录以保留用户正在验收的功能。
- 2026-09-26: 独立审查发现保存锁队列、位置失败重试和 CSS 覆盖问题，均修复并复审通过。5/5 针对性测试通过；相关组合测试 173 项，160 通过、13 失败；用改前快照复验同样 13 项失败，非本次新增。
- 2026-09-26: 语法检查、git diff --check、生产构建完成；重启原 4310 本地生产服务，新入口 /.production/app-JFYSSAZ6.js，HTTP 200。
- 2026-09-26: 通过密码登录（未使用短信），打开现有画布，实际点击返回按钮后 URL 为 /，画布已卸载。未触发付费生成。真实页面截图 .local/canvas-home-button/live-canvas.png；标题栏隔离验证覆盖键盘、重复点击、保存失败以及 375px / 暗浅色样式。
- 运行环境附记：服务启动有对象存储 putBucketCors 缺少 Content-MD5 的告警；服务正常监听，该告警与本次导航改动无关，未修改存储配置。
