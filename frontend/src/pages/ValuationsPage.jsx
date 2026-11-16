import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import {
  createProjectValuation,
  getMyProjects,
  getProjectValuations,
  getValuationAccess,
  getValuationBOQs,
  publishProjectValuation,
  updateValuationQuantity,
  updateValuationPeriod,
} from "../services/workspaceApi";

import "../styles/ValuationsPage.css";
import valuationIllustration from "../assets/valuation-illustration.png";

function money(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function quantity(value) {
  return new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "—";

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}


function valuationPeriod(start, end) {
  if (!start || !end) return "—";

  const parse = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };

  const first = parse(start);
  const last = parse(end);

  if (
    Number.isNaN(first.getTime()) ||
    Number.isNaN(last.getTime())
  ) {
    return `${dateLabel(start)} – ${dateLabel(end)}`;
  }

  const format = (date, options) =>
    date.toLocaleDateString("en-GB", {
      ...options,
      timeZone: "UTC",
    });

  if (first.getUTCFullYear() === last.getUTCFullYear()) {
    return `${format(first, {
      day: "2-digit",
      month: "short",
    })} – ${format(last, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
  }

  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

function today() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function nextDay(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function getInputs(record) {
  return Object.fromEntries(
    (record?.items || []).map((item) => [
      item.id,
      String(item.cumulative_quantity),
    ])
  );
}

export default function ValuationsPage({
  workspaceProject = null,
}) {
  const embedded = workspaceProject !== null;
  const navigate = useNavigate();

  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const actionRef = useRef(false);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");

  const [projectId, setProjectId] = useState(() =>
  workspaceProject ? String(workspaceProject.id) : ""
);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [access, setAccess] = useState(null);
  const [boqs, setBoqs] = useState([]);
  const [valuations, setValuations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [inputs, setInputs] = useState({});

  const [showCreate, setShowCreate] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");

  const [editingDates, setEditingDates] = useState(false);
const [editPeriodStart, setEditPeriodStart] = useState("");
const [editPeriodEnd, setEditPeriodEnd] = useState("");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  

    const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError("");

    try {
      if (workspaceProject) {
        if (!mountedRef.current) return;

        setProjects([workspaceProject]);
        return;
      }

      const data = await getMyProjects();

      if (!mountedRef.current) return;

      if (!Array.isArray(data)) {
        throw new Error("Unexpected project response.");
      }

      setProjects(data);
    } catch (err) {
      if (mountedRef.current) {
        setProjectsError(
          err?.message || "Unable to load projects."
        );
      }
    } finally {
      if (mountedRef.current) {
        setProjectsLoading(false);
      }
    }
  }, [workspaceProject]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);


  const loadWorkspace = useCallback(async (id) => {
    const requestId = ++requestRef.current;

    setLoading(true);
    setLoadError("");
    setAccess(null);
    setBoqs([]);
    setValuations([]);
    setSelected(null);
    setInputs({});
    setShowCreate(false);
    setError("");
    setSuccess("");

    try {
      const [permission, boqData, valuationData] =
        await Promise.all([
          getValuationAccess(id),
          getValuationBOQs(id),
          getProjectValuations(id),
        ]);

      if (
        !mountedRef.current ||
        requestId !== requestRef.current
      ) {
        return;
      }

      if (
        !Array.isArray(boqData) ||
        !Array.isArray(valuationData)
      ) {
        throw new Error("Unexpected valuation response.");
      }

      setAccess(permission);
      setBoqs(boqData);
      setValuations(valuationData);
    } catch (err) {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoadError(
          err?.message || "Unable to load valuations."
        );
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      void loadWorkspace(projectId);
    }
  }, [projectId, loadWorkspace]);

  const project = projects.find(
    (item) => String(item.id) === projectId
  );

  const latestBOQ = useMemo(
    () =>
      [...boqs]
        .filter((item) => item.status === "published")
        .sort((a, b) => Number(b.id) - Number(a.id))[0],
    [boqs]
  );

  const existingDraft = valuations.find(
    (item) => item.status === "draft"
  );

  const published = valuations.filter(
    (item) => item.status === "published"
  );

  const latestPublished = [...published].sort(
    (a, b) => b.valuation_no - a.valuation_no
  )[0];

  const publishedTotal = published.reduce(
    (total, item) => total + Number(item.total_amount || 0),
    0
  );

  const isArchived = workspaceProject?.status === "archived";

const canManage =
  access?.can_manage === true && !isArchived;

  const editable =
    canManage && selected?.status === "draft";

  const dirtyItems = editable
    ? (selected.items || []).filter(
        (item) =>
          String(inputs[item.id] ?? "") !==
          String(item.cumulative_quantity)
      )
    : [];

    const filteredValuations = valuations.filter((record) => {
  const query = historySearch.trim().toLowerCase();

  const matchesStatus =
    historyStatus === "all" ||
    record.status === historyStatus;

  const text = [
    `Valuation #${record.valuation_no}`,
    record.period_start,
    record.period_end,
    record.notes,
    record.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return matchesStatus && (!query || text.includes(query));
});

  function confirmLeave() {
    return (
      dirtyItems.length === 0 ||
      window.confirm(
        "You have unsaved quantities. Discard these changes?"
      )
    );
  }

  function openRecord(record) {
    if (actionRef.current || !confirmLeave()) return;

    setSelected(record);
    setInputs(getInputs(record));
    setShowCreate(false);
    setError("");
    setSuccess("");
    setEditingDates(false);
  }

  function replaceRecord(record) {
    setValuations((current) =>
      [
        record,
        ...current.filter((item) => item.id !== record.id),
      ].sort((a, b) => b.valuation_no - a.valuation_no)
    );

    setSelected(record);
  }

  function startCreate() {
    if (actionRef.current || !confirmLeave()) return;

    const start = latestPublished
      ? nextDay(latestPublished.period_end)
      : today();

    setPeriodStart(start);
    setPeriodEnd(start > today() ? start : today());
    setNotes("");
    setSelected(null);
    setInputs({});
    setShowCreate(true);
    setError("");
    setSuccess("");
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (actionRef.current || !canManage || !latestBOQ) {
      return;
    }

    if (
      !periodStart ||
      !periodEnd ||
      periodEnd < periodStart
    ) {
      setError("Enter a valid valuation period.");
      return;
    }

    actionRef.current = true;
    setBusy("create");
    setError("");
    setSuccess("");

    try {
      const record = await createProjectValuation(
        projectId,
        {
          boq_id: latestBOQ.id,
          period_start: periodStart,
          period_end: periodEnd,
          notes: notes.trim() || null,
        }
      );

      if (!mountedRef.current) return;

      replaceRecord(record);
      setInputs(getInputs(record));
      setShowCreate(false);
      setSuccess("Valuation draft created.");
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err?.message || "Unable to create valuation."
        );
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  async function saveItem(item) {
    if (actionRef.current || !editable) return;

    const value = String(inputs[item.id] ?? "").trim();

    if (!/^\d+(?:\.\d{1,3})?$/.test(value)) {
      setError(
        "Enter a non-negative quantity with up to 3 decimal places."
      );
      return;
    }

    actionRef.current = true;
    setBusy(`item-${item.id}`);
    setError("");
    setSuccess("");

    try {
      const record = await updateValuationQuantity(
        selected.id,
        item.id,
        value
      );

      if (!mountedRef.current) return;

      replaceRecord(record);

      const savedItem = record.items.find(
        (row) => row.id === item.id
      );

      if (savedItem) {
        setInputs((current) => ({
          ...current,
          [item.id]: String(savedItem.cumulative_quantity),
        }));
      }

      setSuccess(`Item ${item.item_no} saved.`);
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err?.message || "Unable to save quantity."
        );
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  async function handlePublish() {
    if (actionRef.current || !editable) return;

    if (dirtyItems.length > 0) {
      setError("Save all changed quantities before publishing.");
      return;
    }

    if (
      !window.confirm(
        "Publish this valuation? Its quantities will become read-only."
      )
    ) {
      return;
    }

    actionRef.current = true;
    setBusy("publish");
    setError("");
    setSuccess("");

    try {
      const record = await publishProjectValuation(
        selected.id
      );

      if (!mountedRef.current) return;

      replaceRecord(record);
      setInputs(getInputs(record));
      setSuccess(
        "Valuation published. The assigned Owner can now view it."
      );
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err?.message || "Unable to publish valuation."
        );
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  function startEditingDates() {
  if (!selected || busy || actionRef.current) return;

  if (!confirmLeave()) return;

  setInputs(getInputs(selected));
  setEditPeriodStart(selected.period_start);
  setEditPeriodEnd(selected.period_end);
  setEditingDates(true);
  setError("");
  setSuccess("");
}

async function handleSaveDates(event) {
  event.preventDefault();

  if (
    !selected ||
    selected.status !== "draft" ||
    !canManage ||
    busy ||
    actionRef.current
  ) {
    return;
  }

  if (
    !editPeriodStart ||
    !editPeriodEnd ||
    editPeriodEnd < editPeriodStart
  ) {
    setError("Select a valid valuation period.");
    return;
  }

  actionRef.current = true;
  setBusy("period");
  setError("");
  setSuccess("");

  try {
    const updated = await updateValuationPeriod(
      selected.id,
      {
        period_start: editPeriodStart,
        period_end: editPeriodEnd,
      }
    );

    if (!mountedRef.current) return;

    replaceRecord(updated);
    setInputs(getInputs(updated));
    setEditingDates(false);
    setSuccess("Valuation dates updated successfully.");
  } catch (err) {
    if (mountedRef.current) {
      setError(
        err?.message || "Unable to update valuation dates."
      );
    }
  } finally {
    actionRef.current = false;

    if (mountedRef.current) {
      setBusy("");
    }
  }
}

  return (
    <div className={`vl-page ${embedded ? "vl-embedded" : ""}`}>
      <div className="vl-container">
        
<header className="vl-heading vl-heading-with-action">
  <div>
  </div>

  {projectId &&
    canManage &&
    !loading &&
    !loadError &&
    !selected &&
    !showCreate && (
      <button
        type="button"
        className="vl-button vl-primary"
        disabled={
          Boolean(busy) ||
          (!existingDraft && !latestBOQ)
        }
        onClick={
          existingDraft
            ? () => openRecord(existingDraft)
            : startCreate
        }
      >
        <Plus size={16} aria-hidden="true" />
        {existingDraft ? "Open draft" : "New valuation"}
      </button>
    )}
</header>


{!embedded && project && (
  <section
    className="vl-project-banner"
    aria-label="Selected project"
  >
    <div>
      <span className="vl-project-eyebrow">
        SELECTED PROJECT
      </span>

      <h2>{project.name || "Untitled project"}</h2>

      <div className="vl-project-details">
        {project.location && (
          <span>{project.location}</span>
        )}

        <span>
          {canManage
            ? "Quantity Surveyor access"
            : access?.role === "organization_admin"
              ? "Organization Admin · View only"
              : "Building Owner · View only"}
        </span>
      </div>
    </div>

    <span className="vl-project-banner-icon" aria-hidden="true">
      <FolderKanban size={28} strokeWidth={1.5} />
    </span>
  </section>
)}
        {projectsLoading ? (
          <div className="vl-state" role="status">
            Loading your projects…
          </div>
        ) : projectsError ? (
          <div className="vl-state" role="alert">
            <p>{projectsError}</p>
            <button
              className="vl-button"
              onClick={loadProjects}
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="vl-state">
            <FolderKanban size={32} aria-hidden="true" />
            <h2>No projects available</h2>
            <p>
              Create a project or accept an invitation
              from your dashboard.
            </p>
            <button
              className="vl-button vl-primary"
              onClick={() => navigate("/dashboard")}
            >
              Go to dashboard
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
<div
  className={`vl-toolbar ${
    !projectId ? "vl-toolbar-welcome" : ""
  }`}
>
  {!projectId && (
    <>
      <div className="vl-welcome-copy">
        <h2>Every stage of work, clearly valued.</h2>

        <p>
          Select a project to review completed work
          and its valuation history.
        </p>
      </div>

      <img
        className="vl-welcome-image"
        src={valuationIllustration}
        alt=""
        aria-hidden="true"
      />
    </>
  )}
  <div
  className="vl-project-control"
  style={embedded ? { display: "none" } : undefined}
>
    <label htmlFor="valuation-project">Project</label>

    <select
      id="valuation-project"
      value={projectId}
      disabled={Boolean(busy)}
      onChange={(event) => {
        if (!confirmLeave()) return;

        setSelected(null);
        setInputs({});
        setHistorySearch("");
        setHistoryStatus("all");
        setProjectId(event.target.value);
      }}
    >
      <option value="" disabled hidden>
  Choose a project
</option>

      {projects.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name || `Project #${item.id}`}
        </option>
      ))}
    </select>

    {projectId && access && !loading && !loadError && (
      <span className="vl-role-chip">
        {canManage
          ? "QS access"
          : access.role === "organization_admin"
            ? "Admin · View only"
            : "Owner · View only"}
      </span>
    )}
  </div>
</div>
            {!projectId ? (
  <div className="vl-intro-steps">
    <div>
      <span>01</span>
      <div>
        <strong>Select a project</strong>
        <p>Open the project you want to review.</p>
      </div>
    </div>

    <div>
      <span>02</span>
      <div>
        <strong>Review completed work</strong>
        <p>Compare quantities and their value.</p>
      </div>
    </div>

    <div>
      <span>03</span>
      <div>
        <strong>Follow published valuations</strong>
        <p>Keep a clear record of each period.</p>
      </div>
    </div>
  </div>
            ) : loading ? (
              <div className="vl-state" role="status">
                Loading valuations…
              </div>
            ) : loadError ? (
              <div className="vl-state" role="alert">
                <h2>Unable to load valuations</h2>
                <p>{loadError}</p>
                <button
                  className="vl-button"
                  onClick={() => loadWorkspace(projectId)}
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div
                  className="vl-feedback"
                  aria-live="polite"
                >
                  {error && (
                    <p className="vl-error" role="alert">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p className="vl-success" role="status">
                      {success}
                    </p>
                  )}
                </div>

                {!selected && !showCreate && (
  <section className="vl-panel">
    <div className="vl-section-heading">
      <div>
<h2>Valuation history</h2>
      </div>

    {valuations.length >= 5 && (
      <div className="vl-history-filters">
        <input
          type="search"
          aria-label="Search valuations"
          placeholder="Search valuations…"
          value={historySearch}
          onChange={(event) =>
            setHistorySearch(event.target.value)
          }
        />

        <select
          aria-label="Filter valuations by status"
          value={historyStatus}
          onChange={(event) =>
            setHistoryStatus(event.target.value)
          }
        >
          <option value="all">All statuses</option>
          {canManage ||
          access?.role === "organization_admin" ? (
            <option value="draft">Draft</option>
          ) : null}
          <option value="published">Published</option>
        </select>
      </div>
        )}
    </div>

<div
  className="vl-summary vl-summary-cards"
  aria-label="Valuation summary"
>
  <div className="vl-summary-item">
    <span className="vl-summary-label">
      Published valuations
    </span>

    <strong className="vl-summary-value">
      {published.length}
    </strong>
  </div>

  <div className="vl-summary-item vl-summary-item-primary">
    <span className="vl-summary-label">
      Published work value
    </span>

    <strong className="vl-summary-value">
      {money(publishedTotal)}
    </strong>
  </div>

  <div className="vl-summary-item">
    <span className="vl-summary-label">
      Current draft
    </span>

    <div className="vl-summary-draft">
      <strong
        className={`vl-summary-value ${
          !existingDraft ? "vl-summary-muted" : ""
        }`}
      >
        {existingDraft
          ? `#${String(existingDraft.valuation_no).padStart(2, "0")}`
          : "None"}
      </strong>

      {existingDraft && (
        <span className="vl-summary-draft-badge">
          Draft
        </span>
      )}
    </div>
  </div>
</div>

    {canManage && !latestBOQ && (
      <p className="vl-notice">
        Publish a BOQ before creating the first valuation.
      </p>
    )}

    {valuations.length === 0 ? (
      <div className="vl-empty-history">
  <img
    src={valuationIllustration}
    alt=""
    aria-hidden="true"
  />

  <div>
    <h3>
      {canManage
        ? "Ready for your first valuation"
        : "Valuations will appear here"}
    </h3>

    <p>
      {canManage
        ? latestBOQ
          ? "Use New valuation to create a draft and record completed work."
          : "Publish a BOQ first, then create a valuation for completed work."
        : "Published valuations will be available here for you to review."}
    </p>
  </div>
</div>
    ) : filteredValuations.length === 0 ? (
      <div className="vl-state vl-state-inner">
        <h3>No matching valuations</h3>
        <p>Try another search or change the status filter.</p>
        <button
          type="button"
          className="vl-button"
          onClick={() => {
            setHistorySearch("");
            setHistoryStatus("all");
          }}
        >
          Clear filters
        </button>
      </div>
    ) : (
      <div className="vl-history-scroll">
        <table className="vl-history-table">
          <thead>
            
<tr>
  <th scope="col">Valuation</th>
  <th scope="col">Period</th>
  <th scope="col">BOQ</th>
  <th scope="col" className="vl-history-money">
    Work value (LKR)
  </th>
  <th scope="col">Status</th>
  <th scope="col">
    <span className="vl-sr-only">Open</span>
  </th>
</tr>

          </thead>

          <tbody>
            {filteredValuations.map((record) => {
              const sourceBOQ = boqs.find(
                (boq) => boq.id === record.boq_id
              );

return (
  <tr
    key={record.id}
    className="vl-clickable-row"
    tabIndex={0}
    role="link"
    aria-label={`Open valuation ${record.valuation_no}`}
    onClick={() => openRecord(record)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openRecord(record);
      }
    }}
  >
    <td>
      <span className="vl-record-link">
        <ClipboardCheck size={17} aria-hidden="true" />
        Valuation #
        {String(record.valuation_no).padStart(2, "0")}
      </span>
    </td>

    <td>
      {valuationPeriod(
        record.period_start,
        record.period_end
      )}
    </td>

    <td>
      {sourceBOQ
        ? `Rev ${sourceBOQ.revision}`
        : "—"}
    </td>

    <td className="vl-history-money">
      {Number(record.total_amount || 0).toLocaleString(
        "en-LK",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}
    </td>

    <td>
      <span
        className={`vl-badge ${
          record.status === "published"
            ? "vl-published"
            : "vl-draft"
        }`}
      >
        {record.status}
      </span>
    </td>

    <td className="vl-row-chevron">
      <ChevronRight size={16} aria-hidden="true" />
    </td>
  </tr>
);

            })}
          </tbody>
        </table>
      </div>
    )}

    <p className="vl-history-note">
      <LockKeyhole size={15} aria-hidden="true" />
      Published valuations are read-only and visible to
      the assigned Building Owner.
    </p>
  </section>
)}
                {showCreate && (
                  <section className="vl-panel">
                    <div className="vl-section-heading">
                      <div>
                        <h2>New valuation</h2>
                        <p>
                          BOQ revision {latestBOQ?.revision}
                          {" · "}
                          {project?.name}
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleCreate}>
                      <div className="vl-form-grid">
                        <label>
                          Period start
                          <input
                            type="date"
                            required
                            value={periodStart}
                            min={
                              latestPublished
                                ? nextDay(
                                    latestPublished.period_end
                                  )
                                : undefined
                            }
                            disabled={Boolean(busy)}
                            onChange={(event) =>
                              setPeriodStart(event.target.value)
                            }
                          />
                        </label>

                        <label>
                          Period end
                          <input
                            type="date"
                            required
                            min={periodStart || undefined}
                            value={periodEnd}
                            disabled={Boolean(busy)}
                            onChange={(event) =>
                              setPeriodEnd(event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label className="vl-notes">
                        Notes (optional)
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={notes}
                          disabled={Boolean(busy)}
                          onChange={(event) =>
                            setNotes(event.target.value)
                          }
                          placeholder="Describe this valuation period."
                        />
                      </label>

                      <div className="vl-actions">
                        <button
                          type="button"
                          className="vl-button"
                          disabled={Boolean(busy)}
                          onClick={() => setShowCreate(false)}
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          className="vl-button vl-primary"
                          disabled={Boolean(busy)}
                        >
                          {busy === "create"
                            ? "Creating…"
                            : "Create draft"}
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {selected && (
                  <section className="vl-panel">
                    <button
                      type="button"
                      className="vl-back"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        if (confirmLeave()) {
                          setSelected(null);
                          setInputs({});
                          setError("");
                          setSuccess("");
                        }
                      }}
                    >
                      <ChevronLeft size={17} />
                      Valuation history
                    </button>

                    <div className="vl-section-heading">
                      <div>
                        <h2>
                          Valuation #{selected.valuation_no}
                        </h2>
                        <p>
                          {dateLabel(selected.period_start)}
                          {" – "}
                          {dateLabel(selected.period_end)}
                        </p>
                      </div>

                      <span
                        className={`vl-badge ${
                          selected.status === "published"
                            ? "vl-published"
                            : "vl-draft"
                        }`}
                      >
                        {selected.status}
                      </span>
                    </div>

                    {selected.notes && (
                      <p className="vl-notice">
                        {selected.notes}
                      </p>
                    )}

                    {editable && (
  <div style={{ marginBottom: "20px" }}>
    {!editingDates ? (
      <button
        type="button"
        className="vl-button"
        disabled={Boolean(busy)}
        onClick={startEditingDates}
      >
        Edit dates
      </button>
    ) : (
      <form onSubmit={handleSaveDates}>
        <div className="vl-form-grid">
          <label>
            Period start
            <input
              type="date"
              required
              value={editPeriodStart}
              disabled={Boolean(busy)}
              onChange={(event) =>
                setEditPeriodStart(event.target.value)
              }
            />
          </label>

          <label>
            Period end
            <input
              type="date"
              required
              min={editPeriodStart || undefined}
              value={editPeriodEnd}
              disabled={Boolean(busy)}
              onChange={(event) =>
                setEditPeriodEnd(event.target.value)
              }
            />
          </label>
        </div>

        <div className="vl-form-actions">
          <button
            type="button"
            className="vl-button"
            disabled={Boolean(busy)}
            onClick={() => setEditingDates(false)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="vl-button vl-button-primary"
            disabled={Boolean(busy)}
          >
            {busy === "period" ? "Saving…" : "Save dates"}
          </button>
        </div>
      </form>
    )}
  </div>
)}

                    <p className="vl-table-help">
                      {editable
                        ? "Enter total completed quantities to date. Save each changed row. Previous work is deducted automatically."
                        : "This valuation is read-only."}
                    </p>

                    <div className="vl-table-scroll">
                      <table className="vl-table">
                        <thead>
                          <tr>
                            <th scope="col">Item / Description</th>
                            <th scope="col">Unit</th>
                            <th scope="col">BOQ qty</th>
                            <th scope="col">Rate (LKR)</th>
                            <th scope="col">Previous qty</th>
                            <th scope="col">Completed to date</th>
                            <th scope="col">This period qty</th>
                            <th scope="col">Amount (LKR)</th>
                            {editable && (
                              <th scope="col">Save</th>
                            )}
                          </tr>
                        </thead>

                        <tbody>
                          {(selected.items || []).map((item) => {
                            const changed =
                              String(inputs[item.id] ?? "") !==
                              String(item.cumulative_quantity);

                            return (
                              <tr key={item.id}>
                                <td>
                                  <strong>{item.item_no}</strong>
                                  <span className="vl-description">
                                    {item.description}
                                  </span>
                                </td>
                                <td>{item.unit}</td>
                                <td>
                                  {quantity(item.boq_quantity)}
                                </td>
                                <td>{money(item.rate)}</td>
                                <td>
                                  {quantity(item.previous_quantity)}
                                </td>
                                <td>
                                  {editable ? (
                                    <input
                                      className={
                                        changed
                                          ? "vl-quantity vl-changed"
                                          : "vl-quantity"
                                      }
                                      type="text"
                                      inputMode="decimal"
                                      maxLength={17}
                                      value={inputs[item.id] ?? ""}
                                      aria-label={
                                        `Total completed quantity for item ${item.item_no}`
                                      }
                                      disabled={Boolean(busy)}
                                      onChange={(event) =>
                                        setInputs((current) => ({
                                          ...current,
                                          [item.id]:
                                            event.target.value,
                                        }))
                                      }
                                    />
                                  ) : (
                                    quantity(
                                      item.cumulative_quantity
                                    )
                                  )}
                                </td>
                                <td>
                                  {quantity(item.current_quantity)}
                                </td>
                                <td>{money(item.amount)}</td>
                                {editable && (
                                  <td>
                                    <button
                                      className="vl-save-row"
                                      type="button"
                                      disabled={
                                        !changed || Boolean(busy)
                                      }
                                      onClick={() => saveItem(item)}
                                      aria-label={
                                        `Save item ${item.item_no}`
                                      }
                                    >
                                      <Save size={16} />
                                      {busy === `item-${item.id}`
                                        ? "Saving…"
                                        : "Save"}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <footer className="vl-total-footer">
                      <div>
                        <span>Saved value for this period</span>
                        <strong>
                          {money(selected.total_amount)}
                        </strong>
                        {dirtyItems.length > 0 && (
                          <small>
                            {dirtyItems.length} unsaved row(s)
                          </small>
                        )}
                      </div>

                      {editable && (
                        <button
                          className="vl-button vl-primary"
                          type="button"
                          disabled={
                            Boolean(busy) ||
                            dirtyItems.length > 0 ||
                            Number(selected.total_amount) <= 0
                          }
                          onClick={handlePublish}
                        >
                          <CheckCircle2 size={17} />
                          {busy === "publish"
                            ? "Publishing…"
                            : "Publish valuation"}
                        </button>
                      )}
                    </footer>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}