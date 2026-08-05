# 生图素材卡片头部布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生图素材卡片的标题和操作按钮拆成上下两层，让标题尽量完整、按钮始终可读且互不遮挡。

**Architecture:** 保留现有素材卡片数据、事件 action 和标题保存链路，只在 `renderAssetCard` 中增加标题行与操作行两个语义容器。CSS 改为正常文档流：标题行使用“选择圆点 + 弹性标题”，操作行使用“引入按钮 + 保存/删除按钮”，并同步更新桌面固定卡片高度和小屏规则。

**Tech Stack:** 原生 JavaScript 模板字符串、CSS Grid/Flexbox、Node.js test runner、Vitest。

---

## 文件结构

- Modify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js` — 素材卡片头部 DOM 结构。
- Modify: `apps/web/src/features/production-workbench/production-workbench.css` — 标题行、操作行、按钮定位和卡片高度。
- Modify: `apps/web/tests/episode-asset-description-editor.spec.mjs` — 标题编辑器仍可编辑且位于标题行的回归测试。
- Modify: `apps/web/tests/project-workbench-generation.spec.ts` — 三类素材卡片操作行及非重叠 CSS 的回归测试。

### Task 1: 用测试固定两层头部结构

**Files:**
- Modify: `apps/web/tests/episode-asset-description-editor.spec.mjs:9-22`
- Modify: `apps/web/tests/project-workbench-generation.spec.ts:42920-42939`

- [x] **Step 1: 扩展标题编辑器渲染断言**

在首个测试中保留已启用、`maxlength="20"` 和数据属性断言，并新增标题行容器断言：

```js
assert.match(html, /class="episode-replica-asset-title-row"/);
assert.match(html, /episode-replica-asset-title-row[\s\S]*episode-replica-asset-name-input/);
```

- [x] **Step 2: 将旧的绝对定位断言替换为正常流断言**

在生图工作台测试中断言操作行存在、导入按钮位于操作行内、标题不再预留 `10.75rem`，并检查新布局规则：

```js
assert.match(html, /episode-replica-asset-actions-row[\s\S]*episode-replica-asset-dialog-import/);
assert.match(css, /\.episode-replica-asset-card-head\s*\{[^}]*display:\s*grid/);
assert.match(css, /\.episode-replica-asset-title-row\s*\{[^}]*grid-template-columns:\s*1rem\s+minmax\(0,\s*1fr\)/);
assert.match(css, /\.episode-replica-asset-actions-row\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/);
assert.doesNotMatch(css, /\.episode-replica-asset-dialog-import\s*\{[^}]*position:\s*absolute/);
assert.doesNotMatch(css, /\.episode-replica-asset-card \.name\s*\{[^}]*padding-right:\s*10\.75rem/);
```

- [x] **Step 3: 运行测试并确认新断言先失败**

Run:

```powershell
node --test apps/web/tests/episode-asset-description-editor.spec.mjs
node scripts/run-tests.mjs apps/web/tests/project-workbench-generation.spec.ts -- --test-name-pattern "renders asset selection and action tools in stable header rows|keeps storyboard cards compact while giving asset actions enough room|renders current episode assets across character scene and prop sections in episode workbench"
```

Expected: 标题行/操作行以及正常流 CSS 的新断言失败，其他既有行为断言保持通过。

### Task 2: 实现舒适的标题与操作布局

**Files:**
- Modify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js:747-757`
- Modify: `apps/web/src/features/production-workbench/production-workbench.css:29205-29211,32051-32077,33678-33711,34073-34078,37265-37300`

- [x] **Step 1: 将头部模板拆成标题行和操作行**

保持所有 action 与 data 属性不变，仅增加容器并让可见按钮不再位于 `aria-hidden` 容器：

```html
<div class="episode-replica-asset-card-head">
  <div class="episode-replica-asset-title-row">
    <button class="pick ..."></button>
    <label class="episode-replica-asset-select">
      <input class="episode-replica-asset-name-input name" ... />
    </label>
  </div>
  <div class="episode-replica-asset-actions-row">
    <button class="episode-replica-shot-dialog-import episode-replica-asset-dialog-import" ...>引入到对话框</button>
    <span class="episode-replica-asset-hover-tools">
      <button ...>+</button>
      <button ...>×</button>
    </span>
  </div>
</div>
```

- [x] **Step 2: 改为两层正常流布局**

加入并应用以下核心规则，保留现有主题色和交互态：

```css
.episode-replica-asset-card-head {
  display: grid;
  gap: 0.52rem;
  min-height: 4.35rem;
}

.episode-replica-asset-title-row {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr);
  gap: 0.58rem;
  align-items: center;
  min-width: 0;
}

.episode-replica-asset-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  min-width: 0;
}

.episode-replica-asset-dialog-import,
.episode-replica-asset-hover-tools,
.episode-replica-asset-card-head .pick {
  position: static;
  transform: none;
}
```

同时把标题的 `margin-left`、`padding-right` 清零，输入框宽度改为 `100%`；工具按钮保持可见、可点击并靠右。桌面卡片高度从 `14.2rem` 增至约 `16.5rem`，避免头部增高挤压描述区；小屏操作行允许换行。

- [x] **Step 3: 运行定向测试并确认通过**

Run:

```powershell
node --test apps/web/tests/episode-asset-description-editor.spec.mjs
node scripts/run-tests.mjs apps/web/tests/project-workbench-generation.spec.ts -- --test-name-pattern "renders asset selection and action tools in stable header rows|keeps storyboard cards compact while giving asset actions enough room|renders current episode assets across character scene and prop sections in episode workbench"
```

Expected: 两个命令均退出码 0，新旧断言全部通过。

### Task 3: 浏览器视觉回归与最终复核

**Files:**
- Verify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`
- Verify: `apps/web/src/features/production-workbench/production-workbench.css`

- [x] **Step 1: 按项目 `.env` 启动现有 Web 应用**

只使用项目已有启动命令和 `.env` 连接配置，不替换服务地址。若配置的服务连接失败，记录对应服务和键名后停止。

- [x] **Step 2: 使用 gstack 浏览器检查桌面布局**

在生图页检查角色、场景、道具卡片：短标题完整显示；长标题只在真实超过整行时省略；“引入到对话框”完整显示；保存/删除按钮靠右且与标题无覆盖；键盘聚焦样式仍清晰。

- [x] **Step 3: 检查窄屏布局和控制台**

将视口缩窄到单列断点，确认操作行自然换行而不重叠；检查控制台无新增错误。

- [x] **Step 4: 最终差异复核**

Run:

```powershell
git diff --check
git diff -- apps/web/src/features/production-workbench/episode-workbench-rebuilt.js apps/web/src/features/production-workbench/production-workbench.css apps/web/tests/episode-asset-description-editor.spec.mjs apps/web/tests/project-workbench-generation.spec.ts
git status --short
```

Expected: `git diff --check` 无输出；差异仅包含本次布局、测试和设计/计划文档，没有无关业务改动。
