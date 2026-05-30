# 团队资产库本地上传实现计划

## 目标

在团队资产库的 `角色`、`场景`、`道具`、`音色` 四个分类上增加本地上传入口。角色、场景、道具仅接受图片；音色仅接受音频。团队资产库未开通时仍展示上传入口，合法文件上传后在锁定面板上方展示本地预览，并标记为“本地上传，待同步”。云端存储后续接腾讯云，本次只做前端运行时状态。

## 范围

- 修改 `apps/web/src/features/library-team/asset-library-page.js`：渲染上传工具条、本地上传区、格式校验辅助函数。
- 修改 `apps/web/src/features/library-team/library-team.css`：补充克制的暗色工具条、图片卡片、音频行样式。
- 修改 `apps/web/src/features/production-workbench/index.js`：维护本地上传状态、处理按钮点击、文件选择和 toast。
- 修改 `apps/web/src/features/production-workbench/project-detail.js`：把本地上传状态传给团队资产页。
- 修改 `apps/web/tests/assets-team-commercial-qa.spec.ts`：先覆盖锁定态入口、格式校验、本地图片/音频展示。

## TDD 步骤

1. 先添加失败测试：
   - 锁定态团队资产库的 `角色` 分类仍渲染上传图片入口和隐藏文件输入。
   - `音色` 分类渲染上传音频入口，accept 为音频格式。
   - 合法本地图片上传记录在锁定面板上方展示为预览卡，并保留锁定面板。
   - 合法本地音频上传记录展示 `<audio>` 控件。
   - 校验函数接受 `png/jpg/jpeg/webp` 图片和 `mp3/wav/m4a/aac` 音频，拒绝错类文件。

2. 实现渲染层：
   - 为四个分类建立本地上传配置，包括按钮文案、accept、支持格式说明。
   - 上传工具条放在分类 tabs 下方、内容区上方。
   - 本地上传区在锁定面板或资产列表上方展示，图片走缩略图卡片，音色走紧凑音频卡片。

3. 实现交互层：
   - 工作台 UI 状态增加 `teamAssetLocalUploads`。
   - 点击上传按钮触发当前分类的 hidden input。
   - change 事件中逐个校验文件；非法文件 toast 提示并跳过；合法文件生成本地预览 URL 并追加到当前分类。
   - 图片使用 data URL，音频使用 object URL，当前不持久化。

4. 验证：
   - 运行 `npm test -- apps/web/tests/assets-team-commercial-qa.spec.ts`。
   - 如影响工作台渲染，再运行相关 production workbench 测试。
   - 能启动本地页面时做一次浏览器视觉检查；如果本环境缺少可用浏览器工具，则记录限制。

## 设计原则

- 上传入口始终可见，但不抢占锁定态主信息。
- 按钮文案使用“上传图片 / 上传音频”，用户无需理解内部存储状态。
- “本地上传，待同步”明确告诉用户这是临时预览，避免误以为已经入库。
- 样式贴近现有资产库：暗色面板、细边框、8px 圆角、紫色主操作，不做营销式大卡。
