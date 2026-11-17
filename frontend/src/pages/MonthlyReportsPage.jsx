import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Plus,
} from "lucide-react";

import {
  createProjectMonthlyReport,
  getMonthlyReportAccess,
  getMyProjects,
  getProjectMonthlyReports,
  publishProjectMonthlyReport,
  updateProjectMonthlyReport,
  explainMonthlyReport,
} from "../services/workspaceApi";

import "../styles/MonthlyReportsPage.css";
import ReportComments from "../components/ReportComments";
import { useSearchParams } from "react-router-dom";


function currentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
}

function emptyForm() {
  return {
    month: currentMonth(),
    summary: "",
    issues: "",
    next_steps: "",
  };
}

function money(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value || 0));
}

function monthLabel(value) {
  if (!value) return "—";

  const parsed = new Date(`${value.slice(0, 7)}-01T00:00:00`);

  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
}

function timestampLabel(value) {
  if (!value) return "—";

  // Backend stores naive timestamps as UTC.
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value}Z`;

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}

function sortReports(records) {
  return [...records].sort(
    (a, b) => b.report_month.localeCompare(a.report_month)
  );
}


export default function MonthlyReportsPage({
  workspaceProject = null,
}) {
  const embedded = workspaceProject !== null;
  const mountedRef = useRef(false);
  const actionRef = useRef(false);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [searchParams, setSearchParams] = useSearchParams();

  const projectId = embedded
    ? String(workspaceProject.id)
    : searchParams.get("project") || "";

  const reportId = searchParams.get("report") || "";

  function updateReportLocation(nextProjectId, nextReportId = "", replace = false) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (embedded) {
          next.delete("project");
        } else if (nextProjectId) {
          next.set("project", String(nextProjectId));
        } else {
          next.delete("project");
        }

        if (nextReportId) {
          next.set("report", String(nextReportId));
        } else {
          next.delete("report");
        }

        return next;
      },
      { replace }
    );
  }
  const [access, setAccess] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  const [selected, setSelected] = useState(null);
  const [explanations, setExplanations] = useState({});
const [explainingId, setExplainingId] = useState(null);
const [explanationError, setExplanationError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManage = access?.can_manage === true;

  const project = workspaceProject || projects.find(
    (item) => String(item.id) === projectId
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
    setReports([]);
    setSelected(null);
    setShowForm(false);
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
          getMonthlyReportAccess(projectId),
          getProjectMonthlyReports(projectId),
        ]);

        if (cancelled) return;

        setAccess(permissions);
        setReports(
          sortReports(Array.isArray(records) ? records : [])
        );
      } catch (err) {
        if (!cancelled) setLoadError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
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

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [showForm]);

useEffect(() => {
  if (!reportId) {
    setSelected(null);
    return;
  }

  const record = reports.find(
    (item) => String(item.id) === reportId
  );

  setSelected(record || null);
  setShowForm(false);
}, [reports, reportId]);

  function changeProject(event) {
    if (embedded || actionRef.current) return;

    if (
      showForm &&
      !window.confirm("Discard this unsaved report form?")
    ) {
      return;
    }

    setShowForm(false);
    setSelected(null);
    setError("");
    setSuccess("");

    updateReportLocation(event.target.value);
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
      !projectId ||
      loading ||
      !canManage ||
      actionRef.current
    ) {
      return;
    }

    setSelected(null);
    setForm(emptyForm());
    setShowForm(true);
    setError("");
    setSuccess("");

    updateReportLocation(projectId);
  }

  function openRecord(record) {
    if (actionRef.current) return;

    setSelected(record);
    setShowForm(false);
    setError("");
    setSuccess("");

    updateReportLocation(projectId, record.id);
  }

  function startEdit() {
    if (
      actionRef.current ||
      !canManage ||
      selected?.status !== "draft"
    ) {
      return;
    }

    setForm({
      month: selected.report_month.slice(0, 7),
      summary: selected.summary,
      issues: selected.issues || "",
      next_steps: selected.next_steps || "",
    });

    setShowForm(true);
    setError("");
    setSuccess("");
  }


  function cancelForm() {
    if (actionRef.current) return;

    if (window.confirm("Discard this unsaved report form?")) {
      setShowForm(false);
      setError("");
    }
  }


    function storeRecord(record) {
    setReports((previous) =>
      sortReports([
        record,
        ...previous.filter(
          (item) => String(item.id) !== String(record.id)
        ),
      ])
    );

    setSelected(record);
    setShowForm(false);

    updateReportLocation(projectId, record.id, true);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (
      actionRef.current ||
      !canManage ||
      (selected && selected.status !== "draft")
    ) {
      return;
    }

    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.month) ||
      form.month > currentMonth() ||
      (selected && !form.summary.trim())
    ) {
      setError("Select a valid reporting month and enter a summary.");
      return;
    }

    if (
      !selected &&
      reports.some(
        (item) => item.report_month.slice(0, 7) === form.month
      )
    ) {
      setError("A report already exists for this month. Open it from history.");
      return;
    }

    const payload = selected
      ? {
          summary: form.summary.trim(),
          issues: form.issues.trim() || null,
          next_steps: form.next_steps.trim() || null,
        }
      : {};

    actionRef.current = true;
    setBusy("save");
    setError("");
    setSuccess("");

    try {
      const record = selected
        ? await updateProjectMonthlyReport(selected.id, payload)
        : await createProjectMonthlyReport(projectId, {
            ...payload,
            report_month: `${form.month}-01`,
          });

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Monthly report draft saved successfully.");
    } catch (err) {
      if (mountedRef.current) setError(messageFrom(err));
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  async function handleExplain() {
  if (
    !selected ||
    selected.status !== "published" ||
    access?.role !== "building_owner" ||
    explainingId !== null ||
    explanations[selected.id]
  ) {
    return;
  }

  const reportId = selected.id;
  setExplainingId(reportId);
  setExplanationError(null);

  try {
    const result = await explainMonthlyReport(reportId);
    setExplanations((previous) => ({
      ...previous,
      [reportId]: result.explanation,
    }));
  } catch (err) {
    setExplanationError({ reportId, message: messageFrom(err) });
  } finally {
    setExplainingId(null);
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
        "Publish this report? Figures will be recalculated from eligible records at publication and then preserved. The report will become read-only and visible to the Building Owner."
      )
    ) {
      return;
    }

    actionRef.current = true;
    setBusy("publish");
    setError("");
    setSuccess("");

    try {
      const record = await publishProjectMonthlyReport(selected.id);

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Monthly report published successfully.");
    } catch (err) {
      if (mountedRef.current) setError(messageFrom(err));
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }


  return (
    <div className={`ct-page mr-page${embedded ? " mr-embedded" : ""}`}>
      <div className="ct-container">
{!embedded && (
  <header className="ct-heading">
    <h1>Monthly reports</h1>
    <p>Review project progress, payments and the month’s key updates.</p>
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
              onClick={() => setProjectsRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="ct-state">
            <h2>No projects available</h2>
            <p>Create a project or accept a project invitation.</p>
          </div>
        ) : (
          <>
            <div className="ct-toolbar">
              <div
  className="ct-project-control"
  hidden={embedded}
>
                <label htmlFor="mr-project">Project</label>

                <select
                  id="mr-project"
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

                {access && !loading && (
                  <span className="ct-access">
                    {canManage
                      ? "QS access"
                      : access.role === "organization_admin"
                        ? "Admin · View only"
                        : "Owner · View only"}
                  </span>
                )}
              </div>

              {projectId &&
                !loading &&
                !loadError &&
                canManage &&
                !showForm &&
                !selected && (
                  <button
                    type="button"
                    className="ct-button ct-primary"
                    onClick={startCreate}
                  >
                    <Plus size={17} aria-hidden="true" />
                    New report
                  </button>
                )}
            </div>

            {error && (
              <div className="ct-message ct-error" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="ct-message ct-success" role="status">
                {success}
              </div>
            )}

            {!projectId ? (
              <div className="ct-state">
                <FileText size={32} aria-hidden="true" />
                <h2>Choose a project</h2>
                <p>View monthly reports and project summaries.</p>
              </div>
            ) : loading ? (
              <div className="ct-state" role="status">
                Loading reports…
              </div>
            ) : loadError ? (
              <div className="ct-state" role="alert">
                <p>{loadError}</p>
                <button
                  type="button"
                  className="ct-button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            ) : showForm ? (
              <section className="ct-panel mr-form-panel">
                <div className="ct-section-heading">
                  <div>
                    <span className="ct-eyebrow">MONTHLY REPORT DRAFT</span>
                    <h2>{selected ? "Edit report" : "New monthly report"}</h2>
                    <p>{project?.name}</p>
                  </div>
                </div>

                <form onSubmit={handleSave}>
                  <label className="ct-field">
                    Reporting month
                    <input
                      type="month"
                      name="month"
                      value={form.month}
                      max={currentMonth()}
                      onChange={updateField}
                      disabled={Boolean(selected) || Boolean(busy)}
                      required
                    />
                  </label>

{!selected && (
  <div className="mr-guidance">
    <h3>How monthly reports work</h3>

    <div className="mr-guidance-step">
      <span>1</span>
      <div>
        <strong>Select reporting month</strong>
        <p>Choose the month you want to prepare.</p>
      </div>
    </div>

    <div className="mr-guidance-step">
      <span>2</span>
      <div>
        <strong>Generate and review</strong>
        <p>
          Buildora generates a draft using available
          published site updates, certificates and payments.
          Review the figures before publishing.
        </p>
      </div>
    </div>

    <div className="mr-guidance-step">
      <span>3</span>
      <div>
        <strong>Publish report</strong>
        <p>
          Verify the generated report and publish it
          for the Building Owner.
        </p>
      </div>
    </div>
  </div>
)}

{selected && (
  <>
    <label className="ct-field">
      Monthly summary
      <textarea
        name="summary"
        value={form.summary}
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
  </>
)}

                  <p className="ct-footnote">
                    Progress and financial figures are calculated from
                    published project records when the draft is saved
                    and again when it is published.
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
  ? selected
    ? "Saving…"
    : "Generating…"
  : selected
    ? "Save draft"
    : "Generate draft"}
                    </button>
                  </div>
                </form>
              </section>
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

  updateReportLocation(projectId);
}}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Report history
                </button>

                <div className="ct-section-heading">
                  <div>
                    <h2>{monthLabel(selected.report_month)}</h2>
                    <p>{project?.name}</p>
                  </div>

                  <span
                    className={`ct-badge ${
                      selected.status === "published"
                        ? "ct-published"
                        : "ct-draft"
                    }`}
                  >
                    {selected.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>

                <div className="mr-progress">
                  <div>
                    <span>Reported project progress</span>
                    <strong>
                      {selected.progress_percentage == null
                        ? "Not available"
                        : `${Number(selected.progress_percentage)}%`}
                    </strong>
                  </div>

                  {selected.progress_percentage != null && (
                    <progress
                      value={Number(selected.progress_percentage)}
                      max="100"
                      aria-label="Reported project completion"
                    />
                  )}

                  <p>
                    Based on the latest eligible published site update.
                    Progress is separate from payment percentage.
                  </p>
                </div>

                <dl className="mr-figures">
                  <div>
                    <dt>Payments this month</dt>
                    <dd>{money(selected.payments_this_month)}</dd>
                  </div>
                  <div>
                    <dt>Certified net payable to date</dt>
                    <dd>{money(selected.certified_to_date)}</dd>
                  </div>
                  <div>
                    <dt>Paid to date</dt>
                    <dd>{money(selected.paid_to_date)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding to date</dt>
                    <dd>{money(selected.outstanding_to_date)}</dd>
                  </div>
                </dl>

                <div className="mr-content">
                  <section>
                    <h3>Monthly summary</h3>
                    <p>{selected.summary}</p>
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

{access?.role === "building_owner" && selected.status === "published" && (
  <section>
{!(explanations[selected.id] || selected.ai_explanation) && (
      <button
        type="button"
        className="ct-button mr-explain-button"
        onClick={handleExplain}
        disabled={explainingId !== null}
      >
        {explainingId === selected.id
          ? "Explaining…"
          : "Explain in simple words"}
      </button>
    )}

    {explanationError?.reportId === selected.id && (
      <p role="alert">{explanationError.message}</p>
    )}


<div className="mr-ai-card" role="status">
  {(explanations[selected.id] || selected.ai_explanation) && (
    <>
      <div className="mr-ai-header">
        <div>
          <h3> AI Report Explanation</h3>
          <p>
            Understand this monthly report in simple language.
          </p>
        </div>
        <span className="mr-ai-badge">AI generated</span>
      </div>

      <div className="mr-ai-content">
        {(explanations[selected.id] || selected.ai_explanation)
          .split("\n")
          .filter((line) => line.trim())
          .map((line, index) => {
            const trimmed = line.trim();

const heading = trimmed.match(/^\*\*(.+?)\*\*$/);

            if (heading) {
              return (
                <h4 key={index}>
                  {heading[1]}
                </h4>
              );
            }

            return <p key={index}>{trimmed}</p>;
          })}
      </div>
    </>
  )}
</div>

  </section>
)}
                <p className="ct-footnote">
                  Figures calculated: {timestampLabel(selected.snapshot_at)}.
                  {" "}
                  {selected.status === "published"
                    ? "This published report preserves its figures."
                    : "Draft figures may change when the report is saved or published."}
                  {" "}
                  Current-month reports cover the month to date.
                </p>

{selected.status === "published" && (
  <ReportComments
    key={selected.id}
    reportId={selected.id}
    canComment={
      access?.role === "qs" ||
      access?.role === "building_owner"
    }
  />
)}
                {canManage && selected.status === "draft" && (
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
                      <CheckCircle2 size={17} aria-hidden="true" />
                      {busy === "publish" ? "Publishing…" : "Publish report"}
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <section className="ct-panel">
                <div className="ct-section-heading">
                  <div>
                    <h2>Report history</h2>
                    <p>{project?.name}</p>
                  </div>
                </div>

                {reports.length === 0 ? (
                  <div className="ct-empty">
                    <FileText size={32} aria-hidden="true" />
                    <h3>No monthly reports yet</h3>
                    <p>
                      {canManage
                        ? "Create a report to summarise this month's project updates."
                        : "Published monthly reports will appear here."}
                    </p>
                  </div>
                ) : (
                  <div className="ct-table-wrap">
                    <table className="ct-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Progress</th>
                          <th>Payments this month</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((record) => (
                          <tr key={record.id}>
                            <td>
                              <strong>{monthLabel(record.report_month)}</strong>
                            </td>
                            <td>
                              {record.progress_percentage == null
                                ? "Not available"
                                : `${Number(record.progress_percentage)}%`}
                            </td>
                            <td>{money(record.payments_this_month)}</td>
                            <td>
                              <span
                                className={`ct-badge ${
                                  record.status === "published"
                                    ? "ct-published"
                                    : "ct-draft"
                                }`}
                              >
                                {record.status === "published"
                                  ? "Published"
                                  : "Draft"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ct-open"
                                onClick={() => openRecord(record)}
                                aria-label={`Open ${monthLabel(record.report_month)} report`}
                              >
                                <ArrowRight size={18} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}