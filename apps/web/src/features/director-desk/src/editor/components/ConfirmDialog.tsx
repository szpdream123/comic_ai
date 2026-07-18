import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="director-confirm-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="director-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="director-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="director-confirm-header">
          <span className="director-confirm-icon"><AlertTriangle aria-hidden="true" size={18} /></span>
          <div>
            <h2 id="director-confirm-title">确认删除</h2>
            <p>{message}</p>
          </div>
          <button type="button" className="director-confirm-close" aria-label="关闭确认弹窗" onClick={onCancel}>
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <footer className="director-confirm-actions">
          <button type="button" className="director-confirm-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="director-confirm-submit" onClick={onConfirm}>确认删除</button>
        </footer>
      </section>
    </div>
  );
}
