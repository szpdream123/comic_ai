import React, { useEffect, useRef, useState } from "react";

export function CanvasEmptyHint({ api, onOpenChat }) {
  const [hasElements, setHasElements] = useState(false);
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

  if (hasElements) return null;
  return (
    <div className="lm-empty-hint" aria-hidden="true">
      <span>输入你的想法开始创作</span>
      <span className="lm-empty-shortcut">C</span>
    </div>
  );
}

