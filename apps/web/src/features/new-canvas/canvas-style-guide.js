function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STATUS_ITEMS = [
  ["ready", "就绪"],
  ["running", "运行中"],
  ["completed", "已完成"],
  ["failed", "失败"],
];

export function renderCanvasStyleGuide(ui = {}) {
  const open = ui.canvasStyleGuideOpen === true;
  return `<aside class="canvas-style-guide" data-canvas-style-guide ${open ? "" : "hidden"} aria-label="画布样式指南" aria-hidden="${open ? "false" : "true"}">
    <header class="canvas-style-guide-header">
      <div><small>Canvas UI</small><h2>样式指南</h2></div>
      <button type="button" data-action="toggle-canvas-style-guide" aria-label="关闭样式指南" title="关闭样式指南">×</button>
    </header>
    <div class="canvas-style-guide-body">
      <section class="canvas-style-guide-section" aria-labelledby="canvas-style-guide-buttons">
        <h3 id="canvas-style-guide-buttons">Button</h3>
        <div class="canvas-style-guide-row"><button type="button" class="canvas-style-guide-button is-primary">主要操作</button><button type="button" class="canvas-style-guide-button">次要操作</button><button type="button" class="canvas-style-guide-button is-danger">删除</button></div>
      </section>
      <section class="canvas-style-guide-section" aria-labelledby="canvas-style-guide-select">
        <h3 id="canvas-style-guide-select">Select</h3>
        <label class="canvas-style-guide-select-label"><span>模型</span><select aria-label="样式指南模型"><option>默认模型</option><option>高质量模型</option></select></label>
      </section>
      <section class="canvas-style-guide-section" aria-labelledby="canvas-style-guide-dialog">
        <h3 id="canvas-style-guide-dialog">Dialog</h3>
        <div class="canvas-style-guide-dialog-preview"><strong>确认操作</strong><p>删除后无法恢复，是否继续？</p><footer><button type="button" class="canvas-style-guide-button">取消</button><button type="button" class="canvas-style-guide-button is-primary">确认</button></footer></div>
      </section>
      <section class="canvas-style-guide-section" aria-labelledby="canvas-style-guide-toolbar">
        <h3 id="canvas-style-guide-toolbar">节点工具栏</h3>
        <div class="canvas-style-guide-node-toolbar"><button type="button" aria-label="复制节点" title="复制节点">⧉</button><button type="button" aria-label="编辑节点" title="编辑节点">✎</button><button type="button" class="is-danger" aria-label="删除节点" title="删除节点">⌫</button></div>
      </section>
      <section class="canvas-style-guide-section" aria-labelledby="canvas-style-guide-status">
        <h3 id="canvas-style-guide-status">状态</h3>
        <div class="canvas-style-guide-status-row">${STATUS_ITEMS.map(([value, label]) => `<span class="canvas-style-guide-status-badge ${escapeHtml(value)}"><i aria-hidden="true"></i>${escapeHtml(label)}</span>`).join("")}</div>
      </section>
    </div>
  </aside>`;
}

