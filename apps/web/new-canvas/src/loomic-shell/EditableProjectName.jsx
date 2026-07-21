import React, { useCallback, useEffect, useRef, useState } from "react";

export function EditableProjectName({ name = "未命名项目", onChange }) {
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const committedRef = useRef(name);

  useEffect(() => {
    setDraft(name);
    committedRef.current = name;
  }, [name]);

  const commit = useCallback(() => {
    const nextName = draft.trim() || "未命名项目";
    setDraft(nextName);
    setEditing(false);
    if (nextName !== committedRef.current) {
      committedRef.current = nextName;
      onChange?.(nextName);
    }
  }, [draft, onChange]);

  const beginEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="lm-project-name-input"
        value={draft}
        maxLength={100}
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
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button className="lm-project-name" type="button" title={draft} onClick={beginEditing}>
      {draft}
    </button>
  );
}

