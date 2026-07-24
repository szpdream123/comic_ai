import React, { useCallback, useEffect, useRef, useState } from "react";

export function EditableProjectName({ name = "未命名项目", onChange }) {
  const [draft, setDraft] = useState(name);
  const committedRef = useRef(name);

  useEffect(() => {
    setDraft(name);
    committedRef.current = name;
  }, [name]);

  const commit = useCallback(() => {
    const nextName = draft.trim() || "未命名项目";
    setDraft(nextName);
    if (nextName !== committedRef.current) {
      committedRef.current = nextName;
      onChange?.(nextName);
    }
  }, [draft, onChange]);

  useEffect(() => {
    if (typeof onChange !== "function") return undefined;
    const commitRequestedName = () => commit();
    window.addEventListener("loomic-canvas:project-name-commit", commitRequestedName);
    return () => window.removeEventListener("loomic-canvas:project-name-commit", commitRequestedName);
  }, [commit, onChange]);

  if (typeof onChange !== "function") {
    return <span className="lm-project-name is-readonly" title={draft} aria-label="项目名称">{draft}</span>;
  }

  return (
    <input
      className="lm-project-name-input"
      value={draft}
      maxLength={50}
      aria-label="项目名称"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          setDraft(committedRef.current);
        }
      }}
    />
  );
}

