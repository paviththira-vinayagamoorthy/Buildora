
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Plus,
  X,
} from "lucide-react";

import {
  decideProjectVariation,
  getProjectVariations,
  submitProjectVariation,
} from "../services/workspaceApi";

import "../styles/VariationsPage.css";

const emptyForm = {
  title: "",
  reason: "",
  costChange: "",
};

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return `LKR ${Math.abs(amount).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

export default function VariationsPage({
  projectId,
  projectRole,
  projectStatus,
}) {
  const [variations, setVariations] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [drawerMode, setDrawerMode] = useState(null);
  const [selectedVariation, setSelectedVariation] = useState(null);
  const [decisionNote, setDecisionNote] = useState("");

  const drawerRef = useRef(null);
  const actionRef = useRef(false);

  const isArchived = projectStatus === "archived";

  const canSubmit =
    projectRole === "qs" && !isArchived;

  const canDecide =
    (projectRole === "building_owner" ||
      projectRole === "owner") &&
    !isArchived;

  const sortedVariations = [...variations].sort((a, b) => {
    const aTime = new Date(
      a.created_at || a.decided_at || 0
    ).getTime();

    const bTime = new Date(
      b.created_at || b.decided_at || 0
    ).getTime();

    return bTime - aTime;
  });

  const pendingCount = variations.filter(
    (item) => item.status === "pending"
  ).length;

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setVariations([]);

    async function loadVariations() {
      try {
        const records = await getProjectVariations(projectId);

        if (active) {
          setVariations(
            Array.isArray(records) ? records : []
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || "Could not load variations."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (projectId) {
      void loadVariations();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!drawerMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget = drawerRef.current?.querySelector(
      "input, textarea, button"
    );

    focusTarget?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !actionRef.current) {
        closeDrawer();
      }

      if (event.key !== "Tab") return;

      const elements = Array.from(
        drawerRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'
        ) || []
      );

      if (!elements.length) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [drawerMode]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function openCreateDrawer() {
    if (!canSubmit || busy) return;

    setForm(emptyForm);
    setError("");
    setSuccess("");
    setDrawerMode("create");
  }

  function openReviewDrawer(record) {
    if (
      !canDecide ||
      record.status !== "pending" ||
      busy
    ) {
      return;
    }

    setSelectedVariation(record);
    setDecisionNote("");
    setError("");
    setSuccess("");
    setDrawerMode("review");
  }

  function closeDrawer() {
    if (actionRef.current) return;

    if (drawerMode === "create") {
      const hasChanges =
        form.title.trim() ||
        form.reason.trim() ||
        form.costChange !== "";

      if (
        hasChanges &&
        !window.confirm(
          "Discard this unsaved variation?"
        )
      ) {
        return;
      }
    }

    setDrawerMode(null);
    setSelectedVariation(null);
    setDecisionNote("");
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy || loading || !canSubmit) return;

    if (
      !form.title.trim() ||
      !form.reason.trim() ||
      form.costChange === ""
    ) {
      setError("Please complete all required fields.");
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setError("");

    try {
      const created = await submitProjectVariation(
        projectId,
        {
          title: form.title.trim(),
          reason: form.reason.trim(),
          costChange: form.costChange,
        }
      );

      setVariations((previous) => [
        created,
        ...previous,
      ]);

      setForm(emptyForm);
      setDrawerMode(null);
      setSuccess("Variation submitted successfully.");
    } catch (err) {
      setError(
        err.message || "Could not submit the variation."
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  async function handleDecision(status) {
    if (
      busy ||
      !canDecide ||
      !selectedVariation ||
      selectedVariation.status !== "pending"
    ) {
      return;
    }

    if (
      status !== "approved" &&
      status !== "rejected"
    ) {
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setError("");

    try {
      const updated = await decideProjectVariation(
        projectId,
        selectedVariation.id,
        {
          status,
          note: decisionNote.trim() || null,
        }
      );

      setVariations((previous) =>
        previous.map((record) =>
          record.id === updated.id ? updated : record
        )
      );

      setDrawerMode(null);
      setSelectedVariation(null);
      setDecisionNote("");

      setSuccess(
        status === "approved"
          ? "Variation approved successfully."
          : "Variation rejected successfully."
      );
    } catch (err) {
      setError(
        err.message || "Could not save the decision."
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="ct-panel vr-page">
      <div className="vr-heading">
        <div>
          <h2>Variations</h2>
          <p>
            Track changes to project scope and cost.
          </p>
        </div>

        <div className="vr-heading-actions">
          <span className="vr-count">
            {variations.length}{" "}
            {variations.length === 1
              ? "variation"
              : "variations"}
          </span>

          {canSubmit && (
            <button
              type="button"
              className="ct-button ct-primary vr-create-button"
              onClick={openCreateDrawer}
              disabled={loading || busy}
            >
              <Plus size={16} />
              New variation
            </button>
          )}
        </div>
      </div>

      {success && (
        <div
          className="vr-message vr-success"
          role="status"
        >
          <Check size={16} />
          {success}
        </div>
      )}

      {error && !drawerMode && (
        <div
          className="vr-message vr-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && variations.length > 0 && (
        <div className="vr-summary">
          <span>
            <strong>{variations.length}</strong>
            Total variations
          </span>

          <span>
            <strong>{pendingCount}</strong>
            Pending decisions
          </span>
        </div>
      )}

      {loading ? (
        <div className="vr-empty" role="status">
          Loading variations…
        </div>
      ) : variations.length === 0 ? (
        <div className="vr-empty">
          <FileText size={28} />
          <h3>No variations yet</h3>
          <p>
            Project scope and cost changes will
            appear here.
          </p>
        </div>
      ) : (
        <div className="vr-table-wrap">
          <table className="vr-table">
            <thead>
              <tr>
                <th>Variation</th>
                <th>Cost change</th>
                <th>Status</th>
                <th>Decision date</th>
                {canDecide && <th>Action</th>}
              </tr>
            </thead>

            <tbody>
              {sortedVariations.map((record) => {
                const amount = Number(
                  record.cost_change
                );

                return (
                  <tr key={record.id}>
                    <td className="vr-name-cell">
                      <strong>{record.title}</strong>

                      <span className="vr-reason">
                        {record.reason}
                      </span>

                      {record.decision_note && (
                        <span className="vr-decision-note">
                          Decision note:{" "}
                          {record.decision_note}
                        </span>
                      )}
                    </td>

                    <td>
                      <span className="vr-cost">
                        {Number.isFinite(amount) &&
                          (amount < 0 ? (
                            <ArrowDownRight size={15} />
                          ) : amount > 0 ? (
                            <ArrowUpRight size={15} />
                          ) : null)}

                        {Number.isFinite(amount) &&
                          amount < 0
                          ? "−"
                          : Number.isFinite(amount) &&
                              amount > 0
                            ? "+"
                            : ""}

                        {formatCurrency(amount)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`vr-status vr-status-${record.status}`}
                      >
                        <span className="vr-status-dot" />
                        {statusLabel(record.status)}
                      </span>
                    </td>

                    <td className="vr-date">
                      {formatDate(record.decided_at)}
                    </td>

                    {canDecide && (
                      <td>
                        {record.status === "pending" ? (
                          <button
                            type="button"
                            className="vr-review-button"
                            onClick={() =>
                              openReviewDrawer(record)
                            }
                            disabled={busy}
                          >
                            Review
                            <ChevronRight size={15} />
                          </button>
                        ) : (
                          <span className="vr-completed">
                            Completed
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawerMode && (
        <div className="vr-drawer-layer">
          <div
            className="vr-drawer-backdrop"
            onClick={closeDrawer}
          />

          <aside
            ref={drawerRef}
            className="vr-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vr-drawer-title"
          >
            <div className="vr-drawer-header">
              <div>

                <h2 id="vr-drawer-title">
                  {drawerMode === "create"
                    ? "New variation"
                    : "Review variation"}
                </h2>

                <p>
                  {drawerMode === "create"
                    ? "Record a change to project scope."
                    : "Review the proposed change."}
                </p>
              </div>

              <button
                type="button"
                className="vr-close"
                onClick={closeDrawer}
                disabled={busy}
                aria-label="Close drawer"
              >
                <X size={19} />
              </button>
            </div>

            <div className="vr-drawer-body">
              {error && (
                <div
                  className="vr-message vr-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {drawerMode === "create" ? (
                <form onSubmit={handleSubmit}>
                  <label className="vr-field">
                    Variation title
                    <input
                      name="title"
                      value={form.title}
                      onChange={updateField}
                      maxLength={255}
                      placeholder="e.g. Additional excavation"
                      disabled={busy}
                      required
                    />
                  </label>

                  <label className="vr-field">
                    Reason for change
                    <textarea
                      name="reason"
                      value={form.reason}
                      onChange={updateField}
                      maxLength={5000}
                      rows={4}
                      placeholder="Describe why this change is required"
                      disabled={busy}
                      required
                    />
                  </label>

                  <label className="vr-field">
                    Cost change (LKR)
                    <input
                      name="costChange"
                      type="number"
                      step="0.01"
                      value={form.costChange}
                      onChange={updateField}
                      placeholder="0.00"
                      disabled={busy}
                      required
                    />
                    <small>
                      Use a negative amount for a
                      cost reduction.
                    </small>
                  </label>

                  <div className="vr-drawer-actions">
                    <button
                      type="button"
                      className="ct-button"
                      onClick={closeDrawer}
                      disabled={busy}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="ct-button ct-primary vr-submit-button"
                      disabled={busy}
                    >
                      {busy
                        ? "Submitting…"
                        : "Submit variation"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="vr-review-content">
                  <div className="vr-review-details">
                    <h3>
                      {selectedVariation?.title}
                    </h3>

                    <p>
                      {selectedVariation?.reason}
                    </p>

                    <span>
                      Cost change:{" "}
                      <strong>
                        {formatCurrency(
                          selectedVariation?.cost_change
                        )}
                      </strong>
                    </span>
                  </div>

                  <label className="vr-field">
                    Decision note (optional)
                    <textarea
                      value={decisionNote}
                      onChange={(event) =>
                        setDecisionNote(
                          event.target.value
                        )
                      }
                      maxLength={2000}
                      rows={4}
                      placeholder="Add a note about your decision"
                      disabled={busy}
                    />
                  </label>

                  <div className="vr-drawer-actions">
                    <button
                      type="button"
                      className="ct-button"
                      onClick={() =>
                        handleDecision("rejected")
                      }
                      disabled={busy}
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      className="ct-button ct-primary"
                      onClick={() =>
                        handleDecision("approved")
                      }
                      disabled={busy}
                    >
                      {busy
                        ? "Saving…"
                        : "Approve"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
