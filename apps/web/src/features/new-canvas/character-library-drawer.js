import { resolveStaticAssetUrl } from "../../shared/static-asset-url.js";

const IMAGE_NODE_TYPES = new Set(["image", "source-image", "ai-image", "ai-panorama"]);
const LIBRARY_CHARACTER_SCOPES = new Set(["official", "team"]);
const LIBRARY_CATEGORIES = [
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
  { id: "voice", label: "音色" },
];
const TEAM_LIBRARY_CATEGORIES = [{ id: "all", label: "全部" }, ...LIBRARY_CATEGORIES];

export function ensureCanvasCharacterLibraryState(ui = {}) {
  const state = ui.canvasCharacterLibrary && typeof ui.canvasCharacterLibrary === "object"
    ? ui.canvasCharacterLibrary
    : {};
  Object.assign(state, {
    open: false,
    scope: "canvas",
    libraryCategory: "character",
    libraryFolder: "",
    libraryFolders: [],
    libraryPage: 1,
    libraryPageSize: 12,
    libraryDetailId: "",
    query: "",
    loading: false,
    busyAction: "",
    error: "",
    characters: [],
    selectedCharacterId: "",
    editorOpen: false,
    editingCharacterId: "",
    deleteConfirmId: "",
    captureNode: null,
    libraryEntitlement: null,
    draft: emptyCharacterDraft("canvas"),
    ...state,
  });
  if (state.scope === "global") state.scope = "canvas";
  state.draft = {
    ...emptyCharacterDraft(state.scope),
    ...(state.draft && typeof state.draft === "object" ? state.draft : {}),
    references: Array.isArray(state.draft?.references) ? state.draft.references : [],
  };
  ui.canvasCharacterLibrary = state;
  return state;
}

export function renderCanvasCharacterLibraryShell(ui = {}) {
  const state = ensureCanvasCharacterLibraryState(ui);
  const selectedNode = findSelectedImageNode(ui);
  return `
    <div class="canvas-character-library-shell" data-character-library-shell>
      ${state.open ? renderCharacterLibrary(state, selectedNode) : ""}
    </div>
  `;
}

export function createCanvasCharacterLibraryController({ surface, workbench }) {
  const state = ensureCanvasCharacterLibraryState(workbench.ui ?? (workbench.ui = {}));
  let disposed = false;
  const previousCapture = workbench.onCharacterCapture;

  const sync = () => {
    if (disposed || typeof document === "undefined") return false;
    const current = surface.querySelector?.("[data-character-library-shell]");
    if (!current) return false;
    const template = document.createElement("template");
    template.innerHTML = renderCanvasCharacterLibraryShell(workbench.ui);
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    return true;
  };

  const run = async (action, operation) => {
    if (state.busyAction) return;
    state.busyAction = action;
    state.error = "";
    sync();
    try {
      await operation();
    } catch (error) {
      state.error = String(error?.message ?? error ?? "角色库请求失败");
    } finally {
      state.busyAction = "";
      sync();
    }
  };

  const load = async () => {
    const canvasId = selectedCanvasId(workbench);
    if (isLibraryCharacterScope(state.scope)) {
      if (typeof workbench.api?.getLibraryAssets !== "function") {
        state.error = "官方/团队资产库接口暂不可用";
        sync();
        return [];
      }
    } else if (!canvasId || typeof workbench.api?.listCanvasCharacters !== "function") {
      state.error = "角色库接口暂不可用";
      sync();
      return [];
    }
    state.loading = true;
    sync();
    try {
      if (isLibraryCharacterScope(state.scope)) {
        const input = { scope: state.scope };
        if (state.libraryCategory !== "all") input.category = state.libraryCategory;
        const payload = await workbench.api.getLibraryAssets(input);
        state.libraryEntitlement = payload?.entitlement ?? payload?.body?.entitlement ?? null;
        state.characters = readLibraryCharacterList(payload, state.scope);
        state.libraryFolders = Array.isArray(payload?.folders)
          ? payload.folders.filter((folder) => String(folder ?? "").trim())
          : libraryCharacterFolders(state.characters);
      } else {
        const payload = await workbench.api.listCanvasCharacters(canvasId, {
          scope: state.scope,
          limit: 200,
        });
        state.libraryEntitlement = null;
        state.characters = readCharacterList(payload);
        state.libraryFolders = [];
      }
      if (isLibraryCharacterScope(state.scope)) {
        state.selectedCharacterId = "";
        if (!state.characters.some((item) => characterId(item) === state.libraryDetailId)) {
          state.libraryDetailId = "";
        }
      } else if (!state.characters.some((item) => characterId(item) === state.selectedCharacterId)) {
        state.selectedCharacterId = characterId(state.characters[0]);
      }
      if (state.libraryFolder && !state.libraryFolders.includes(state.libraryFolder)) {
        state.libraryFolder = "";
      }
      return state.characters;
    } finally {
      state.loading = false;
      sync();
    }
  };

  const hydrateCaptureReference = async (node) => {
    const taskId = firstString(node?.data?.generationTaskId, node?.data?.lastTaskId, node?.data?.taskId);
    if (!taskId || state.draft.references.length || typeof workbench.api?.getGenerationTask !== "function") return false;
    try {
      const payload = await workbench.api.getGenerationTask(taskId);
      if (disposed || String(state.captureNode?.id ?? "") !== String(node?.id ?? "")) return false;
      const reference = referenceFromGenerationTask(node, payload, 0);
      if (!reference || state.draft.references.length) return false;
      state.draft = {
        ...state.draft,
        references: [reference],
        primaryReferenceId: reference.id,
        avatarReferenceId: reference.id,
      };
      sync();
      return true;
    } catch {
      return false;
    }
  };

  const openCapture = (node = findSelectedImageNode(workbench.ui)) => {
    if (!isImageNode(node)) return false;
    state.open = true;
    state.captureNode = node;
    state.scope = "canvas";
    state.editorOpen = true;
    state.editingCharacterId = "";
    state.draft = draftFromNode(node, state.scope);
    sync();
    void hydrateCaptureReference(node);
    void run("load", load);
    return true;
  };
  workbench.onCharacterCapture = openCapture;

  return {
    sync,
    load,
    handleInput(target) {
      const field = String(target?.dataset?.characterField ?? "");
      if (!field) return false;
      if (field === "query") {
        state.query = String(target.value ?? "");
        state.libraryPage = 1;
        state.libraryDetailId = "";
        return true;
      }
      if (field.startsWith("draft.")) {
        const key = field.slice(6);
        if (!Object.hasOwn(state.draft, key)) return false;
        state.draft = { ...state.draft, [key]: String(target.value ?? "") };
        return true;
      }
      return false;
    },
    async handleAction(target) {
      const action = String(target?.dataset?.characterAction ?? "");
      if (!action) return false;
      if (action === "open") {
        state.open = true;
        sync();
        await run("load", load);
        return true;
      }
      if (action === "close") {
        state.open = false;
        state.libraryDetailId = "";
        state.deleteConfirmId = "";
        state.captureNode = null;
        sync();
        return true;
      }
      if (action === "scope") {
        state.scope = normalizeCharacterScope(target.dataset.characterScope);
        state.libraryCategory = "character";
        state.libraryFolder = "";
        state.libraryPage = 1;
        state.libraryDetailId = "";
        state.selectedCharacterId = "";
        state.editorOpen = false;
        state.captureNode = null;
        sync();
        await run("load", load);
        return true;
      }
      if (action === "library-category") {
        if (!isLibraryCharacterScope(state.scope)) return true;
        const category = String(target.dataset.characterCategory ?? "");
        if (!libraryCategoriesForScope(state.scope).some((item) => item.id === category)) return true;
        state.libraryCategory = category;
        state.libraryFolder = "";
        state.libraryPage = 1;
        state.libraryDetailId = "";
        state.selectedCharacterId = "";
        sync();
        await run("load", load);
        return true;
      }
      if (action === "library-folder") {
        state.libraryFolder = String(target.dataset.characterFolder ?? "");
        state.libraryPage = 1;
        state.libraryDetailId = "";
        state.selectedCharacterId = "";
        sync();
        return true;
      }
      if (action === "library-page") {
        state.libraryPage = Math.max(1, Math.trunc(number(target.dataset.characterPage, 1)));
        state.libraryDetailId = "";
        sync();
        return true;
      }
      if (action === "library-detail-open") {
        state.libraryDetailId = String(target.dataset.characterId ?? "");
        sync();
        return true;
      }
      if (action === "library-detail-close") {
        state.libraryDetailId = "";
        sync();
        return true;
      }
      if (action === "add-library-asset") {
        if (!isLibraryCharacterScope(state.scope)) return true;
        const character = findCharacter(state, target.dataset.characterId);
        if (!character?.libraryAsset) return true;
        await run("add-library-asset", async () => {
          if (typeof workbench.addCharacterLibraryAssetToCanvas !== "function") {
            throw new Error("添加素材功能暂不可用");
          }
          await workbench.addCharacterLibraryAssetToCanvas(character);
        });
        return true;
      }
      if (action === "search" || action === "refresh") {
        sync();
        return true;
      }
      if (action === "preview-references") {
        sync();
        return true;
      }
      if (action === "select") {
        state.selectedCharacterId = String(target.dataset.characterId ?? "");
        state.editorOpen = false;
        state.deleteConfirmId = "";
        sync();
        return true;
      }
      if (action === "new") {
        if (isLibraryCharacterScope(state.scope)) return true;
        state.editorOpen = true;
        state.editingCharacterId = "";
        state.captureNode = null;
        state.draft = emptyCharacterDraft(state.scope);
        sync();
        return true;
      }
      if (action === "edit") {
        if (isLibraryCharacterScope(state.scope)) return true;
        const character = findCharacter(state, target.dataset.characterId ?? state.selectedCharacterId);
        if (!character) return true;
        state.editorOpen = true;
        state.editingCharacterId = characterId(character);
        state.captureNode = null;
        state.draft = draftFromCharacter(character, state.scope);
        sync();
        return true;
      }
      if (action === "cancel-edit") {
        state.editorOpen = false;
        state.editingCharacterId = "";
        state.captureNode = null;
        state.draft = emptyCharacterDraft(state.scope);
        sync();
        return true;
      }
      if (action === "capture") {
        if (!openCapture()) {
          state.error = "请先选择一个图片节点";
          sync();
        }
        return true;
      }
      if (action === "add-selected-reference") {
        const node = findSelectedImageNode(workbench.ui);
        const reference = referenceFromNode(node, state.draft.references.length);
        if (!reference) {
          state.error = "当前图片节点没有可复用的云端资产引用";
        } else if (!state.draft.references.some((item) => sameReference(item, reference))) {
          state.draft = { ...state.draft, references: [...state.draft.references, reference] };
          if (!state.draft.primaryReferenceId) state.draft.primaryReferenceId = reference.id;
          if (!state.draft.avatarReferenceId) state.draft.avatarReferenceId = reference.id;
          state.error = "";
        }
        sync();
        return true;
      }
      if (action === "remove-reference") {
        const referenceId = String(target.dataset.referenceId ?? "");
        state.draft = {
          ...state.draft,
          references: state.draft.references.filter((item) => item.id !== referenceId),
          primaryReferenceId: state.draft.primaryReferenceId === referenceId ? "" : state.draft.primaryReferenceId,
          avatarReferenceId: state.draft.avatarReferenceId === referenceId ? "" : state.draft.avatarReferenceId,
        };
        sync();
        return true;
      }
      if (action === "save") {
        if (isLibraryCharacterScope(state.scope)) return true;
        await run("save", async () => {
          const canvasId = requireCanvasId(workbench);
          const input = characterDraftPayload(state.draft, state.scope);
          if (!input.name) throw new Error("请输入角色名称");
          if (state.captureNode && input.references.length === 0) throw new Error("当前图片节点没有可复用的云端资产引用");
          let payload;
          if (state.editingCharacterId) {
            requireApi(workbench, "updateCanvasCharacter");
            const current = findCharacter(state, state.editingCharacterId);
            if (!current) throw new Error("角色已发生变化，请刷新后重试");
            payload = await workbench.api.updateCanvasCharacter(canvasId, state.editingCharacterId, {
              expectedRevision: Number(current.revision),
              patch: { name: input.name, description: input.description, prompt: input.prompt },
            });
            const updated = readCharacter(payload) ?? payload;
            payload = await syncCharacterReferences(workbench, canvasId, updated, current, state.draft);
          } else {
            requireApi(workbench, "createCanvasCharacter");
            payload = await workbench.api.createCanvasCharacter(canvasId, input);
          }
          const saved = readCharacter(payload) ?? input;
          if (state.captureNode && typeof workbench.applyCharacterNodeCapture === "function") {
            await workbench.applyCharacterNodeCapture({ nodeId: String(state.captureNode.id), characterId: characterId(saved) });
          }
          state.editorOpen = false;
          state.editingCharacterId = "";
          state.captureNode = null;
          await load();
          const savedId = characterId(saved);
          if (savedId) state.selectedCharacterId = savedId;
        });
        return true;
      }
      if (action === "reference-main" || action === "reference-avatar") {
        const referenceId = String(target.dataset.referenceId ?? "");
        if (action === "reference-main") state.draft.primaryReferenceId = referenceId;
        else state.draft.avatarReferenceId = referenceId;
        sync();
        return true;
      }
      if (action === "delete") {
        if (isLibraryCharacterScope(state.scope)) return true;
        state.deleteConfirmId = String(target.dataset.characterId ?? state.selectedCharacterId);
        sync();
        return true;
      }
      if (action === "cancel-delete") {
        state.deleteConfirmId = "";
        sync();
        return true;
      }
      if (action === "confirm-delete") {
        if (isLibraryCharacterScope(state.scope)) return true;
        await run("delete", async () => {
          const canvasId = requireCanvasId(workbench);
          const character = findCharacter(state, state.deleteConfirmId);
          if (!character) throw new Error("请选择角色");
          requireApi(workbench, "deleteCanvasCharacter");
          const deleted = await workbench.api.deleteCanvasCharacter(canvasId, state.deleteConfirmId, {
            expectedRevision: Number(character.revision),
          });
          const sourceNodeIds = Array.isArray(deleted?.sourceNodeIds)
            ? deleted.sourceNodeIds
            : Array.isArray(deleted?.data?.sourceNodeIds) ? deleted.data.sourceNodeIds : [];
          if (sourceNodeIds.length && typeof workbench.restoreCharacterNodes === "function") {
            await workbench.restoreCharacterNodes(sourceNodeIds);
          }
          state.deleteConfirmId = "";
          state.selectedCharacterId = "";
          await load();
        });
        return true;
      }
      if (action === "copy-scope") {
        if (isLibraryCharacterScope(state.scope)) return true;
        await run("copy", async () => {
          const canvasId = requireCanvasId(workbench);
          const id = String(target.dataset.characterId ?? state.selectedCharacterId);
          const character = findCharacter(state, id);
          if (!character) throw new Error("请选择角色");
          const targetScope = state.scope === "global" ? "canvas" : "global";
          requireApi(workbench, "copyCanvasCharacter");
          await workbench.api.copyCanvasCharacter(canvasId, id, { expectedRevision: Number(character.revision), targetScope });
          state.scope = targetScope;
          state.selectedCharacterId = "";
          await load();
        });
        return true;
      }
      if (action === "focus") {
        const character = findCharacter(state, target.dataset.characterId ?? state.selectedCharacterId);
        const nodeId = characterSourceNodeId(character);
        if (nodeId && typeof workbench.focusCharacterNode === "function") {
          await workbench.focusCharacterNode(nodeId);
        } else if (character) {
          focusSourceNode(workbench, character);
        }
        return true;
      }
      return false;
    },
    handleKeydown(event) {
      if (!state.open || event?.key !== "Escape") return false;
      if (state.libraryDetailId) {
        state.libraryDetailId = "";
        sync();
        return true;
      }
      state.open = false;
      state.deleteConfirmId = "";
      sync();
      return true;
    },
    dispose() {
      disposed = true;
      if (workbench.onCharacterCapture === openCapture) {
        if (typeof previousCapture === "function") workbench.onCharacterCapture = previousCapture;
        else delete workbench.onCharacterCapture;
      }
    },
    get disposed() { return disposed; },
  };
}

export function normalizeCharacterAvatarCrop(value = {}) {
  const width = clamp(number(value.width, 1), 0.05, 1);
  const height = clamp(number(value.height, 1), 0.05, 1);
  return {
    x: clamp(number(value.x, 0), 0, 1 - width),
    y: clamp(number(value.y, 0), 0, 1 - height),
    width,
    height,
  };
}

function renderCharacterLibrary(state, selectedNode) {
  const visibleCharacters = filterCharacters(state.characters, state.query)
    .filter((character) => !state.libraryFolder || libraryCharacterFolder(character) === state.libraryFolder);
  const libraryScope = isLibraryCharacterScope(state.scope);
  const libraryCategories = libraryCategoriesForScope(state.scope);
  const libraryFolders = libraryScope ? state.libraryFolders : [];
  const pageSize = Math.max(1, Math.trunc(number(state.libraryPageSize, 12)));
  const totalPages = Math.max(1, Math.ceil(visibleCharacters.length / pageSize));
  const libraryPage = clamp(Math.trunc(number(state.libraryPage, 1)), 1, totalPages);
  const pageCharacters = libraryScope
    ? visibleCharacters.slice((libraryPage - 1) * pageSize, libraryPage * pageSize)
    : visibleCharacters;
  const selected = libraryScope
    ? findCharacter(state, state.libraryDetailId)
    : findCharacter(state, state.selectedCharacterId);
  state.libraryPage = libraryPage;
  return `
    <div class="canvas-character-library-backdrop">
      <section class="canvas-character-library ${libraryScope ? "is-library-scope" : ""}" role="dialog" aria-modal="true" aria-label="角色库">
        <header class="canvas-character-library__header">
          <div><span>CANVAS CAST</span><strong>角色库</strong></div>
          <div class="canvas-character-library__header-actions">
            ${libraryScope ? "" : `<button type="button" data-character-action="capture" ${selectedNode ? "" : "disabled"}>从图片节点捕获</button><button type="button" data-character-action="new">新建角色</button>`}
            <button type="button" data-character-action="close" aria-label="关闭角色库">×</button>
          </div>
        </header>
        <div class="canvas-character-library__toolbar">
          <div class="canvas-character-scope-tabs" role="tablist" aria-label="角色范围">
            <button type="button" role="tab" aria-selected="${state.scope === "canvas"}" class="${state.scope === "canvas" ? "active" : ""}" data-character-action="scope" data-character-scope="canvas">本画布</button>
            <button type="button" role="tab" aria-selected="${state.scope === "official"}" class="${state.scope === "official" ? "active" : ""}" data-character-action="scope" data-character-scope="official">官方资产库</button>
            <button type="button" role="tab" aria-selected="${state.scope === "team"}" class="${state.scope === "team" ? "active" : ""}" data-character-action="scope" data-character-scope="team">团队资产库</button>
          </div>
          <div class="canvas-character-search">
            <input type="search" data-character-field="query" value="${escapeAttr(state.query)}" placeholder="搜索角色名称、用途或提示词" />
            <button type="button" data-character-action="search">搜索</button>
          </div>
        </div>
        ${libraryScope ? `<div class="canvas-character-library-categories" role="tablist" aria-label="资产分类">
          ${libraryCategories.map((category) => `<button type="button" role="tab" aria-selected="${state.libraryCategory === category.id}" class="${state.libraryCategory === category.id ? "active" : ""}" data-character-action="library-category" data-character-category="${category.id}">${category.label}</button>`).join("")}
        </div>
        <div class="canvas-character-library-folders" role="tablist" aria-label="资产文件夹">
          <button type="button" role="tab" aria-selected="${!state.libraryFolder}" class="${!state.libraryFolder ? "active" : ""}" data-character-action="library-folder" data-character-folder="">全部</button>
          ${libraryFolders.map((folder) => `<button type="button" role="tab" aria-selected="${state.libraryFolder === folder}" class="${state.libraryFolder === folder ? "active" : ""}" data-character-action="library-folder" data-character-folder="${escapeAttr(folder)}">${escapeHtml(folder)}</button>`).join("")}
        </div>` : ""}
        <div class="canvas-character-strip ${libraryScope ? "is-library-grid" : ""}" role="list" aria-label="角色列表">
          ${state.loading ? `<p class="canvas-character-empty">正在加载${libraryScope ? "资产" : "角色"}...</p>` : isLockedLibraryScope(state)
            ? `<p class="canvas-character-empty canvas-character-library-locked"><strong>团队资产库为专业版会员权益</strong><span>开通后可在画布内复用团队角色资产。</span></p>`
            : pageCharacters.length
            ? pageCharacters.map((character) => renderCharacterCard(character, libraryScope ? state.libraryDetailId : state.selectedCharacterId)).join("")
            : `<p class="canvas-character-empty">${state.query ? "没有匹配的资产" : libraryScope ? "这里还没有可用资产" : "这里还没有角色"}</p>`}
        </div>
        ${libraryScope ? renderLibraryPagination(libraryPage, totalPages, visibleCharacters.length) : `<main class="canvas-character-library__body">
          ${state.editorOpen ? renderEditor(state) : selected ? renderCharacterDetail(state, selected) : renderEmptyDetail(selectedNode)}
        </main>`}
        ${state.error ? `<p class="canvas-character-library__error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        ${libraryScope && selected ? renderLibraryCharacterDetailModal(state, selected) : ""}
      </section>
    </div>
  `;
}

function renderCharacterCard(character, selectedId) {
  const id = characterId(character);
  const libraryScope = String(character.libraryScope ?? "");
  const scopeLabel = libraryScope === "team" ? "团队资产" : libraryScope === "official" ? "官方资产" : "";
  if (libraryScope) {
    return `<article role="listitem" class="canvas-character-card is-library-asset ${id === selectedId ? "active" : ""}">
      <button type="button" class="canvas-character-card__open" data-character-action="library-detail-open" data-character-id="${escapeAttr(id)}">
        <span class="canvas-character-card__image">${renderImage(characterAvatarUrl(character) || characterPrimaryUrl(character), characterName(character))}</span>
        <span class="canvas-character-card__copy"><strong>${escapeHtml(characterName(character))}</strong><small>${escapeHtml(scopeLabel || character.usage || character.purpose || character.description || "未设置用途")}</small></span>
      </button>
      <button type="button" class="canvas-character-card__add-material" data-character-action="add-library-asset" data-character-id="${escapeAttr(id)}">添加素材</button>
    </article>`;
  }
  return `<button type="button" role="listitem" class="canvas-character-card ${libraryScope ? "is-library-asset" : ""} ${id === selectedId ? "active" : ""}" data-character-action="${libraryScope ? "library-detail-open" : "select"}" data-character-id="${escapeAttr(id)}">
    <span class="canvas-character-card__image">${renderImage(characterAvatarUrl(character) || characterPrimaryUrl(character), characterName(character))}</span>
    <span class="canvas-character-card__copy"><strong>${escapeHtml(characterName(character))}</strong><small>${escapeHtml(scopeLabel || character.usage || character.purpose || character.description || "未设置用途")}</small></span>
  </button>`;
}

function renderLibraryPagination(page, totalPages, totalItems) {
  return `<footer class="canvas-character-library-pagination" aria-label="资产分页">
    <span>共 ${totalItems} 项</span>
    <div>
      <button type="button" data-character-action="library-page" data-character-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <strong>${page} / ${totalPages}</strong>
      <button type="button" data-character-action="library-page" data-character-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    </div>
  </footer>`;
}

function renderLibraryCharacterDetailModal(state, character) {
  return `<div class="canvas-character-library-detail-overlay">
    <section class="canvas-character-library-detail-dialog" role="dialog" aria-modal="true" aria-label="${escapeAttr(characterName(character))}资产详情">
      <button class="canvas-character-library-detail-close" type="button" data-character-action="library-detail-close" aria-label="关闭资产详情">×</button>
      ${renderLibraryCharacterDetail(state, character)}
    </section>
  </div>`;
}

function renderLibraryCharacterDetail(state, character) {
  const libraryAsset = character.libraryAsset ?? {};
  const scopeLabel = state.scope === "team" ? "团队资产库" : "官方资产库";
  const folder = String(libraryAsset.folder ?? libraryAsset.folderName ?? "未分类");
  const tags = Array.isArray(libraryAsset.tags) ? libraryAsset.tags.filter(Boolean) : [];
  return `
    <section class="canvas-character-detail is-library-asset">
      <div class="canvas-character-detail__visual">
        <div class="canvas-character-hero">${renderImage(characterPrimaryUrl(character), `${characterName(character)}主视觉`)}</div>
        <div class="canvas-character-avatar">${renderImage(characterAvatarUrl(character) || characterPrimaryUrl(character), `${characterName(character)}头像`)}</div>
      </div>
      <div class="canvas-character-detail__content">
        <div class="canvas-character-detail__title"><div><small>${escapeHtml(state.scope === "team" ? "TEAM ASSET" : "OFFICIAL ASSET")}</small><h2>${escapeHtml(characterName(character))}</h2></div><span>${escapeHtml(scopeLabel)}</span></div>
        <p>${escapeHtml(character.prompt || character.description || `${scopeLabel}中的标准角色资产，可在当前画布中作为创作参考。`)}</p>
        <dl class="canvas-character-library-meta">
          <div><dt>所属板块</dt><dd>${escapeHtml(folder)}</dd></div>
          <div><dt>资产状态</dt><dd>可用</dd></div>
        </dl>
        ${tags.length ? `<div class="canvas-character-library-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>
    </section>
  `;
}

function renderCharacterDetail(state, character) {
  const references = characterReferences(character);
  const id = characterId(character);
  return `
    <section class="canvas-character-detail">
      <div class="canvas-character-detail__visual">
        <div class="canvas-character-hero">${renderImage(characterPrimaryUrl(character), `${characterName(character)}主视觉`)}</div>
        <div class="canvas-character-avatar">${renderImage(characterAvatarUrl(character) || characterPrimaryUrl(character), `${characterName(character)}头像`)}</div>
      </div>
      <div class="canvas-character-detail__content">
        <div class="canvas-character-detail__title"><div><small>CANVAS CHARACTER</small><h2>${escapeHtml(characterName(character))}</h2></div><span>${escapeHtml(character.usage ?? character.purpose ?? character.description ?? "未设置用途")}</span></div>
        <p>${escapeHtml(character.prompt ?? character.description ?? "尚未填写角色提示词")}</p>
        <div class="canvas-character-reference-gallery" aria-label="多参考图画廊">${references.length ? references.map((reference) => `<figure>${renderImage(referenceUrl(reference), reference.label ?? characterName(character))}<figcaption>${escapeHtml(reference.label ?? "参考图")}</figcaption></figure>`).join("") : `<p>暂无参考图</p>`}</div>
        <div class="canvas-character-detail__actions">
          <button type="button" data-character-action="edit" data-character-id="${escapeAttr(id)}">编辑</button>
          <button type="button" data-character-action="focus" data-character-id="${escapeAttr(id)}" ${characterSourceNodeId(character) ? "" : "disabled"}>定位来源节点</button>
          <button type="button" class="danger" data-character-action="delete" data-character-id="${escapeAttr(id)}">删除</button>
        </div>
        ${state.deleteConfirmId === id ? `<div class="canvas-character-delete-confirm" role="alertdialog" aria-label="确认删除角色"><span>删除角色后，关联画布节点会恢复为普通图片节点。</span><button type="button" data-character-action="cancel-delete">取消</button><button type="button" class="danger" data-character-action="confirm-delete">确认删除</button></div>` : ""}
      </div>
    </section>
  `;
}

function renderEditor(state) {
  const references = draftReferences(state.draft);
  const crop = draftCrop(state.draft);
  return `<section class="canvas-character-editor">
    <div class="canvas-character-editor__form">
      <div class="canvas-character-editor__heading"><div><small>${state.captureNode ? "CAPTURE FROM NODE" : state.editingCharacterId ? "EDIT CHARACTER" : "NEW CHARACTER"}</small><h2>${state.captureNode ? "从图片节点捕获角色" : state.editingCharacterId ? "编辑角色" : "新建角色"}</h2></div><button type="button" data-character-action="cancel-edit">取消</button></div>
      <div class="canvas-character-form-grid">
        <label><span>角色名称</span><input data-character-field="draft.name" maxlength="120" value="${escapeAttr(state.draft.name)}" placeholder="例如：任小野" /></label>
        <label><span>用途</span><input data-character-field="draft.usage" maxlength="160" value="${escapeAttr(state.draft.usage)}" placeholder="主角、配角、旁白形象..." /></label>
      </div>
      <label><span>角色提示词</span><textarea data-character-field="draft.prompt" rows="4" maxlength="5000" placeholder="外观、服饰、气质和稳定特征">${escapeHtml(state.draft.prompt)}</textarea></label>
      <div class="canvas-character-editor__footer"><span>${references.length} 张参考图，最多可保留 12 张</span><button type="button" data-character-action="add-selected-reference">加入当前图片节点</button><button type="button" data-character-action="save" ${state.busyAction ? "disabled" : ""}>${state.busyAction === "save" ? "保存中" : "保存角色"}</button></div>
    </div>
    <aside class="canvas-character-editor__preview">
      <div class="canvas-character-reference-gallery is-editor" aria-label="参考图选择">${references.length ? references.map((reference, index) => `<figure class="${reference.id === state.draft.primaryReferenceId ? "is-primary" : ""} ${reference.id === state.draft.avatarReferenceId ? "is-avatar" : ""}">${renderImage(referenceUrl(reference), `参考图 ${index + 1}`)}<figcaption><span>${escapeHtml(reference.usage ?? `参考图 ${index + 1}`)}</span><button type="button" data-character-action="reference-main" data-reference-id="${escapeAttr(reference.id)}">主视觉</button><button type="button" data-character-action="reference-avatar" data-reference-id="${escapeAttr(reference.id)}">头像</button><button type="button" data-character-action="remove-reference" data-reference-id="${escapeAttr(reference.id)}" aria-label="移除参考图">×</button></figcaption></figure>`).join("") : `<p>从画布图片节点加入参考图后，可分别指定主视觉与头像。</p>`}</div>
      <div class="canvas-character-crop-panel">
        <div class="canvas-character-crop-preview">${renderCroppedAvatar(referenceUrl(references.find((item) => item.id === state.draft.avatarReferenceId) ?? references[0]), crop)}</div>
        <div class="canvas-character-crop-controls">
          ${cropField("横向", "avatarCropX", state.draft.avatarCropX)}
          ${cropField("纵向", "avatarCropY", state.draft.avatarCropY)}
          ${cropField("宽度", "avatarCropWidth", state.draft.avatarCropWidth, 5)}
          ${cropField("高度", "avatarCropHeight", state.draft.avatarCropHeight, 5)}
        </div>
        <small>头像裁切会归一化保存，换用不同分辨率参考图时保持一致。</small>
      </div>
    </aside>
  </section>`;
}

function renderEmptyDetail(selectedNode) {
  return `<section class="canvas-character-empty-detail"><strong>建立稳定的角色视觉档案</strong><p>角色可在当前画布使用；跨项目复用请从官方或团队资产库选择。</p><button type="button" data-character-action="new">新建角色</button>${selectedNode ? `<button type="button" data-character-action="capture">捕获当前图片节点</button>` : ""}</section>`;
}

function emptyCharacterDraft(scope) {
  return { scope, name: "", usage: "", prompt: "", references: [], primaryReferenceId: "", avatarReferenceId: "", avatarCropX: "0", avatarCropY: "0", avatarCropWidth: "100", avatarCropHeight: "100" };
}

function draftFromCharacter(character, scope) {
  const references = characterReferences(character);
  const avatarReference = references.find((reference) => reference?.avatar) ?? references[0];
  const primaryReference = references.find((reference) => reference?.primary) ?? references[0];
  const crop = normalizeCharacterAvatarCrop(avatarReference?.crop ?? {});
  return {
    scope,
    name: characterName(character),
    usage: String(character.usage ?? character.purpose ?? ""),
    prompt: String(character.prompt ?? character.description ?? ""),
    references: references.map((reference) => ({ ...reference })),
    primaryReferenceId: String(primaryReference?.id ?? ""),
    avatarReferenceId: String(avatarReference?.id ?? ""),
    avatarCropX: String(Math.round(crop.x * 100)),
    avatarCropY: String(Math.round(crop.y * 100)),
    avatarCropWidth: String(Math.round(crop.width * 100)),
    avatarCropHeight: String(Math.round(crop.height * 100)),
  };
}

function draftFromNode(node, scope) {
  const draft = emptyCharacterDraft(scope);
  const reference = referenceFromNode(node, 0);
  return {
    ...draft,
    name: String(node?.data?.title ?? node?.data?.name ?? "新角色"),
    prompt: String(node?.data?.prompt ?? ""),
    references: reference ? [reference] : [],
    primaryReferenceId: reference?.id ?? "",
    avatarReferenceId: reference?.id ?? "",
  };
}

function characterDraftPayload(draft, scope) {
  const references = draftReferences(draft);
  return {
    scope,
    name: String(draft.name ?? "").trim(),
    description: String(draft.usage ?? "").trim(),
    prompt: String(draft.prompt ?? "").trim(),
    references: references.map((item, index) => referencePayload(item, index, draft)),
  };
}

function draftReferences(draft) {
  return Array.isArray(draft.references) ? draft.references.slice(0, 12) : [];
}

function draftCrop(draft) {
  return normalizeCharacterAvatarCrop({
    x: number(draft.avatarCropX, 0) / 100,
    y: number(draft.avatarCropY, 0) / 100,
    width: number(draft.avatarCropWidth, 100) / 100,
    height: number(draft.avatarCropHeight, 100) / 100,
  });
}

async function syncCharacterReferences(workbench, canvasId, updated, previous, draft) {
  const characterIdValue = characterId(updated) || characterId(previous);
  let revision = Number(updated?.revision ?? previous?.revision);
  let latest = updated;
  const previousReferences = characterReferences(previous);
  const nextReferences = draftReferences(draft);
  const nextIds = new Set(nextReferences.map((reference) => String(reference.id)));
  for (const reference of previousReferences.filter((item) => !nextIds.has(String(item.id)))) {
    requireApi(workbench, "deleteCanvasCharacterReference");
    const payload = await workbench.api.deleteCanvasCharacterReference(canvasId, characterIdValue, String(reference.id), { expectedRevision: revision });
    revision = responseRevision(payload, revision + 1);
  }
  for (let index = 0; index < nextReferences.length; index += 1) {
    const reference = nextReferences[index];
    const input = referencePayload(reference, index, draft);
    const existing = previousReferences.find((item) => String(item.id) === String(reference.id));
    if (existing) {
      if (sameReferencePayload(existing, input)) continue;
      requireApi(workbench, "updateCanvasCharacterReference");
      const payload = await workbench.api.updateCanvasCharacterReference(canvasId, characterIdValue, String(existing.id), {
        expectedRevision: revision,
        patch: input,
      });
      latest = readCharacter(payload) ?? payload ?? latest;
      revision = responseRevision(latest, revision + 1);
      continue;
    }
    requireApi(workbench, "addCanvasCharacterReference");
    const payload = await workbench.api.addCanvasCharacterReference(canvasId, characterIdValue, {
      expectedRevision: revision,
      reference: input,
    });
    latest = readCharacter(payload) ?? payload ?? latest;
    revision = responseRevision(latest, revision + 1);
  }
  return latest;
}

function referencePayload(reference, position, draft) {
  const primary = String(reference.id) === String(draft.primaryReferenceId || draft.references[0]?.id || "");
  const avatar = String(reference.id) === String(draft.avatarReferenceId || draft.references[0]?.id || "");
  return removeUndefined({
    position,
    usage: String(reference.usage ?? "reference"),
    prompt: String(reference.prompt ?? ""),
    crop: avatar ? { ...draftCrop(draft), unit: "ratio" } : reference.crop ?? null,
    primary,
    avatar,
    storageObjectId: reference.storageObjectId ?? null,
    assetId: reference.assetId ?? null,
    assetVersionId: reference.assetVersionId ?? null,
    sourceNodeId: reference.sourceNodeId ?? null,
    sourceSnapshot: reference.sourceSnapshot ?? {},
  });
}

function referenceFromNode(node, position) {
  if (!isImageNode(node)) return null;
  const data = node.data && typeof node.data === "object" ? node.data : {};
  const artifact = data.artifact && typeof data.artifact === "object" ? data.artifact : {};
  const storage = data.storage && typeof data.storage === "object" ? data.storage : {};
  const previewUrl = nodeImageUrl(node);
  const storageObjectId = firstString(
    data.storageObjectId,
    artifact.storageObjectId,
    storage.storageObjectId,
    storageObjectIdFromPreviewUrl(previewUrl),
  );
  const assetId = firstString(data.assetId, artifact.assetId);
  const assetVersionId = firstString(data.assetVersionId, artifact.assetVersionId);
  if (!storageObjectId && !assetId && !assetVersionId) return null;
  return {
    id: `draft-${String(node.id)}-${position}`,
    position,
    usage: "reference",
    prompt: String(data.prompt ?? ""),
    crop: null,
    primary: position === 0,
    avatar: position === 0,
    storageObjectId: storageObjectId || null,
    assetId: assetId || null,
    assetVersionId: assetVersionId || null,
    sourceNodeId: String(node.id),
    sourceSnapshot: removeUndefined({
      nodeId: String(node.id),
      type: String(node.type),
      title: firstString(data.title, data.name),
      prompt: firstString(data.prompt),
      mediaKind: firstString(data.mediaKind),
    }),
    previewUrl,
  };
}

function referenceFromGenerationTask(node, payload, position) {
  const body = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const task = body?.task && typeof body.task === "object" ? body.task : body;
  const result = task?.result && typeof task.result === "object" ? task.result : {};
  const candidates = [
    result,
    ...(Array.isArray(task?.resultAssets) ? task.resultAssets : []),
    ...(Array.isArray(task?.fixedImages) ? task.fixedImages : []),
    ...(Array.isArray(task?.generatedOutputItems) ? task.generatedOutputItems : []),
  ].filter((item) => item && typeof item === "object");
  const media = candidates.find((item) => firstString(item.storageObjectId, item.assetId, item.assetVersionId));
  if (!media) return null;
  return referenceFromNode({
    ...node,
    data: {
      ...(node?.data ?? {}),
      storageObjectId: firstString(media.storageObjectId),
      assetId: firstString(media.assetId),
      assetVersionId: firstString(media.assetVersionId),
      previewUrl: firstString(
        nodeImageUrl(node),
        media.imageUrl,
        media.previewUrl,
        media.sourceUrl,
        media.downloadUrl,
        media.url,
      ),
    },
  }, position);
}

function sameReference(left, right) {
  return ["storageObjectId", "assetId", "assetVersionId"].some((key) => left?.[key] && left[key] === right?.[key]);
}

function sameReferencePayload(reference, payload) {
  return JSON.stringify(referenceComparable(reference)) === JSON.stringify(referenceComparable(payload));
}

function referenceComparable(reference) {
  return {
    position: Number(reference?.position ?? 0),
    usage: String(reference?.usage ?? "reference"),
    prompt: String(reference?.prompt ?? ""),
    crop: reference?.crop ?? null,
    primary: Boolean(reference?.primary),
    avatar: Boolean(reference?.avatar),
    storageObjectId: reference?.storageObjectId ?? null,
    assetId: reference?.assetId ?? null,
    assetVersionId: reference?.assetVersionId ?? null,
    sourceNodeId: reference?.sourceNodeId ?? null,
    sourceSnapshot: reference?.sourceSnapshot ?? {},
  };
}

function responseRevision(payload, fallback) {
  const value = Number(payload?.revision ?? payload?.data?.revision ?? payload?.character?.revision ?? payload?.data?.character?.revision);
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function firstString(...values) {
  return values.map((value) => typeof value === "string" ? value.trim() : "").find(Boolean) ?? "";
}

function filterCharacters(characters, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  return characters.filter((character) => !needle || [characterName(character), character.usage, character.purpose, character.prompt, character.description, character.libraryAsset?.folder, ...(character.libraryAsset?.tags ?? [])].some((value) => String(value ?? "").toLowerCase().includes(needle)));
}

function readCharacterList(payload) {
  const value = payload?.characters ?? payload?.data?.characters ?? payload?.items ?? payload?.data?.items;
  return Array.isArray(value) ? value : [];
}
function readLibraryCharacterList(payload, scope) {
  const assets = payload?.assets ?? payload?.body?.assets ?? payload?.data?.assets;
  return Array.isArray(assets)
    ? assets.map((asset) => libraryAssetToCharacter(asset, scope))
    : [];
}

function libraryCharacterFolder(character) {
  return String(character?.libraryAsset?.folder ?? character?.libraryAsset?.folderName ?? "未分类").trim() || "未分类";
}

function libraryCharacterFolders(characters = []) {
  return [...new Set(characters.map(libraryCharacterFolder))].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
function libraryAssetToCharacter(asset, scope) {
  const latestVersion = asset?.latestVersion && typeof asset.latestVersion === "object" ? asset.latestVersion : {};
  const previewUrl = String(asset?.previewUrl ?? latestVersion.previewUrl ?? latestVersion.metadata?.previewUrl ?? "").trim();
  return {
    id: `library-character:${scope}:${String(asset?.id ?? "")}`,
    name: String(asset?.name ?? "未命名角色"),
    description: String(asset?.description ?? ""),
    prompt: String(asset?.prompt ?? asset?.description ?? latestVersion.metadata?.prompt ?? ""),
    usage: scope === "team" ? "团队资产库" : "官方资产库",
    libraryScope: scope,
    libraryAsset: asset,
    primaryVisualUrl: previewUrl,
    avatarUrl: previewUrl,
  };
}
function readCharacter(payload) { return payload?.character ?? payload?.data?.character ?? (payload?.id ? payload : null); }
function findCharacter(state, id) { return state.characters.find((item) => characterId(item) === String(id ?? "")); }
function characterId(character) { return String(character?.id ?? character?.characterId ?? ""); }
function characterName(character) { return String(character?.name ?? character?.title ?? "未命名角色"); }
function characterReferences(character) { const value = character?.referenceImages ?? character?.references ?? character?.reference_images; return Array.isArray(value) ? value : []; }
function referenceUrl(reference) { return String(reference?.url ?? reference?.previewUrl ?? reference?.sourceUrl ?? reference?.sourceSnapshot?.previewUrl ?? ""); }
function characterPrimaryUrl(character) { const refs = characterReferences(character); return String(character?.primaryVisualUrl ?? character?.mainImageUrl ?? character?.previewUrl ?? referenceUrl(refs.find((item) => item?.primary)) ?? referenceUrl(refs[0])); }
function characterAvatarUrl(character) { const refs = characterReferences(character); return String(character?.avatarUrl ?? character?.avatar_url ?? referenceUrl(refs.find((item) => item?.avatar))); }
function characterSourceNodeId(character) { return String(characterReferences(character).find((reference) => reference?.sourceNodeId)?.sourceNodeId ?? ""); }
function findSelectedImageNode(ui = {}) { return ui.canvasDocument?.nodes?.find?.((node) => node.id === ui.selectedCanvasNodeId && isImageNode(node)) ?? null; }
function isImageNode(node) { return Boolean(node && IMAGE_NODE_TYPES.has(String(node.type))); }
function nodeImageUrl(node) { return String(node?.data?.url ?? node?.data?.previewUrl ?? node?.data?.sourceUrl ?? node?.data?.downloadUrl ?? ""); }
function storageObjectIdFromPreviewUrl(value) {
  const baseOrigin = globalThis.location?.origin ?? "http://canvas.local";
  try {
    const url = new URL(String(value ?? ""), baseOrigin);
    if (url.origin !== baseOrigin) return "";
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    for (let index = 0; index <= parts.length - 5; index += 1) {
      if (parts[index] !== "api" || parts[index + 1] !== "storage" || parts[index + 2] !== "objects" || parts[index + 4] !== "content") continue;
      const storageObjectId = parts[index + 3];
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageObjectId) ? storageObjectId : "";
    }
  } catch {
    return "";
  }
  return "";
}
function selectedCanvasId(workbench) { return String(workbench.ui?.selectedCanvasProjectId ?? ""); }
function requireCanvasId(workbench) { const id = selectedCanvasId(workbench); if (!id) throw new Error("请先打开画布"); return id; }
function requireApi(workbench, method) { if (typeof workbench.api?.[method] !== "function") throw new Error("角色库接口暂不可用"); }
function isLibraryCharacterScope(scope) { return LIBRARY_CHARACTER_SCOPES.has(String(scope ?? "")); }
function libraryCategoriesForScope(scope) { return scope === "team" ? TEAM_LIBRARY_CATEGORIES : LIBRARY_CATEGORIES; }
function normalizeCharacterScope(scope) {
  const normalized = String(scope ?? "");
  return normalized === "official" || normalized === "team" ? normalized : "canvas";
}
function isLockedLibraryScope(state) {
  return state.scope === "team" && state.libraryEntitlement?.hasTeamAssetLibrary === false;
}

function focusSourceNode(workbench, character) {
  const nodeId = characterSourceNodeId(character);
  if (!nodeId) return false;
  workbench.ui.selectedCanvasNodeId = nodeId;
  const cell = workbench.canvasGraph?.getCellById?.(nodeId);
  if (cell) workbench.canvasGraph?.centerCell?.(cell);
  return true;
}

function renderImage(url, alt) { return url ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy" />` : `<span class="canvas-character-image-placeholder" aria-label="暂无图片">暂无图片</span>`; }
function renderCroppedAvatar(url, crop) { const scale = Math.min(6, 1 / Math.max(crop.width, crop.height)); const x = Math.round((crop.x + crop.width / 2) * 100); const y = Math.round((crop.y + crop.height / 2) * 100); return url ? `<img src="${escapeAttr(url)}" alt="头像裁切预览" style="object-position:${x}% ${y}%;transform:scale(${scale.toFixed(3)})" />` : `<span class="canvas-character-image-placeholder">头像预览</span>`; }
function cropField(label, key, value, min = 0) { return `<label><span>${label}</span><input type="number" min="${min}" max="100" step="1" data-character-field="draft.${key}" value="${escapeAttr(value)}" /></label>`; }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeAttr(value) { return escapeHtml(resolveStaticAssetUrl(value)).replaceAll("`", "&#96;"); }
