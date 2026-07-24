import React, { useEffect, useRef, useState } from "react";
import { AudioLines, Image, LoaderCircle, PanelsTopLeft, UserRound } from "lucide-react";

import { CANVAS_EMPTY_QUICKSTARTS, insertCanvasEmptyQuickstart } from "./canvas-empty-quickstarts.js";

const QUICKSTART_ICONS = {
  "story-script": PanelsTopLeft,
  "character-three-view": UserRound,
  "first-frame-video": Image,
  "audio-video": AudioLines,
};

export function CanvasEmptyHint({ api, onOpenChat }) {
  const [hasElements, setHasElements] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const onOpenChatRef = useRef(onOpenChat);
  onOpenChatRef.current = onOpenChat;

  useEffect(() => {
    const check = () => {
      const elements = api?.getSceneElements?.() ?? [];
      setHasElements(elements.some((element) => !element.isDeleted));
    };
    check();
    if (api?.onChange) {
      const unsubscribe = api.onChange(check);
      return () => unsubscribe?.();
    }
    const interval = window.setInterval(check, 500);
    return () => window.clearInterval(interval);
  }, [api]);

  useEffect(() => {
    if (hasElements) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key.toLowerCase() !== "c") return;
      event.preventDefault();
      onOpenChatRef.current?.();
      requestAnimationFrame(() => document.querySelector("textarea[data-chat-input]")?.focus());
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasElements]);

  const insertQuickstart = (quickstartId) => {
    if (busyId) return;
    setBusyId(quickstartId);
    setError("");
    try {
      const result = insertCanvasEmptyQuickstart(api, quickstartId);
      if (!result.ok) setError("无法添加工作流，请稍后重试");
    } catch {
      setError("无法添加工作流，请稍后重试");
    } finally {
      setBusyId("");
    }
  };

  if (hasElements) return null;
  return (
    <section className="lm-empty-hint" aria-label="快速开始">
      <div className="lm-empty-copy">
        <strong>双击画布</strong>
        <span>自由生成节点</span>
      </div>
      <div className="lm-empty-quickstarts">
        {CANVAS_EMPTY_QUICKSTARTS.map((quickstart) => {
          const Icon = QUICKSTART_ICONS[quickstart.id];
          const busy = busyId === quickstart.id;
          return (
            <button
              key={quickstart.id}
              className="lm-empty-quickstart"
              type="button"
              disabled={Boolean(busyId)}
              aria-busy={busy}
              onClick={() => insertQuickstart(quickstart.id)}
            >
              <Icon aria-hidden="true" />
              <span>{quickstart.label}</span>
              <small>{busy ? "添加中" : "去生成"}</small>
              {busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <button className="lm-empty-chat" type="button" onClick={() => onOpenChatRef.current?.()}>
        输入你的想法开始创作
        <span className="lm-empty-shortcut">C</span>
      </button>
      {error ? <p className="lm-empty-error" role="alert">{error}</p> : null}
    </section>
  );
}

