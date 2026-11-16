import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Plus,
} from "lucide-react";

import {
  createProjectCertificate,
  getCertificateAccess,
  getMyProjects,
  getProjectCertificates,
  getProjectValuations,
  publishCertificate,
  updateCertificate,
} from "../services/workspaceApi";

import certificateIllustration from "../assets/certificate-illustration.png";

import "../styles/CertificatesPage.css";


function emptyForm() {
  return {
    valuation_id: "",
    retention_percentage: "0",
    other_deductions: "0",
    deduction_reason: "",
    notes: "",
  };
}

function money(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "—";

  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-GB", {
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

function statusLabel(value) {
  return value === "published" ? "Published" : "Draft";
}


export default function CertificatesPage({
  workspaceProject = null,
}) {
  const embedded = workspaceProject !== null;
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const actionRef = useRef(false);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [projectId, setProjectId] = useState(() =>
  workspaceProject ? String(workspaceProject.id) : ""
);
  const [access, setAccess] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [valuations, setValuations] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [workspaceRetry, setWorkspaceRetry] = useState(0);

  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const project = projects.find(
    (item) => String(item.id) === projectId
  );

  const canManage = access?.can_manage === true;

  const published = certificates.filter(
    (item) => item.status === "published"
  );

  const publishedTotal = published.reduce(
    (total, item) => total + Number(item.net_payable || 0),
    0
  );

  const draftCount = certificates.filter(
    (item) => item.status === "draft"
  ).length;

  const availableValuations = valuations.filter(
    (valuation) =>
      valuation.status === "published" &&
      !certificates.some(
        (certificate) =>
          certificate.valuation_id === valuation.id
      )
  );

  const formValuation = valuations.find(
    (item) => String(item.id) === form.valuation_id
  );

  const workValue = Number(
    selected?.work_value ?? formValuation?.total_amount ?? 0
  );

  const retentionPercentage = Number(form.retention_percentage);
  const otherDeductions = Number(form.other_deductions);

  // Display preview only. Backend calculates the saved amounts.
  const retentionPreview =
    Math.round(workValue * retentionPercentage) / 100;

  const netPreview =
    Math.round(
      (workValue - retentionPreview - otherDeductions) * 100
    ) / 100;


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
    const requestId = ++requestRef.current;

    setAccess(null);
    setCertificates([]);
    setValuations([]);
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
        const [permissions, records, valuationRecords] =
          await Promise.all([
            getCertificateAccess(projectId),
            getProjectCertificates(projectId),
            getProjectValuations(projectId),
          ]);

        if (
          !mountedRef.current ||
          requestId !== requestRef.current
        ) {
          return;
        }

        setAccess(permissions);
        setCertificates(Array.isArray(records) ? records : []);
        setValuations(
          Array.isArray(valuationRecords)
            ? valuationRecords
            : []
        );
      } catch (err) {
        if (
          mountedRef.current &&
          requestId === requestRef.current
        ) {
          setLoadError(messageFrom(err));
        }
      } finally {
        if (
          mountedRef.current &&
          requestId === requestRef.current
        ) {
          setLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      requestRef.current += 1;
    };
  }, [projectId, workspaceRetry]);


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


  function changeProject(event) {
    if (actionRef.current) return;

    if (
      showForm &&
      !window.confirm("Discard this unsaved certificate form?")
    ) {
      return;
    }

    setProjectId(event.target.value);
  }


  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }


  function startCreate() {
    if (actionRef.current || !canManage) return;

    setSelected(null);
    setForm(emptyForm());
    setShowForm(true);
    setError("");
    setSuccess("");
  }


  function openRecord(record) {
    setSelected(record);
    setShowForm(false);
    setError("");
    setSuccess("");
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
      valuation_id: String(selected.valuation_id),
      retention_percentage: String(
        selected.retention_percentage
      ),
      other_deductions: String(selected.other_deductions),
      deduction_reason: selected.deduction_reason || "",
      notes: selected.notes || "",
    });

    setShowForm(true);
    setError("");
    setSuccess("");
  }


  function cancelForm() {
    if (actionRef.current) return;

    if (window.confirm("Discard this unsaved certificate form?")) {
      setShowForm(false);
      setError("");
    }
  }


  function storeRecord(record) {
    setCertificates((previous) =>
      [
        record,
        ...previous.filter((item) => item.id !== record.id),
      ].sort(
        (a, b) => b.certificate_no - a.certificate_no
      )
    );

    setSelected(record);
    setShowForm(false);
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

    const decimalPattern = /^\d+(?:\.\d{1,2})?$/;

    if (
      !form.valuation_id ||
      !decimalPattern.test(form.retention_percentage) ||
      !decimalPattern.test(form.other_deductions) ||
      !Number.isFinite(retentionPercentage) ||
      !Number.isFinite(otherDeductions) ||
      retentionPercentage < 0 ||
      retentionPercentage > 100 ||
      otherDeductions < 0 ||
      workValue <= 0 ||
      netPreview < 0
    ) {
      setError(
        "Select a valuation and enter valid deductions with up to two decimal places. Total deductions cannot exceed the work value."
      );
      return;
    }

    if (otherDeductions > 0 && !form.deduction_reason.trim()) {
      setError("Enter a reason for other deductions.");
      return;
    }

    const payload = {
      retention_percentage: form.retention_percentage,
      other_deductions: form.other_deductions,
      deduction_reason: form.deduction_reason.trim() || null,
      notes: form.notes.trim() || null,
    };

    actionRef.current = true;
    setBusy("save");
    setError("");
    setSuccess("");

    try {
      const record = selected
        ? await updateCertificate(selected.id, payload)
        : await createProjectCertificate(projectId, {
            ...payload,
            valuation_id: Number(form.valuation_id),
          });

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Certificate draft saved successfully.");
    } catch (err) {
      if (mountedRef.current) setError(messageFrom(err));
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
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
        "Publish this certificate? It will become read-only and visible to the Building Owner."
      )
    ) {
      return;
    }

    actionRef.current = true;
    setBusy("publish");
    setError("");
    setSuccess("");

    try {
      const record = await publishCertificate(selected.id);

      if (!mountedRef.current) return;

      storeRecord(record);
      setSuccess("Certificate published successfully.");
    } catch (err) {
      if (mountedRef.current) setError(messageFrom(err));
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }


  function valuationNumber(valuationId) {
    return (
      valuations.find((item) => item.id === valuationId)
        ?.valuation_no ?? "—"
    );
  }


  const projectControl = (
    <div
  className="ct-project-control"
  style={embedded ? { display: "none" } : undefined}
>
      <label htmlFor="ct-project">Project</label>

      <select
        id="ct-project"
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
  );


  return (
    <div className={`ct-page ${embedded ? "ct-embedded" : ""}`}>
      <div className="ct-container">

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
            <FileCheck2 size={30} aria-hidden="true" />
            <h2>No projects available</h2>
            <p>Create a project or accept a project invitation.</p>
          </div>
        ) : (
          <>
            {!projectId ? (
              <>
                <section className="ct-welcome">
                  <div className="ct-welcome-copy">
                    <h2>Completed work.<br />Clearly certified.</h2>
                    <p>
                      Select a project to review certificates,
                      deductions and net payable amounts.
                    </p>

                    {projectControl}
                  </div>

                  <img
                    className="ct-welcome-image"
                    src={certificateIllustration}
                    alt=""
                    aria-hidden="true"
                  />
                </section>

                <div className="ct-steps">
                  {[
                    [
                      "Select a project",
                      "Open its certificate history.",
                    ],
                    [
                      "Review certified value",
                      "See work value and deductions.",
                    ],
                    [
                      "Follow net payable",
                      "Review the amount certified for payment.",
                    ],
                  ].map(([title, description], index) => (
                    <div className="ct-step" key={title}>
                      <span className="ct-step-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="ct-toolbar">
                  {projectControl}

                  {!loading &&
                    !loadError &&
                    canManage &&
                    !selected &&
                    !showForm && (
                      <button
                        type="button"
                        className="ct-button ct-primary"
                        onClick={startCreate}
                        disabled={availableValuations.length === 0}
                      >
                        <Plus size={17} aria-hidden="true" />
                        New certificate
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
                    <CheckCircle2 size={18} aria-hidden="true" />
                    {success}
                  </div>
                )}

                {loading ? (
                  <div className="ct-state" role="status">
                    Loading certificates…
                  </div>
                ) : loadError ? (
                  <div className="ct-state" role="alert">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      className="ct-button"
                      onClick={() =>
                        setWorkspaceRetry((value) => value + 1)
                      }
                    >
                      Try again
                    </button>
                  </div>
                ) : showForm ? (
                  <section className="ct-panel">
                    <div className="ct-section-heading">
                      <div>
                        <span className="ct-eyebrow">
                          CERTIFICATE DRAFT
                        </span>
                        <h2>
                          {selected
                            ? `Edit certificate #${selected.certificate_no}`
                            : "New certificate"}
                        </h2>
                        <p>{project?.name}</p>
                      </div>
                      <span className="ct-badge ct-draft">Draft</span>
                    </div>

                    <form onSubmit={handleSave}>
                      {!selected && (
                        <label className="ct-field">
                          Published valuation
                          <select
                            name="valuation_id"
                            value={form.valuation_id}
                            onChange={updateField}
                            disabled={Boolean(busy)}
                            required
                          >
                            <option value="" disabled>
                              Choose a valuation
                            </option>

                            {availableValuations.map((item) => (
                              <option key={item.id} value={item.id}>
                                Valuation #{item.valuation_no}
                                {" — "}
                                {money(item.total_amount)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <div className="ct-work-value">
                        <span>Valuation work value</span>
                        <strong>{money(workValue)}</strong>
                      </div>

                      <div className="ct-form-grid">
                        <label className="ct-field">
                          Retention (%)
                          <input
                            type="number"
                            name="retention_percentage"
                            min="0"
                            max="100"
                            step="0.01"
                            value={form.retention_percentage}
                            onChange={updateField}
                            disabled={Boolean(busy)}
                            required
                          />
                        </label>

                        <label className="ct-field">
                          Other deductions (LKR)
                          <input
                            type="number"
                            name="other_deductions"
                            min="0"
                            step="0.01"
                            value={form.other_deductions}
                            onChange={updateField}
                            disabled={Boolean(busy)}
                            required
                          />
                        </label>
                      </div>

                      <label className="ct-field">
                        Deduction reason
                        <textarea
                          name="deduction_reason"
                          placeholder="Explain any other deductions"
                          value={form.deduction_reason}
                          onChange={updateField}
                          maxLength={2000}
                          required={otherDeductions > 0}
                          disabled={Boolean(busy)}
                        />
                      </label>

                      <label className="ct-field">
                        Notes (optional)
                        <textarea
                          name="notes"
                          value={form.notes}
                          onChange={updateField}
                          maxLength={2000}
                          disabled={Boolean(busy)}
                        />
                      </label>

                      <div className="ct-preview">
                        <div>
                          <span>Estimated retention</span>
                          <strong>
                            {money(
                              Number.isFinite(retentionPreview)
                                ? retentionPreview
                                : 0
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Estimated net payable</span>
                          <strong>
                            {money(
                              Number.isFinite(netPreview)
                                ? netPreview
                                : 0
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="ct-actions">
                        <button
                          type="button"
                          className="ct-button"
                          disabled={Boolean(busy)}
                          onClick={cancelForm}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="ct-button ct-primary"
                          disabled={Boolean(busy)}
                        >
                          {busy === "save" ? "Saving…" : "Save draft"}
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
                        setSelected(null);
                        setError("");
                        setSuccess("");
                      }}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Certificate history
                    </button>

                    <div className="ct-section-heading">
                      <div>
                        <span className="ct-eyebrow">
                          PAYMENT CERTIFICATE
                        </span>
                        <h2>
                          Certificate #
                          {String(selected.certificate_no).padStart(2, "0")}
                        </h2>
                        <p>
                          {project?.name}
                          {" · Valuation #"}
                          {valuationNumber(selected.valuation_id)}
                        </p>
                      </div>

                      <span
                        className={`ct-badge ${
                          selected.status === "published"
                            ? "ct-published"
                            : "ct-draft"
                        }`}
                      >
                        {statusLabel(selected.status)}
                      </span>
                    </div>

                    <dl className="ct-breakdown">
                      <div>
                        <dt>Work value</dt>
                        <dd>{money(selected.work_value)}</dd>
                      </div>
                      <div>
                        <dt>
                          Retention ({selected.retention_percentage}%)
                        </dt>
                        <dd>− {money(selected.retention_amount)}</dd>
                      </div>
                      <div>
                        <dt>Other deductions</dt>
                        <dd>− {money(selected.other_deductions)}</dd>
                      </div>
                    </dl>

                    {selected.deduction_reason && (
                      <div className="ct-note">
                        <h3>Deduction reason</h3>
                        <p>{selected.deduction_reason}</p>
                      </div>
                    )}

                    {selected.notes && (
                      <div className="ct-note">
                        <h3>Notes</h3>
                        <p>{selected.notes}</p>
                      </div>
                    )}

                    <div className="ct-total-footer">
                      <div>
                        <span>Net payable</span>
                        <strong>{money(selected.net_payable)}</strong>
                        <small>
                          Certified amount; payment is recorded separately.
                        </small>
                      </div>

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
                            {busy === "publish"
                              ? "Publishing…"
                              : "Publish certificate"}
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                ) : (
                  <>
                     <div className="cert-valuation-style">
                      <header className="ct-heading">
</header>
                    <dl className="ct-summary">
                      <div>
                        <dt>Published certificates</dt>
                        <dd>{published.length}</dd>
                      </div>
                      <div>
                        <dt>Total certified net payable</dt>
                        <dd>{money(publishedTotal)}</dd>
                      </div>
                      {access?.role !== "building_owner" && (
                        <div>
                          <dt>Draft certificates</dt>
                          <dd>{draftCount}</dd>
                        </div>
                      )}
                    </dl>

                    <section className="ct-panel">
                      <div className="ct-section-heading">
                        <div>
                          <h2>Certificate history</h2>
                          <p>{project?.name}</p>
                        </div>
                      </div>

                      {certificates.length === 0 ? (
                        <div className="ct-empty">
                          <FileCheck2 size={32} aria-hidden="true" />
                          <h3>No certificates yet</h3>
                          <p>
                            {canManage
                              ? availableValuations.length
                                ? "Create a draft from a published valuation."
                                : "Publish a valuation before creating its certificate."
                              : "Published certificates will appear here."}
                          </p>
                        </div>
                      ) : (
                        <div className="ct-table-wrap">
                          <table className="ct-table">
                            <thead>
                              <tr>
                                <th>Certificate</th>
                                <th>Valuation</th>
                                <th>Work value</th>
                                <th>Net payable</th>
                                <th>Status</th>
                                <th>
                                  <span className="ct-sr-only">Open</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {certificates.map((record) => (
                                <tr key={record.id}>
                                  <td>
                                    <strong>
                                      #{String(record.certificate_no).padStart(2, "0")}
                                    </strong>
                                    <small>
                                      {dateLabel(record.created_at)}
                                    </small>
                                  </td>
                                  <td>
                                    #{valuationNumber(record.valuation_id)}
                                  </td>
                                  <td>{money(record.work_value)}</td>
                                  <td>
                                    <strong>{money(record.net_payable)}</strong>
                                  </td>
                                  <td>
                                    <span
                                      className={`ct-badge ${
                                        record.status === "published"
                                          ? "ct-published"
                                          : "ct-draft"
                                      }`}
                                    >
                                      {statusLabel(record.status)}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="ct-open"
                                      onClick={() => openRecord(record)}
                                      aria-label={`Open certificate ${record.certificate_no}`}
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

                      <p className="ct-footnote">
                        Published certificates are read-only.
                        A certificate does not confirm that payment has been made.
                      </p>
                    </section>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}