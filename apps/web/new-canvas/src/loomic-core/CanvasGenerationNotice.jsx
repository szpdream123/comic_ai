import React from "react";
import { RefreshCw, X } from "lucide-react";

export function CanvasGenerationNotice({
  tone = "warning",
  message,
  primaryLabel,
  onPrimary,
  onClose,
  disabled = false,
}) {
  return (
    <section className={`loomic-generation-notice is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p>{message}</p>
      <div className="loomic-generation-notice-actions">
        {primaryLabel && onPrimary ? (
          <button type="button" className="loomic-generation-notice-primary" disabled={disabled} onClick={onPrimary}>
            <RefreshCw aria-hidden="true" />
            {primaryLabel}
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="loomic-generation-notice-close" disabled={disabled} onClick={onClose}>
            <X aria-hidden="true" />
            关闭提示
          </button>
        ) : null}
      </div>
    </section>
  );
}
