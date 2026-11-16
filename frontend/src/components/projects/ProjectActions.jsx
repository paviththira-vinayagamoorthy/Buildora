import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  Archive,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  archiveProject,
  deleteProject,
} from "../../services/workspaceApi";

export default function ProjectActions({
  project,
  onChanged,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const busyRef = useRef(false);

  const titleId = useId();
  const descriptionId = useId();

  const isDelete = action === "delete";
  const isArchived = project.status === "archived";

  useEffect(() => {
    if (!menuOpen) return;

    function outside(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function escape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!action) return;

    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open) dialog.close();

      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [action]);

  function openDialog(nextAction) {
    setMenuOpen(false);
    setConfirmation("");
    setError("");
    setAction(nextAction);
  }

  function closeDialog() {
    if (busyRef.current) return;

    setAction(null);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();

    if (busyRef.current || !action) return;

    if (isDelete && confirmation !== project.name) {
      setError("Type the project name exactly.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      if (isDelete) {
        await deleteProject(project.id, confirmation);

        for (const storage of [
          localStorage,
          sessionStorage,
        ]) {
          if (
            storage.getItem("buildora_active_project") ===
            String(project.id)
          ) {
            storage.removeItem("buildora_active_project");
          }
        }
      } else {
        await archiveProject(project.id);
      }
    } catch (err) {
      setError(
        err?.message || "Unable to update the project."
      );

      busyRef.current = false;
      setBusy(false);
      return;
    }

    busyRef.current = false;
    setBusy(false);
    setAction(null);

    // Refresh after the confirmed server mutation.
    await onChanged();
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="pr-management"
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget
            )
          ) {
            setMenuOpen(false);
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="pr-more"
          aria-label={`Manage ${project.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreHorizontal size={20} />
        </button>

        {menuOpen && (
          <div className="pr-management-menu">
            {!isArchived && (
              <button
                type="button"
                onClick={() => openDialog("archive")}
              >
                <Archive size={16} />
                Archive project
              </button>
            )}

            <button
              type="button"
              className="pr-danger-text"
              onClick={() => openDialog("delete")}
            >
              <Trash2 size={16} />
              Delete project
            </button>
          </div>
        )}
      </div>

      {action && (
        <dialog
          ref={dialogRef}
          className="pr-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
        >
          <div className="pr-dialog-heading">
            <span className="pr-project-icon">
              {isDelete ? (
                <Trash2 size={23} />
              ) : (
                <Archive size={23} />
              )}
            </span>

            <button
              type="button"
              className="pr-more"
              aria-label="Close confirmation"
              disabled={busy}
              onClick={closeDialog}
            >
              <X size={19} />
            </button>
          </div>

          <h2 id={titleId}>
            {isDelete
              ? "Delete this project?"
              : "Archive this project?"}
          </h2>

          <p id={descriptionId}>
            {isDelete
              ? "Only an empty project can be permanently deleted. Projects with BOQs, members or invitation history must be archived instead."
              : "This marks the project as archived and keeps its members, BOQs and history. It does not lock BOQ editing."}
          </p>

          <div className="pr-dialog-project">
            {project.name}
          </div>

          <form onSubmit={submit}>
            {isDelete && (
              <label className="pr-confirm-label">
                Type the project name exactly to confirm
                <input
                  type="text"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setError("");
                  }}
                  autoComplete="off"
                  disabled={busy}
                  required
                />
              </label>
            )}

            {error && (
              <div className="pr-dialog-error" role="alert">
                {error}
              </div>
            )}

            <div className="pr-dialog-actions">
              <button
                type="button"
                className="pr-action"
                disabled={busy}
                onClick={closeDialog}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={`pr-action ${
                  isDelete
                    ? "pr-confirm-delete"
                    : "pr-confirm-archive"
                }`}
                disabled={
                  busy ||
                  (isDelete && confirmation !== project.name)
                }
              >
                {busy && (
                  <RefreshCw
                    size={16}
                    className="pr-spin"
                  />
                )}

                {busy
                  ? "Saving…"
                  : isDelete
                    ? "Delete project"
                    : "Archive project"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}