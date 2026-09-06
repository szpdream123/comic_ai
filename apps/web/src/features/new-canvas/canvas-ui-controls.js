const SELECT_ENHANCED = "data-canvas-select-enhanced";
let globalStylesInstalled = false;

function ensureGlobalStyles() {
  if (globalStylesInstalled || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.dataset.canvasUiControls = "true";
  style.textContent = `.canvas-ui-select-menu{display:grid;gap:2px;padding:5px;overflow:auto;border:1px solid #3a4a53;border-radius:5px;background:#11191e;box-shadow:0 12px 28px rgba(0,0,0,.4)}.canvas-ui-select-option{min-height:29px;padding:5px 9px;border:0;border-radius:3px;background:transparent;color:#d9e6e8;font:inherit;text-align:left;cursor:pointer}.canvas-ui-select-option:hover:not(:disabled),.canvas-ui-select-option.is-active{background:#263a43;color:#fff}.canvas-ui-select-option:disabled{opacity:.45;cursor:not-allowed}.canvas-confirm-backdrop{position:fixed;inset:0;z-index:2147483640;display:grid;place-items:center;padding:20px;background:rgba(3,8,10,.62)}.canvas-confirm-dialog{width:min(420px,100%);padding:20px;border:1px solid #3d515b;border-radius:6px;background:#11191e;color:#e8f0f1;box-shadow:0 20px 55px rgba(0,0,0,.48)}.canvas-confirm-dialog h2{margin:0 0 10px;font-size:16px}.canvas-confirm-dialog p{margin:0;color:#b4c2c5;line-height:1.55;white-space:pre-wrap}.canvas-confirm-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.canvas-confirm-dialog button{min-height:32px;padding:6px 14px;border:1px solid #42555c;border-radius:4px;background:#1a252a;color:#e8f0f1;cursor:pointer}.canvas-confirm-dialog button.is-primary{border-color:#78aebc;background:#2d6874}`;
  document.head?.append(style);
  globalStylesInstalled = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function closeMenu(select) {
  const menu = select.__canvasSelectMenu;
  menu?.remove?.();
  select.__canvasSelectMenu = null;
  select.__canvasSelectOpen = false;
}

function openMenu(select, trigger) {
  closeMenu(select);
  const menu = document.createElement("div");
  menu.className = "canvas-ui-select-menu";
  menu.setAttribute("role", "listbox");
  const rect = trigger.getBoundingClientRect();
  Object.assign(menu.style, {
    position: "fixed",
    left: `${Math.max(6, rect.left)}px`,
    top: `${Math.min(window.innerHeight - 12, rect.bottom + 4)}px`,
    minWidth: `${Math.max(120, rect.width)}px`,
    maxHeight: `calc(100vh - ${Math.max(12, rect.bottom + 12)}px)`,
    zIndex: "2147483000",
  });
  [...select.options].forEach((option, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `canvas-ui-select-option${option.selected ? " is-active" : ""}`;
    item.disabled = option.disabled;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.selected));
    item.textContent = option.textContent ?? option.value;
    item.addEventListener("click", () => {
      if (option.disabled) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeMenu(select);
      trigger.textContent = option.textContent ?? option.value;
      trigger.append(Object.assign(document.createElement("span"), { className: "canvas-ui-select-chevron", textContent: "▾" }));
    });
    menu.append(item);
  });
  document.body.append(menu);
  select.__canvasSelectMenu = menu;
  select.__canvasSelectOpen = true;
  const dismiss = (event) => {
    if (!menu.contains(event.target) && event.target !== trigger) {
      closeMenu(select);
      document.removeEventListener("mousedown", dismiss, true);
    }
  };
  document.addEventListener("mousedown", dismiss, true);
}

export function enhanceCanvasSelects(root) {
  if (!root?.querySelectorAll) return;
  ensureGlobalStyles();
  root.querySelectorAll("select:not([data-canvas-select-enhanced])").forEach((select) => {
    select.setAttribute(SELECT_ENHANCED, "");
    const wrapper = document.createElement("span");
    wrapper.className = "canvas-ui-select";
    select.parentNode?.insertBefore(wrapper, select);
    wrapper.append(select);
    select.classList.add("canvas-ui-select-native");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "canvas-ui-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "选择");
    const sync = () => {
      trigger.disabled = select.disabled;
      trigger.textContent = select.selectedOptions?.[0]?.textContent ?? "请选择";
      trigger.append(Object.assign(document.createElement("span"), { className: "canvas-ui-select-chevron", textContent: "▾" }));
    };
    sync();
    trigger.addEventListener("click", () => {
      if (!select.disabled) openMenu(select, trigger);
    });
    select.addEventListener("change", sync);
    wrapper.append(trigger);
  });
}

export function installCanvasSelectEnhancer(root) {
  if (!root || root.__canvasSelectObserver || typeof MutationObserver === "undefined") return () => {};
  const enhance = () => enhanceCanvasSelects(root);
  enhance();
  const observer = new MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });
  root.__canvasSelectObserver = observer;
  return () => {
    observer.disconnect();
    root.__canvasSelectObserver = null;
  };
}

let activeConfirm = null;

export function confirmCanvasAction(message, options = {}) {
  if (typeof document === "undefined" || !document.body) {
    return Promise.resolve(typeof globalThis.window?.confirm === "function" ? globalThis.window.confirm(message) : false);
  }
  ensureGlobalStyles();
  if (activeConfirm) activeConfirm.resolve(false);
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "canvas-confirm-backdrop";
    backdrop.setAttribute("role", "alertdialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.innerHTML = `<div class="canvas-confirm-dialog"><h2>${escapeHtml(options.title || "确认操作")}</h2><p>${escapeHtml(message)}</p><footer><button type="button" data-confirm-cancel>取消</button><button type="button" class="is-primary" data-confirm-ok>确认</button></footer></div>`;
    const finish = (result) => {
      if (!activeConfirm || activeConfirm.backdrop !== backdrop) return;
      activeConfirm = null;
      backdrop.remove();
      resolve(result);
    };
    activeConfirm = { backdrop, resolve: finish };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest?.("[data-confirm-cancel]")) finish(false);
      else if (event.target.closest?.("[data-confirm-ok]")) finish(true);
    });
    document.body.append(backdrop);
    backdrop.querySelector("[data-confirm-ok]")?.focus?.();
  });
}
