import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, Route, Sparkles, X } from "lucide-react";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { ConfirmDialog } from "./editor/components/ConfirmDialog";
import {
  DIRECTOR_DESK_SESSION_OPENED_EVENT,
  clearDirectorDeskHostBridge,
  initDirectorDeskHostBridge,
} from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";
import {
  createDirectorDeskRecord,
  deleteDirectorDeskRecord,
  listDirectorDeskRecords,
  openDirectorDeskRecord,
  renameDirectorDeskRecord,
  upsertDirectorDeskRecord,
  type DirectorDeskRecord,
} from "./editor/workspaces/directorDeskRegistry";
import { migrateLegacyDirectorDesks } from "./editor/workspaces/legacyDirectorDeskMigration";

type ManualSection = {
  title: string;
  description?: string;
  rows: Array<[string, string]>;
};

const DIRECTOR_DESK_MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "普通导演视角",
    description: "摆场景和检查路线时使用",
    rows: [
      ["W / A / S / D", "前进、左移、后退、右移"],
      ["Space / Shift", "上升 / 下降"],
      ["鼠标左键拖动", "环绕观察场景"],
      ["鼠标右键拖动", "平移观察中心"],
      ["滚轮", "靠近 / 远离场景"],
    ],
  },
  {
    title: "掌镜模式",
    description: "像 FPS 游戏一样掌握摄影机轨迹",
    rows: [
      ["W / A / S / D", "前进、左移、后退、右移"],
      ["E / Q", "镜头上升 / 下降"],
      ["按住鼠标拖动", "上下左右转动镜头方向"],
      ["Enter", "保存或更新当前轨迹点"],
      ["Space", "播放 / 暂停人物和物体运动"],
      ["F", "锁定或取消锁定指向目标"],
      ["滚轮", "调整镜头 FOV"],
      ["Esc", "退出掌镜"],
    ],
  },
  {
    title: "通用编辑",
    description: "场景、路线和时间轴都适用",
    rows: [
      ["⌘ / Ctrl + C", "复制选中的人物或物体"],
      ["⌘ / Ctrl + V", "粘贴并选中新副本"],
      ["⌘ / Ctrl + Z", "撤销最近一次编辑或拖动"],
      ["Shift + 单击", "在场景树中多选 / 取消选择"],
      ["Delete / Backspace", "删除当前选中对象"],
      ["拖动 XYZ 字母", "连续调整对应轴数值"],
      ["↑ / ↓", "聚焦 XYZ 字段时微调数值"],
      ["拖动底部时间轴", "立即暂停并定位到指定时间"],
    ],
  },
];

const DIRECTOR_DESK_MANUAL_TRACKPAD_ROWS: Array<[string, string]> = [
  ["单指按下并拖动", "普通导演视角中环绕观察；掌镜时直接移动手指即可转向"],
  ["双指上下滑动", "普通视角缩放场景；掌镜模式调整镜头 FOV"],
      ["双指按压后拖动", "开启 macOS“辅助点按”后，可平移普通导演视角"],
      ["双指滚动首页", "上下浏览导演台列表"],
  ["单指按住并拖动", "掌镜模式直接控制镜头上下左右"],
];

const DIRECTOR_DESK_MANUAL_INTERFACE_ROWS: Array<[string, string]> = [
  ["顶部", "首页、切换导演台、导演 / 第一视角、运镜工作台、视角手感"],
  ["画面工具", "选择画幅、当前 / 四方向 / 十一方向截图、全屏"],
  ["运镜工作台", "手动掌镜、添加 / 插入 / 批量移动轨迹点、看路线、看成片、导出视频"],
  ["视口工具栏", "移动、旋转、缩放、添加角色、路线常亮、导入模型、模型库、添加机位"],
  ["底部时间轴", "回到开头、播放 / 暂停、拖动定位、总时长、记录点、删除当前点"],
  ["右侧属性", "对象 XYZ、姿势、动作、人物路线、场景地面与路径碰撞"],
];

export interface DirectorDeskAppProps {
  initialInstanceId?: string;
  onClose?: () => void;
  onRequireLogin?: () => void | Promise<void>;
  initialScreen?: DirectorDeskScreen;
  theme?: "dark" | "light";
  authenticated?: boolean;
}

type DirectorDeskScreen = "home" | "editor";

function getDirectorDeskErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "导演台请求失败";
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function App({
  initialInstanceId,
  onRequireLogin,
  initialScreen = "editor",
  theme = "dark",
  authenticated = true,
}: DirectorDeskAppProps = {}) {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
  const setMotionStudioOpen = useDirectorStore((state) => state.setMotionStudioOpen);
  const [manualOpen, setManualOpen] = useState(false);
  const [directorDeskView, setDirectorDeskView] = useState({
    records: [] as DirectorDeskRecord[],
    activeDeskId: "",
  });
  const [directorDeskLoading, setDirectorDeskLoading] = useState(true);
  const [directorDeskError, setDirectorDeskError] = useState<string | null>(null);
  const [screen, setScreen] = useState<DirectorDeskScreen>(() => initialInstanceId ? "editor" : initialScreen);
  const { records: directorDesks, activeDeskId } = directorDeskView;

  async function openDirectorDesk(
    id: string,
    options: { loadScene?: boolean } = {}
  ) {
    if (!id) return;
    if (!authenticated) {
      await onRequireLogin?.();
      return;
    }

    try {
      setDirectorDeskError(null);
      setDirectorDeskLoading(true);
      const record = await openDirectorDeskRecord(id);
      if (options.loadScene ?? true) {
        await useDirectorStore.getState().openScopedScene(record.id);
      }
      setDirectorDeskView((current) => ({
        records: upsertDirectorDeskRecord(current.records, record),
        activeDeskId: record.id,
      }));
      setScreen("editor");
      setManualOpen(false);
    } catch (error) {
      setDirectorDeskError(getDirectorDeskErrorMessage(error));
    } finally {
      setDirectorDeskLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    initDirectorDeskHostBridge(theme);

    if (!authenticated) {
      setDirectorDeskLoading(false);
      return () => {
        cancelled = true;
        clearDirectorDeskHostBridge();
      };
    }

    void (async () => {
      try {
        let records = await listDirectorDeskRecords();
        if (cancelled) return;

        if (await migrateLegacyDirectorDesks(records)) {
          if (cancelled) return;
          records = await listDirectorDeskRecords();
          if (cancelled) return;
        }

        if (records.length === 0) {
          const firstRecord = await createDirectorDeskRecord("导演台 1 号", "desk_1");
          if (cancelled) return;
          records = [firstRecord];
        }

        const requestedInstanceId = initialInstanceId?.trim();
        if (requestedInstanceId) {
          const openedRecord = await openDirectorDeskRecord(requestedInstanceId);
          if (cancelled) return;
          await useDirectorStore.getState().openScopedScene(openedRecord.id);
          if (cancelled) return;
          setDirectorDeskView({
            records: upsertDirectorDeskRecord(records, openedRecord),
            activeDeskId: openedRecord.id,
          });
        } else {
          setDirectorDeskView({ records, activeDeskId: records[0]?.id ?? "" });
        }
      } catch (error) {
        if (!cancelled) {
          setDirectorDeskError(getDirectorDeskErrorMessage(error));
          if (initialInstanceId?.trim()) setScreen("home");
        }
      } finally {
        if (!cancelled) setDirectorDeskLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearDirectorDeskHostBridge();
    };
  }, [authenticated]);

  useEffect(() => {
    if (!manualOpen) return;
    function handleManualKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setManualOpen(false);
    }
    window.addEventListener("keydown", handleManualKeyDown);
    return () => window.removeEventListener("keydown", handleManualKeyDown);
  }, [manualOpen]);

  useEffect(() => {
    function handleHostSessionOpened(event: Event) {
      const instanceId = (event as CustomEvent<{ instanceId?: string }>).detail?.instanceId;
      if (instanceId) {
        void openDirectorDesk(instanceId, { loadScene: true });
      }
    }

    window.addEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
    return () => window.removeEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
  }, [directorDesks]);

  async function handleCreateDesk() {
    if (!authenticated) {
      await onRequireLogin?.();
      return;
    }
    try {
      setDirectorDeskError(null);
      const record = await createDirectorDeskRecord();
      setDirectorDeskView((current) => ({
        ...current,
        records: upsertDirectorDeskRecord(current.records, record),
      }));
      await openDirectorDesk(record.id);
    } catch (error) {
      setDirectorDeskError(getDirectorDeskErrorMessage(error));
    }
  }

  function handleClose() {
    setManualOpen(false);
    setScreen("home");
  }

  async function handleDeleteDesk(id: string) {
    try {
      setDirectorDeskError(null);
      await deleteDirectorDeskRecord(id);
      setDirectorDeskView((current) => {
        const records = current.records.filter((record) => record.id !== id);
        return {
          records,
          activeDeskId: current.activeDeskId === id ? (records[0]?.id ?? "") : current.activeDeskId,
        };
      });
    } catch (error) {
      setDirectorDeskError(getDirectorDeskErrorMessage(error));
    }
  }

  async function handleRenameDesk(id: string, name: string) {
    try {
      setDirectorDeskError(null);
      const record = await renameDirectorDeskRecord(id, name);
      setDirectorDeskView((current) => ({
        ...current,
        records: upsertDirectorDeskRecord(current.records, record),
      }));
    } catch (error) {
      setDirectorDeskError(getDirectorDeskErrorMessage(error));
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.repeat) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (screen === "editor" && directorDeskLoading) {
    return (
      <main className="director-home-shell">
        <p role="status">正在打开导演台...</p>
      </main>
    );
  }

  if (screen === "home") {
    return (
      <DirectorDeskHome
        directorDesks={directorDesks}
        activeDeskId={activeDeskId}
        loading={directorDeskLoading}
        errorMessage={directorDeskError}
        onOpenDesk={openDirectorDesk}
        onCreateDesk={handleCreateDesk}
        onRenameDesk={handleRenameDesk}
        onDeleteDesk={handleDeleteDesk}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <button className="top-bar-title top-bar-home-button" type="button" onClick={handleClose}>
            3D导演台
          </button>
          <div className="director-desk-switcher" aria-label="导演台操作">
            <button
              className="director-desk-manual-button"
              type="button"
              aria-label="操作手册"
              aria-expanded={manualOpen}
              onClick={() => setManualOpen(true)}
            >
              <BookOpen aria-hidden="true" size={14} strokeWidth={1.9} />
              操作手册
            </button>
          </div>
        </div>
        <div className="top-bar-center">
          <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
              aria-pressed={viewMode === "director"}
              type="button"
              onClick={() => setViewMode("director")}
            >
              导演视角
            </button>
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
              aria-label="第一视角"
              aria-pressed={viewMode === "camera"}
              title="查看摄影机最终画面"
              type="button"
              onClick={() => setViewMode("camera")}
            >
              第一视角
            </button>
          </div>
          <button
            className={`top-bar-motion-button${motionStudioOpen ? " is-active" : ""}`}
            type="button"
            aria-label={motionStudioOpen ? "关闭运镜工作台" : "打开运镜工作台"}
            aria-pressed={motionStudioOpen}
            onClick={() => {
              setViewMode("director");
              setMotionStudioOpen(!motionStudioOpen);
            }}
          >
            <Route aria-hidden="true" size={15} />
            运镜
          </button>
        </div>
        <div className="top-bar-actions">
          <span className="director-export-host" data-director-export-host />
          <button
            className="top-bar-action-button"
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={handleClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <DirectorDeskShell>
        <DirectorCanvas />
      </DirectorDeskShell>
      {manualOpen ? (
        <DirectorDeskManual onClose={() => setManualOpen(false)} />
      ) : null}
    </div>
  );
}

function DirectorDeskManual({ onClose }: { onClose: () => void }) {
  return (
    <div className="director-manual-backdrop" role="presentation" onClick={onClose}>
      <section
        className="director-manual-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="director-manual-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="director-manual-dialog-header">
          <div>
            <span className="director-manual-kicker"><BookOpen size={16} /> 操作手册</span>
            <h2 id="director-manual-title">键盘、鼠标与触控板操作</h2>
            <p>快捷键在输入框中不会触发；掌镜模式下按住 3D 画面并拖动即可转向。</p>
          </div>
          <button className="director-manual-close" type="button" aria-label="关闭操作手册" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="director-manual-section-grid">
          {DIRECTOR_DESK_MANUAL_SECTIONS.map((section) => (
            <article className="director-manual-section" key={section.title}>
              <h3>{section.title}</h3>
              {section.description ? <p className="director-manual-section-description">{section.description}</p> : null}
              <div className="director-manual-rows">
                {section.rows.map(([key, description]) => (
                  <div className="director-manual-row" key={`${section.title}-${key}`}>
                    <kbd>{key}</kbd>
                    <span>{description}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <article className="director-manual-section director-manual-trackpad-section">
          <h3>macOS 触控板手势</h3>
          <p className="director-manual-section-description">以 MacBook 默认手势和已开启“辅助点按”为准</p>
          <div className="director-manual-two-column-rows">
            {DIRECTOR_DESK_MANUAL_TRACKPAD_ROWS.map(([key, description]) => (
              <div className="director-manual-row" key={key}><kbd>{key}</kbd><span>{description}</span></div>
            ))}
          </div>
        </article>

        <article className="director-manual-section director-manual-interface-section">
          <h3>主要界面按钮</h3>
          <div className="director-manual-two-column-rows">
            {DIRECTOR_DESK_MANUAL_INTERFACE_ROWS.map(([key, description]) => (
              <div className="director-manual-row" key={key}><kbd>{key}</kbd><span>{description}</span></div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

interface DirectorDeskHomeProps {
  directorDesks: DirectorDeskRecord[];
  activeDeskId: string;
  loading: boolean;
  errorMessage: string | null;
  onOpenDesk: (id: string) => Promise<void>;
  onCreateDesk: () => Promise<void>;
  onRenameDesk: (id: string, name: string) => Promise<void>;
  onDeleteDesk: (id: string) => Promise<void>;
}

const DIRECTOR_DESK_PAGE_SIZE = 10;

function formatDeskUpdatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "刚刚更新";
  const elapsedHours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (elapsedHours < 1) return "刚刚更新";
  return `${elapsedHours} 小时前`;
}

function formatDeskUpdatedAtShanghai(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function DirectorDeskHome({
  directorDesks,
  activeDeskId,
  loading,
  onOpenDesk,
  onCreateDesk,
  onRenameDesk,
  onDeleteDesk,
}: DirectorDeskHomeProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const totalPages = Math.max(1, Math.ceil(directorDesks.length / DIRECTOR_DESK_PAGE_SIZE));
  const pageStart = (currentPage - 1) * DIRECTOR_DESK_PAGE_SIZE;
  const visibleDesks = directorDesks.slice(pageStart, pageStart + DIRECTOR_DESK_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  function beginRename(id: string, name: string) {
    setOpenMenuId(null);
    setRenameTarget({ id, name });
    setRenameValue(name);
  }

  function submitRename() {
    const name = renameValue.trim();
    if (!renameTarget || !name) return;
    onRenameDesk(renameTarget.id, name);
    setRenameTarget(null);
  }

  return (
    <>
      <main className="director-home-shell">
      <header className="director-home-header">
        <div className="director-home-page-heading">
          <h1>导演台</h1>
          <div className="director-home-page-tags" aria-label="导演台能力">
            <b>场景摆位</b>
            <b>人物动作</b>
            <b>镜头预演</b>
          </div>
        </div>
      </header>

      <section className="director-home-top-panel" aria-label="导演台操作">
        <div className="director-home-summary">
          <strong>我的导演台</strong>
          <span>共 {directorDesks.length} 个</span>
        </div>
      </section>

      {loading ? (
        <div className="director-home-status-toast" role="status">
          <LoaderCircle aria-hidden="true" size={16} />
          <span>正在加载导演台...</span>
        </div>
      ) : null}

      <section className="director-home-desks" aria-label="导演台列表">
        {visibleDesks.map((desk) => (
          <article
            className={`director-desk-card${desk.id === activeDeskId ? " is-active" : ""}`}
            key={desk.id}
          >
            <button className="director-desk-card-open" type="button" aria-label={`打开${desk.name}`} onClick={() => void onOpenDesk(desk.id)}>
              <span className="director-desk-card-icon" aria-hidden="true"><Sparkles size={20} /></span>
              <span className="director-desk-card-copy">
                <strong>{desk.name}</strong>
                <small><Clock3 size={14} /> {formatDeskUpdatedAt(desk.updatedAt)}</small>
              </span>
              <span className="director-desk-card-updated-at">
                <span>更新时间</span>
                <time dateTime={desk.updatedAt}>{formatDeskUpdatedAtShanghai(desk.updatedAt)}</time>
              </span>
            </button>
            <button
              className="director-desk-card-edit"
              type="button"
              aria-label={`编辑${desk.name}`}
              aria-expanded={openMenuId === desk.id}
              onClick={() => setOpenMenuId((id) => id === desk.id ? null : desk.id)}
            >
              编辑
            </button>
            {openMenuId === desk.id ? (
              <div className="director-desk-card-menu" role="menu" aria-label={`${desk.name}操作`}>
                <button type="button" role="menuitem" onClick={() => beginRename(desk.id, desk.name)}>重命名</button>
                <button
                  className="is-danger"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenuId(null);
                    setDeleteTarget({ id: desk.id, name: desk.name });
                  }}
                >
                  删除
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <footer className="director-home-footer">
        <nav className="director-home-pagination" aria-label="导演台分页">
          <span>共 {directorDesks.length} 条　{DIRECTOR_DESK_PAGE_SIZE} 条/页</span>
          <button
            type="button"
            aria-label="上一页"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              className={page === currentPage ? "is-active" : ""}
              type="button"
              aria-label={`第 ${page} 页`}
              aria-current={page === currentPage ? "page" : undefined}
              key={page}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            aria-label="下一页"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </nav>
        <button className="director-home-create-button" type="button" onClick={() => void onCreateDesk()} disabled={loading}>
          <Plus aria-hidden="true" size={16} strokeWidth={2} />
          新建导演台
        </button>
      </footer>
      </main>

      {renameTarget ? (
        <div
          className="director-rename-backdrop"
          role="presentation"
          onClick={() => setRenameTarget(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setRenameTarget(null);
          }}
        >
          <form
            className="director-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="director-rename-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitRename();
            }}
          >
            <h2 id="director-rename-title">重命名导演台</h2>
            <label>
              <span>导演台名称</span>
              <input
                autoFocus
                maxLength={50}
                value={renameValue}
                onChange={(event) => setRenameValue(event.currentTarget.value)}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setRenameTarget(null)}>取消</button>
              <button className="is-primary" type="submit" disabled={!renameValue.trim()}>保存</button>
            </footer>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          message={`删除“${deleteTarget.name}”后无法恢复，是否继续？`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            void onDeleteDesk(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
