import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  X,
} from "lucide-react";

import {
  createProjectSiteUpdate,
  getMyProjects,
  getProjectSiteUpdates,
  getSiteUpdateAccess,
  publishProjectSiteUpdate,
  updateProjectSiteUpdate,
} from "../services/workspaceApi";

import "../styles/SiteUpdatesPage.css";

function today() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function emptyForm() {
  return {
    update_date: today(),
    title: "",
    work_completed: "",
    progress_percentage: "",
    issues: "",
    next_steps: "",
  };
}

function dateLabel(value) {
  if (!value) return "—";

  const parsed = new Date(
    `${String(value).slice(0, 10)}T00:00:00`
  );

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}

function sortUpdates(records) {
  return [...records].sort(
    (a, b) =>
      String(b.update_date || "").localeCompare(
        String(a.update_date || "")
      ) || Number(b.id) - Number(a.id)
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={`ct-badge ${
        status === "published" ? "ct-published" : "ct-draft"
      }`}
    >
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

export default function SiteUpdatesPage({
  workspaceProject = null,
}) {
  const embedded = workspaceProject !== null;

  const mountedRef = useRef(false);
  const actionRef = useRef(false);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [chosenProjectId, setChosenProjectId] = useState("");

  const projectId = embedded
    ? String(workspaceProject.id)
    : chosenProjectId;

  const [access, setAccess] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const canManage = access?.can_manage === true;

  const project = embedded
    ? workspaceProject
    : projects.find((item) => String(item.id) === projectId);

  const latestPublished = updates.find(
    (item) => item.status === "published"
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setProjectsLoading(true);
    setProjectsError("");

    async function loadProjects() {
      try {
        const data = workspaceProject
          ? [workspaceProject]
          : await getMyProjects();

        if (cancelled) return;

        if (!Array.isArray(data)) {
          throw new Error("Unexpected project response.");
        }

        setProjects(data);
      } catch (err) {
        if (!cancelled) {
          setProjectsError(messageFrom(err));
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [projectsRetry, workspaceProject]);

  useEffect(() => {
    let cancelled = false;

    setAccess(null);
    setUpdates([]);
    setSelected(null);
    setShowForm(false);
    setForm(emptyForm());
    setLoadError("");
    setError("");
    setSuccess("");

    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    async function loadWorkspace() {
      try {
        const [permissions, records] = await Promise.all([
          getSiteUpdateAccess(projectId),
          getProjectSiteUpdates(projectId),
        ]);

        if (cancelled) return;

        if (!Array.isArray(records)) {
          throw new Error("Unexpected site update response.");
        }

        setAccess(permissions);
        setUpdates(sortUpdates(records));
      } catch (err) {
        if (!cancelled) {
          setLoadError(messageFrom(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [projectId, retry]);

  useEffect(() => {
    if (!showForm) return;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [showForm]);

  function changeProject(event) {
    if (embedded || actionRef.current) return;

    if (
      showForm &&
      !window.confirm("Discard this unsaved site update form?")
    ) {
      return;
    }

    setChosenProjectId(event.target.value);
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function startCreate() {
    if (
      !canManage ||
      actionRef.current ||
      loading ||
      !projectId
    ) {
      return;
    }

    setSelected(null);
    setForm(emptyForm());
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function openRecord(record) {
    if (actionRef.current) return;

    setSelected(record);
    setShowForm(false);
    setError("");
    setSuccess("");
  }

  function startEdit() {
    if (
      !canManage ||
      selected?.status !== "draft" ||
      actionRef.current
    ) {
      return;
    }

    setForm({
      update_date: selected.update_date,
      title: selected.title || "",
      work_completed: selected.work_completed || "",
      progress_percentage: String(
        selected.progress_percentage ?? ""
      ),
      issues: selected.issues || "",
      next_steps: selected.next_steps || "",
    });

    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function cancelForm() {
  if (actionRef.current) return;
  setShowDiscardConfirm(true);
}

function confirmDiscard() {
  if (actionRef.current) return;

  setShowDiscardConfirm(false);
  setShowForm(false);
  setError("");
}

  function storeRecord(record) {
    setUpdates((previous) =>
      sortUpdates([
        record,
        ...previous.filter(
          (item) => String(item.id) !== String(record.id)
        ),
      ])
    );

    setSelected(record);
    setShowForm(false);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (
      actionRef.current ||
      !canManage ||
      !projectId ||
      (selected && selected.status !== "draft")
    ) {
      return;
    }

    const percentageText = form.progress_percentage.trim();
    const percentage = Number(percentageText);
    const title = form.title.trim();
    const workCompleted = form.work_completed.trim();

    if (
      !form.update_date ||
      !title ||
      title.length > 255 ||
      !workCompleted ||
      workCompleted.length > 5000 ||
      form.issues.length > 3000 ||
      form.next_steps.length > 3000 ||
      !/^\d+(?:\.\d{1,2})?$/.test(percentageText) ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      setError(
        "Enter a valid date, title, completed work and progress from 0 to 100 with up to two decimal places. Keep text within the field limits."
      );
      return;
    }

    const payload = {
      update_date: form.update_date,
      title,
      work_completed: workCompleted,
      progress_percentage: percentageText,
      issues: form.issues.trim() || null,
      next_steps: form.next_steps.trim() || null,
    };

    actionRef.current = true;
    setBusy("save");
    setError("");
    setSuccess("");

    try {
      const record = selected
        ? await updateProjectSiteUpdate(selected.id, payload)
        : await createProjectSiteUpdate(projectId, payload);

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Site update draft saved successfully.");
    } catch (err) {
      if (mountedRef.current) {
        setError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) {
        setBusy("");
      }
    }
  }

  async function handlePublish() {
    if (
      actionRef.current ||
      !canManage ||
      selected?.status !== "draft"
    ) {
      return;
    }

    if (
      !window.confirm(
        "Publish this update? It will become read-only and visible to the Building Owner."
      )
    ) {
      return;
    }

    actionRef.current = true;
    setBusy("publish");
    setError("");
    setSuccess("");

    try {
      const record = await publishProjectSiteUpdate(
        selected.id
      );

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Site update published successfully.");
    } catch (err) {
      if (mountedRef.current) {
        setError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) {
        setBusy("");
      }
    }
  }

  return (
    <div
      className={`ct-page su-page ${
        embedded ? "su-embedded" : ""
      }`}
    >
      <div className="ct-container">
        {!embedded && (
  <header className="ct-heading">
    <h1>Site updates</h1>
    <p>
      Follow completed work, reported progress and next steps.
    </p>
  </header>
)}

        {projectsLoading ? (
          <div className="ct-state" role="status">
            Loading your projects…
          </div>
        ) : projectsError ? (
          <div className="ct-state" role="alert">
            <p>{projectsError}</p>

            <button
              type="button"
              className="ct-button"
              onClick={() =>
                setProjectsRetry((value) => value + 1)
              }
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="ct-state">
            <h2>No projects available</h2>
            <p>
              Create a project or accept a project invitation.
            </p>
          </div>
        ) : (
          <>
            <div className="ct-toolbar">
              {!embedded && (
                <div className="ct-project-control">
                  <label htmlFor="su-project">Project</label>

                  <select
                    id="su-project"
                    value={projectId}
                    onChange={changeProject}
                    disabled={Boolean(busy)}
                  >
                    <option value="" disabled hidden>
                      Choose a project
                    </option>

                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || "Untitled project"}
                      </option>
                    ))}
                  </select>

                  {access && !loading && !loadError && (
                    <span className="ct-access">
                      {canManage
                        ? "QS access"
                        : access.role === "organization_admin"
                          ? "Admin · View only"
                          : "Owner · View only"}
                    </span>
                  )}
                </div>
              )}

              {projectId &&
                !loading &&
                !loadError &&
                canManage &&
                !showForm &&
                !selected && (
                  <button
                    type="button"
                    className="ct-button ct-primary su-new-update-btn"
                    onClick={startCreate}
                    disabled={Boolean(busy)}
                  >
                    <Plus size={17} aria-hidden="true" />
                    New update
                  </button>
                )}
            </div>

            {error && (
              <div
                className="ct-message ct-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                className="ct-message ct-success"
                role="status"
              >
                <CheckCircle2
                  size={18}
                  aria-hidden="true"
                />
                {success}
              </div>
            )}

            {!projectId ? (
              <div className="ct-state">
                <ClipboardCheck
                  size={32}
                  aria-hidden="true"
                />
                <h2>Choose a project</h2>
                <p>
                  Review its site updates and reported progress.
                </p>
              </div>
            ) : loading ? (
              <div className="ct-state" role="status">
                Loading site updates…
              </div>
            ) : loadError ? (
              <div className="ct-state" role="alert">
                <p>{loadError}</p>

                <button
                  type="button"
                  className="ct-button"
                  onClick={() =>
                    setRetry((value) => value + 1)
                  }
                >
                  Try again
                </button>
              </div>
            ) : showForm ? (
<div className="su-modal-overlay">
  <section
    className="ct-panel su-form-panel su-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="su-modal-title"
  >
                <div className="ct-section-heading">
  <div>
                    <span className="ct-eyebrow">
                      SITE UPDATE DRAFT
                    </span>

                    <h2 id="su-modal-title">
  {selected ? "Edit site update" : "New site update"}
</h2>

<p>{project?.name}</p>
</div>

<button
  type="button"
  className="su-modal-close"
  onClick={cancelForm}
  disabled={Boolean(busy)}
  aria-label="Close site update form"
>
  <X size={19} />
</button>

</div>

<form onSubmit={handleSave}>
                  <label className="ct-field">
                    Title
                    <input
                      type="text"
                      name="title"
                      value={form.title}
                      onChange={updateField}
                      maxLength={255}
                      disabled={Boolean(busy)}
                      required
                    />
                  </label>

                  <div className="ct-form-grid">
                    <label className="ct-field">
                      Update date
                      <input
                        type="date"
                        name="update_date"
                        value={form.update_date}
                        onChange={updateField}
                        disabled={Boolean(busy)}
                        required
                      />
                    </label>

                    <label className="ct-field">
                      Overall project progress (%)
                      <input
                        type="number"
                        name="progress_percentage"
                        value={form.progress_percentage}
                        onChange={updateField}
                        min="0"
                        max="100"
                        step="0.01"
                        disabled={Boolean(busy)}
                        required
                      />
                    </label>
                  </div>

                  <label className="ct-field">
                    Work completed
                    <textarea
                      name="work_completed"
                      value={form.work_completed}
                      onChange={updateField}
                      maxLength={5000}
                      disabled={Boolean(busy)}
                      required
                    />
                  </label>

                  <label className="ct-field">
                    Issues / delays (optional)
                    <textarea
                      name="issues"
                      value={form.issues}
                      onChange={updateField}
                      maxLength={3000}
                      disabled={Boolean(busy)}
                    />
                  </label>

                  <label className="ct-field">
                    Next steps (optional)
                    <textarea
                      name="next_steps"
                      value={form.next_steps}
                      onChange={updateField}
                      maxLength={3000}
                      disabled={Boolean(busy)}
                    />
                  </label>

                  <p className="ct-footnote">
                    Enter overall project completion based on
                    your site assessment. This percentage is
                    separate from payments.
                  </p>

                  <div className="ct-actions">
                    <button
                      type="button"
                      className="ct-button"
                      onClick={cancelForm}
                      disabled={Boolean(busy)}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="ct-button ct-primary"
                      disabled={Boolean(busy)}
                    >
                      {busy === "save"
                        ? "Saving…"
                        : "Save draft"}
                    </button>
                  </div>
</form>
</section>
{showDiscardConfirm && (
  <div className="su-discard-overlay">
    <div
      className="su-discard-card"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="su-discard-title"
      aria-describedby="su-discard-description"
    >
      <h3 id="su-discard-title">Discard changes?</h3>

      <p id="su-discard-description">
        Discard this unsaved site update form?
        Any unsaved changes will be lost.
      </p>

      <div className="su-discard-actions">
        <button
          type="button"
          className="su-discard-keep"
          onClick={() => setShowDiscardConfirm(false)}
        >
          Keep editing
        </button>

        <button
          type="button"
          className="su-discard-confirm"
          onClick={confirmDiscard}
        >
          Discard changes
        </button>
      </div>
    </div>
  </div>
)}
</div>
) : selected ? (
              <section className="ct-panel">
                <button
                  type="button"
                  className="ct-back"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (actionRef.current) return;
                    setSelected(null);
                    setError("");
                    setSuccess("");
                  }}
                >
                  <ArrowLeft
                    size={16}
                    aria-hidden="true"
                  />
                  All site updates
                </button>

                <div className="ct-section-heading">
                  <div>
                    <span className="ct-eyebrow">
                      {dateLabel(selected.update_date)}
                    </span>

                    <h2>{selected.title}</h2>
                    <p>{project?.name}</p>
                  </div>

                  <StatusBadge status={selected.status} />
                </div>

                <div className="su-progress">
                  <div className="su-progress-heading">
                    <span>Reported overall progress</span>

                    <strong>
                      {Number(selected.progress_percentage)}%
                    </strong>
                  </div>

                  <progress
                    max="100"
                    value={Number(
                      selected.progress_percentage
                    )}
                    aria-label="Reported overall project progress"
                  />
                </div>

                <div className="su-content">
                  <section>
                    <h3>Work completed</h3>
                    <p>{selected.work_completed}</p>
                  </section>

                  {selected.issues && (
                    <section>
                      <h3>Issues / delays</h3>
                      <p>{selected.issues}</p>
                    </section>
                  )}

                  {selected.next_steps && (
                    <section>
                      <h3>Next steps</h3>
                      <p>{selected.next_steps}</p>
                    </section>
                  )}
                </div>

                {canManage &&
                  selected.status === "draft" && (
                    <div className="ct-actions">
                      <button
                        type="button"
                        className="ct-button"
                        onClick={startEdit}
                        disabled={Boolean(busy)}
                      >
                        Edit draft
                      </button>

                      <button
                        type="button"
                        className="ct-button ct-primary"
                        onClick={handlePublish}
                        disabled={Boolean(busy)}
                      >
                        <CheckCircle2
                          size={17}
                          aria-hidden="true"
                        />

                        {busy === "publish"
                          ? "Publishing…"
                          : "Publish update"}
                      </button>
                    </div>
                  )}
              </section>
            ) : (
              <>
                {latestPublished && (
<div className="su-latest su-latest-with-bar">
  <div className="su-latest-info">
    <span>Latest published progress</span>

    <strong>
      {Number(latestPublished.progress_percentage)}%
    </strong>
  </div>

  <p>
    As of {dateLabel(latestPublished.update_date)}
    {" · Reported by the QS"}
  </p>

  <progress
    max="100"
    value={Number(latestPublished.progress_percentage)}
    aria-label="Latest published project progress"
  />
</div>
                )}

                <section className="ct-panel">
                  <div className="ct-section-heading">
                    <div>
                      <h2>Update history</h2>
                      <p>{project?.name}</p>
                    </div>
                  </div>

                  {updates.length === 0 ? (
                    <div className="ct-empty">
                      <ClipboardCheck
                        size={32}
                        aria-hidden="true"
                      />

                      <h3>No site updates yet</h3>

                      <p>
                        {canManage
                          ? "Create an update to record completed work."
                          : "Published site updates will appear here."}
                      </p>
                    </div>
                  ) : (
                    <div className="su-list">
                      {updates.map((record) => (
                        <button
                          type="button"
                          className="su-record"
                          key={record.id}
                          disabled={Boolean(busy)}
                          onClick={() => openRecord(record)}
                        >
                          <div>
                            <span className="su-date">
                              {dateLabel(record.update_date)}
                            </span>

                            <h3>{record.title}</h3>
                            <p>{record.work_completed}</p>
                          </div>

                          <div className="su-record-meta">
                            <strong>
                              {Number(
                                record.progress_percentage
                              )}%
                            </strong>

                            <StatusBadge
                              status={record.status}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}