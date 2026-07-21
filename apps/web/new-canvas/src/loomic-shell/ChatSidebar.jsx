import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  History,
  MessageSquareMore,
  PanelRightClose,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { sanitizeCanvasAssistantSessions } from "./canvas-assistant.js";

const MIN_WIDTH = 300;
const MAX_WIDTH = 600;

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function freshSession() {
  return { id: makeId("session"), title: "新对话", createdAt: Date.now(), messages: [] };
}

function useLocalSessions(storageKey) {
  const [sessions, setSessions] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
      const sanitized = sanitizeCanvasAssistantSessions(parsed);
      if (sanitized.length) {
        return sanitized.map((session) => ({
          ...session,
          messages: session.messages.map((message) => message.status === "loading"
            ? { ...message, status: "error", text: "上次请求已中断，请重新发送。" }
            : message),
        }));
      }
    } catch {
      // Ignore malformed local drafts.
    }
    return [freshSession()];
  });
  const [activeId, setActiveId] = useState(() => sessions[0].id);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sanitizeCanvasAssistantSessions(sessions)));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory session remains usable.
    }
  }, [sessions, storageKey]);

  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const createSession = useCallback(() => {
    const session = freshSession();
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
  }, []);
  const deleteSession = useCallback((id) => {
    const remaining = sessions.filter((session) => session.id !== id);
    const next = remaining.length ? remaining : [freshSession()];
    setSessions(next);
    if (activeId === id) setActiveId(next[0].id);
  }, [activeId, sessions]);
  const appendMessage = useCallback((message) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== activeId) return session;
      const messages = [...session.messages, message];
      const firstText = message.text?.trim();
      return {
        ...session,
        title: session.messages.length === 0 && firstText ? firstText.slice(0, 28) : session.title,
        messages,
      };
    }));
  }, [activeId]);
  const updateMessage = useCallback((messageId, update) => {
    setSessions((current) => current.map((session) => session.id === activeId
      ? { ...session, messages: session.messages.map((message) => message.id === messageId ? { ...message, ...update } : message) }
      : session));
  }, [activeId]);

  return { sessions, activeId, activeSession, setActiveId, createSession, deleteSession, appendMessage, updateMessage };
}

function SessionSelector({ sessions, activeId, onSelect, onNew, onDelete }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(null);
  const rootRef = useRef(null);
  const active = sessions.find((session) => session.id === activeId);
  const filtered = sessions.filter((session) => session.title.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearch("");
        setConfirming(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div className="lm-session-selector" ref={rootRef}>
      <button className="lm-session-trigger" type="button" onClick={() => setOpen((value) => !value)}>
        <History size={14} /><span>{active?.title || "历史对话"}</span><ChevronDown size={12} className={open ? "is-open" : ""} />
      </button>
      <button className="lm-icon-button" type="button" title="新对话" aria-label="新对话" onClick={onNew}><Plus size={17} /></button>
      {open ? (
        <div className="lm-session-popover">
          <strong>历史对话</strong>
          <label className="lm-session-search">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索对话" />
          </label>
          <div className="lm-session-list">
            {filtered.length ? filtered.map((session) => (
              <div className={`lm-session-row${session.id === activeId ? " is-active" : ""}`} key={session.id}>
                <button type="button" className="lm-session-title" onClick={() => { onSelect(session.id); setOpen(false); }}>{session.title}</button>
                {confirming === session.id ? (
                  <button type="button" className="lm-session-delete-confirm" onClick={() => { onDelete(session.id); setConfirming(null); }}>确认</button>
                ) : (
                  <button type="button" className="lm-session-delete" aria-label={`删除 ${session.title}`} onClick={() => setConfirming(session.id)}><Trash2 size={13} /></button>
                )}
              </div>
            )) : <p className="lm-session-empty">无匹配结果</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Welcome({ onUsePrompt }) {
  const prompts = ["构思一张电影感分镜", "整理画布中的视觉方向", "为选中节点的提示词补充创作说明"];
  return (
    <div className="lm-chat-welcome">
      <span className="lm-chat-welcome-icon"><MessageSquareMore size={20} /></span>
      <h3>从一个想法开始</h3>
      <p>对话内容暂存于本机。选中元素的标题、文本与提示词会作为当前会话的创作上下文。</p>
      <div className="lm-prompt-list">
        {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onUsePrompt(prompt)}>{prompt}</button>)}
      </div>
    </div>
  );
}

export function ChatSidebar({
  open,
  onOpenChange,
  selectedElements = [],
  storageKey = "loomic-canvas-chat",
  onSend,
}) {
  const { sessions, activeId, activeSession, setActiveId, createSession, deleteSession, appendMessage, updateMessage } = useLocalSessions(storageKey);
  const [draft, setDraft] = useState("");
  const [width, setWidth] = useState(400);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const selectedSummary = useMemo(() => {
    const images = selectedElements.filter((element) => element.type === "image").length;
    return { total: selectedElements.length, images, shapes: selectedElements.length - images };
  }, [selectedElements]);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [activeSession?.messages]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && window.innerWidth <= 900) onOpenChange?.(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onOpenChange, open]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const message = {
      id: makeId("message"),
      role: "user",
      text,
      selectedElementIds: selectedElements.map((element) => element.id),
      createdAt: Date.now(),
    };
    const pendingMessage = {
      id: makeId("message"),
      role: "assistant",
      text: "",
      status: "loading",
      createdAt: Date.now(),
    };
    const recentMessages = [...(activeSession?.messages ?? []), message]
      .filter((item) => item.role === "user" || item.role === "assistant" && item.status !== "error")
      .slice(-12)
      .map((item) => ({ role: item.role, text: String(item.text ?? "") }));
    appendMessage(message);
    appendMessage(pendingMessage);
    setDraft("");
    setSending(true);
    try {
      if (typeof onSend !== "function") throw new Error("创作助手暂不可用。");
      const response = await onSend(message, {
        sessionId: activeId,
        messages: recentMessages,
        selectedElements,
      });
      const assistantText = String(response?.text ?? "").trim();
      if (!assistantText) throw new Error("创作助手未返回内容。");
      updateMessage(pendingMessage.id, { text: assistantText, status: "sent" });
    } catch (error) {
      updateMessage(pendingMessage.id, {
        text: error instanceof Error ? error.message : "创作助手请求失败，请稍后重试。",
        status: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const beginResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent) => setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + startX - moveEvent.clientX)));
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  };

  if (!open) {
    return (
      <button className="lm-chat-collapsed" type="button" onClick={() => onOpenChange?.(true)}>
        <MessageSquareMore size={16} /><span>对话</span>
      </button>
    );
  }

  const isolate = (event) => event.stopPropagation();
  return (
    <>
      <button className="lm-chat-backdrop" type="button" aria-label="关闭对话" onClick={() => onOpenChange?.(false)} />
      <aside
        className="lm-chat-sidebar"
        style={{ "--lm-chat-width": `${width}px` }}
        aria-label="创作助手对话"
        onKeyDown={isolate}
        onKeyUp={isolate}
        onCopy={isolate}
        onCut={isolate}
        onPaste={isolate}
        onWheel={isolate}
      >
        <div className="lm-chat-resizer" role="separator" aria-orientation="vertical" tabIndex={0} onPointerDown={beginResize} onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setWidth((value) => Math.min(MAX_WIDTH, value + 20));
          if (event.key === "ArrowRight") setWidth((value) => Math.max(MIN_WIDTH, value - 20));
        }} />
        <div className="lm-chat-panel">
          <header className="lm-chat-header">
            <div className="lm-chat-heading"><h2>创作助手</h2><span>在线模型</span></div>
            <SessionSelector sessions={sessions} activeId={activeId} onSelect={setActiveId} onNew={createSession} onDelete={deleteSession} />
            <button className="lm-icon-button lm-chat-close" type="button" title="收起对话" aria-label="收起对话" onClick={() => onOpenChange?.(false)}><PanelRightClose size={17} /></button>
          </header>

          <div className="lm-chat-messages" aria-live="polite">
            {activeSession?.messages.length ? activeSession.messages.map((message) => (
              <article className={`lm-chat-message is-${message.role}${message.status === "error" ? " is-error" : ""}`} key={message.id}>
                {message.status === "loading" ? <p className="lm-chat-loading">正在思考...</p> : message.text ? <p>{message.text}</p> : null}
                {message.selectedElementIds?.length ? <small>已关联 {message.selectedElementIds.length} 个画布元素</small> : null}
              </article>
            )) : <Welcome onUsePrompt={(prompt) => { setDraft(prompt); textareaRef.current?.focus(); }} />}
            <div ref={endRef} />
          </div>

          <div className="lm-chat-composer-wrap">
            {selectedSummary.total ? (
              <div className="lm-selection-context">
                <span>{selectedSummary.total} 个画布元素已选中</span>
                {selectedSummary.images ? <small>{selectedSummary.images} 图片</small> : null}
                {selectedSummary.shapes ? <small>{selectedSummary.shapes} 图形</small> : null}
              </div>
            ) : null}
            <div className="lm-chat-composer">
              <textarea
                ref={textareaRef}
                data-chat-input
                value={draft}
                rows={1}
                placeholder="输入你的想法..."
                aria-label="输入消息"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="lm-chat-actions">
                <span>会话保存在本机</span>
                <button type="button" className="lm-chat-send" aria-label="发送" disabled={sending || !draft.trim()} onClick={submit}><Send size={15} /></button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
