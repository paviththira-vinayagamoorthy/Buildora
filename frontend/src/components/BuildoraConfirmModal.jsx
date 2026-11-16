
import { AlertTriangle, X } from "lucide-react";
import "./BuildoraConfirmModal.css";

export default function BuildoraConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="buildora-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="buildora-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="buildora-modal-title"
        aria-describedby="buildora-modal-description"
      >
        <button
          type="button"
          className="buildora-modal-close"
          onClick={onCancel}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <div
          className={`buildora-modal-icon ${
            variant === "danger" ? "is-danger" : ""
          }`}
        >
          <AlertTriangle size={23} strokeWidth={1.8} />
        </div>

        <h2 id="buildora-modal-title">{title}</h2>

        <p id="buildora-modal-description">{message}</p>

        <div className="buildora-modal-actions">
          <button
            type="button"
            className="buildora-modal-cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={`buildora-modal-confirm ${
              variant === "danger" ? "is-danger" : ""
            }`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
