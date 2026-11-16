import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Wallet,
} from "lucide-react";

import {
  getMyProjects,
  getPaymentAccess,
  getProjectPayments,
  getProjectPaymentSummary,
  recordProjectPayment,
} from "../services/workspaceApi";

import paymentIllustration from "../assets/payment-illustration.png";

import "../styles/PaymentsPage.css";


function money(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value || 0));
}

function today() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateLabel(value) {
  if (!value) return "—";

  const parsed = new Date(
    `${String(value).slice(0, 10)}T00:00:00`
  );

  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function emptyForm() {
  return {
    certificate_id: "",
    payment_date: today(),
    amount: "",
    payment_method: "bank_transfer",
    reference: "",
    notes: "",
  };
}

function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}

function methodLabel(value) {
  return {
    bank_transfer: "Bank transfer",
    cash: "Cash",
    cheque: "Cheque",
  }[value] || value;
}

function paymentStatusLabel(value) {
  return {
    unpaid: "Unpaid",
    partially_paid: "Partially paid",
    paid: "Paid",
  }[value] || value;
}


export default function PaymentsPage({
  workspaceProject = null,
  isActive = true,

}) {
  const embedded = workspaceProject !== null;
  const actionRef = useRef(false);
  const paymentRequestRef = useRef(null);
  const mountedRef = useRef(false);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [projectId, setProjectId] = useState(() =>
  workspaceProject ? String(workspaceProject.id) : ""
);
  const [access, setAccess] = useState(null);
  const [payments, setPayments] = useState([]);
  const [summaries, setSummaries] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isArchived = workspaceProject?.status === "archived";
const canManage = access?.can_manage === true && !isArchived;

  const project = projects.find(
    (item) => String(item.id) === projectId
  );

  const payableCertificates = summaries.filter(
    (item) => Number(item.outstanding_amount) > 0
  );

  const selectedSummary = summaries.find(
    (item) =>
      String(item.certificate_id) === form.certificate_id
  );

  const totals = summaries.reduce(
    (result, item) => ({
      certified: result.certified + Number(item.net_payable),
      paid: result.paid + Number(item.paid_amount),
      outstanding:
        result.outstanding + Number(item.outstanding_amount),
    }),
    {
      certified: 0,
      paid: 0,
      outstanding: 0,
    }
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
    if (!projectId) {
      setAccess(null);
      setPayments([]);
      setSummaries([]);
      setLoadError("");
      setLoading(false);
      return;
    }

    if (!isActive || showForm || busy) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadError("");

    async function loadWorkspace() {
      try {
        const [permissions, records, balances] = await Promise.all([
          getPaymentAccess(projectId),
          getProjectPayments(projectId),
          getProjectPaymentSummary(projectId),
        ]);

        if (cancelled) return;

        if (!Array.isArray(records) || !Array.isArray(balances)) {
          throw new Error("Unexpected payment or certificate balance response.");
        }

        setAccess(permissions);
        setPayments(records);
        setSummaries(balances);
      } catch (err) {
        if (!cancelled) {
          setAccess(null);
          setPayments([]);
          setSummaries([]);
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
  }, [projectId, reload, isActive, showForm, busy]);


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
      !window.confirm("Discard this unsaved payment form?")
    ) {
      return;
    }

    setShowForm(false);
    setForm(emptyForm());
    setError("");
    setSuccess("");
    setProjectId(event.target.value);
  }


  function startPayment(certificateId = "") {
  if (!canManage || actionRef.current) return;

  paymentRequestRef.current = null;

  setForm({
    ...emptyForm(),
    certificate_id: String(certificateId),
  });

  setShowForm(true);
  setError("");
  setSuccess("");
}


  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }


  function cancelForm() {
    if (actionRef.current) return;

    if (window.confirm("Discard this unsaved payment form?")) {
      setShowForm(false);
      setError("");
    }
  }


async function handleSave(event) {
  event.preventDefault();

  if (actionRef.current || !canManage) return;

  const amount = Number(form.amount);

  if (
    !selectedSummary ||
    !form.payment_date ||
    !/^\d+(?:\.\d{1,2})?$/.test(form.amount) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    setError(
      "Select a certificate, date and valid payment amount."
    );
    return;
  }

  if (
    amount > Number(selectedSummary.outstanding_amount)
  ) {
    setError(
      "Payment cannot exceed the outstanding balance."
    );
    return;
  }

  if (
    form.payment_method !== "cash" &&
    !form.reference.trim()
  ) {
    setError(
      "Enter the transaction reference or cheque number."
    );
    return;
  }

  const details = {
    certificate_id: Number(form.certificate_id),
    payment_date: form.payment_date,
    amount: amount.toFixed(2),
    payment_method: form.payment_method,
    reference: form.reference.trim() || null,
    notes: form.notes.trim() || null,
  };

  const fingerprint = JSON.stringify({
    projectId,
    ...details,
  });

  const previousRequest = paymentRequestRef.current;

  if (
    previousRequest &&
    previousRequest.fingerprint !== fingerprint
  ) {
    setError(
      "A previous save was attempted with different details. Retry with the original details, or cancel and check payment history before starting a new payment."
    );
    return;
  }

  if (
    !window.confirm(
      `Record ${money(amount)} for certificate #${selectedSummary.certificate_no}? Confirm that the details are correct.`
    )
  ) {
    return;
  }

  if (!paymentRequestRef.current) {
    paymentRequestRef.current = {
      key: window.crypto.randomUUID(),
      fingerprint,
    };
  }

  const payload = {
    ...details,
    idempotency_key: paymentRequestRef.current.key,
  };

  actionRef.current = true;
  setBusy(true);
  setError("");
  setSuccess("");

  try {
    await recordProjectPayment(projectId, payload);

    if (!mountedRef.current) return;

    paymentRequestRef.current = null;

    setShowForm(false);
    setForm(emptyForm());
    setSuccess("Payment recorded successfully.");
    setReload((value) => value + 1);
  } catch (err) {
    if (mountedRef.current) {
      setError(
        `${messageFrom(err)} If the connection failed, retry with the same details in this form. Before starting a new payment, check payment history.`
      );
    }

    // Keep the same request ID for a retry.
  } finally {
    actionRef.current = false;

    if (mountedRef.current) setBusy(false);
  }
}


  const projectControl = (
    <div
  className="ct-project-control"
  style={embedded ? { display: "none" } : undefined}
>
      <label htmlFor="pm-project">Project</label>

      <select
        id="pm-project"
        value={projectId}
        onChange={changeProject}
        disabled={busy}
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
    <div className={`ct-page ${embedded ? "pm-embedded" : ""}`}>
      <div className="ct-container">
        <header className="ct-heading">
        </header>

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
            <Wallet size={30} aria-hidden="true" />
            <h2>No projects available</h2>
            <p>Create a project or accept a project invitation.</p>
          </div>
        ) : !projectId ? (
          <>
            <section className="ct-welcome">
              <div className="ct-welcome-copy">
                <h2>Every payment.<br />Clearly recorded.</h2>
                <p>
                  Select a project to review certified amounts,
                  recorded payments and remaining balances.
                </p>

                {projectControl}
              </div>

              <img
                className="ct-welcome-image"
                src={paymentIllustration}
                alt=""
                aria-hidden="true"
              />
            </section>

            <div className="ct-steps">
              {[
                ["Choose a project", "Review its published certificates."],
                ["Record payments", "Keep dates, amounts and references together."],
                ["Follow the balance", "See what has been paid and what remains."],
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
                !showForm &&
                canManage && (
                  <button
                    type="button"
                    className="ct-button ct-primary"
                    disabled={payableCertificates.length === 0}
                    onClick={() => startPayment()}
                  >
                    <Plus size={17} aria-hidden="true" />
                    Record payment
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
                Loading payments…
              </div>
            ) : loadError ? (
              <div className="ct-state" role="alert">
                <p>{loadError}</p>
                <button
                  type="button"
                  className="ct-button"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            ) : showForm ? (
              <section className="ct-panel pm-form-panel">
                <button
                  type="button"
                  className="ct-back"
                  onClick={cancelForm}
                  disabled={busy}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Payment overview
                </button>

                <div className="ct-section-heading">
                  <div>
                    <span className="ct-eyebrow">PAYMENT RECORD</span>
                    <h2>Record a payment</h2>
                    <p>{project?.name}</p>
                  </div>
                </div>

                <form onSubmit={handleSave}>
                  <label className="ct-field">
                    Published certificate
                    <select
                      name="certificate_id"
                      value={form.certificate_id}
                      onChange={updateField}
                      disabled={busy}
                      required
                    >
                      <option value="" disabled>
                        Choose a certificate
                      </option>

                      {payableCertificates.map((item) => (
                        <option
                          key={item.certificate_id}
                          value={item.certificate_id}
                        >
                          Certificate #{item.certificate_no}
                          {" — Balance "}
                          {money(item.outstanding_amount)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedSummary && (
                    <div className="ct-work-value">
                      <span>Outstanding balance</span>
                      <strong>
                        {money(selectedSummary.outstanding_amount)}
                      </strong>
                    </div>
                  )}

                  <div className="ct-form-grid">
                    <label className="ct-field">
                      Payment date
                      <input
                        type="date"
                        name="payment_date"
                        value={form.payment_date}
                        onChange={updateField}
                        disabled={busy}
                        required
                      />
                    </label>

                    <label className="ct-field">
                      Amount (LKR)
                      <input
                        type="number"
                        name="amount"
                        min="0.01"
                        max={
                          selectedSummary
                            ? selectedSummary.outstanding_amount
                            : undefined
                        }
                        step="0.01"
                        value={form.amount}
                        onChange={updateField}
                        disabled={busy}
                        required
                      />
                    </label>

                    <label className="ct-field">
                      Payment method
                      <select
                        name="payment_method"
                        value={form.payment_method}
                        onChange={updateField}
                        disabled={busy}
                      >
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </label>

                    <label className="ct-field">
                      {form.payment_method === "cheque"
                        ? "Cheque number"
                        : "Transaction reference"}
                      {form.payment_method === "cash" && " (optional)"}
                      <input
                        type="text"
                        name="reference"
                        value={form.reference}
                        onChange={updateField}
                        maxLength={100}
                        disabled={busy}
                        required={form.payment_method !== "cash"}
                      />
                    </label>
                  </div>

                  <label className="ct-field">
                    Notes (optional)
                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={updateField}
                      maxLength={2000}
                      disabled={busy}
                    />
                  </label>

                  <p className="ct-footnote">
                    Record payments that have been made.
                    This form does not transfer money.
                  </p>

                  <div className="ct-actions">
                    <button
                      type="button"
                      className="ct-button"
                      onClick={cancelForm}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="ct-button ct-primary"
                      disabled={busy}
                    >
                      {busy ? "Saving…" : "Save payment"}
                    </button>
                  </div>
                </form>
              </section>
            ) : (
              <>
                <dl className="ct-summary pm-inline-summary">
                  <div>
                    <dt>Certified net payable</dt>
                    <dd>{money(totals.certified)}</dd>
                  </div>
                  <div>
                    <dt>Recorded payments</dt>
                    <dd>{money(totals.paid)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding balance</dt>
                    <dd>{money(totals.outstanding)}</dd>
                  </div>
                </dl>

                <section className="ct-panel pm-section">
                  <div className="ct-section-heading">
                    <div>
                      <h2>Certificate balances</h2>
                      <p>{project?.name}</p>
                    </div>
                  </div>

                  {summaries.length === 0 ? (
                    <div className="ct-empty">
                      <Wallet size={30} aria-hidden="true" />
                      <h3>No published certificates yet</h3>
                      <p>
                        Publish a certificate before recording its payments.
                      </p>
                    </div>
                  ) : (
                    <div className="ct-table-wrap">
                      <table className="ct-table">
                        <thead>
                          <tr>
                            <th>Certificate</th>
                            <th>Net payable</th>
                            <th>Paid</th>
                            <th>Outstanding</th>
                            <th>Status</th>
                            {canManage && <th>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {summaries.map((item) => (
                            <tr key={item.certificate_id}>
                              <td>#{item.certificate_no}</td>
                              <td>{money(item.net_payable)}</td>
                              <td>{money(item.paid_amount)}</td>
                              <td>
                                <strong>
                                  {money(item.outstanding_amount)}
                                </strong>
                              </td>
                              <td>
                                <span
                                  className={`ct-badge ${
                                    item.payment_status === "paid"
                                      ? "ct-published"
                                      : "ct-draft"
                                  }`}
                                >
                                  {paymentStatusLabel(item.payment_status)}
                                </span>
                              </td>
                              {canManage && (
                                <td>
                                  <button
                                    type="button"
                                    className="ct-button pm-small-button"
                                    disabled={
                                      Number(item.outstanding_amount) <= 0
                                    }
                                    onClick={() =>
                                      startPayment(item.certificate_id)
                                    }
                                  >
                                    Record payment
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="ct-panel pm-section">
                  <div className="ct-section-heading">
                    <div>
                      <h2>Payment history</h2>
                      <p>Recorded transactions for this project.</p>
                    </div>
                  </div>

                  {payments.length === 0 ? (
                    <div className="ct-empty">
                      <h3>No payments recorded</h3>
                      <p>Saved payment records will appear here.</p>
                    </div>
                  ) : (
                    <div className="ct-table-wrap">
                      <table className="ct-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Certificate</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Reference / Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{dateLabel(payment.payment_date)}</td>
                              <td>
                                #
                                {summaries.find(
                                  (item) =>
                                    item.certificate_id ===
                                    payment.certificate_id
                                )?.certificate_no ?? "—"}
                              </td>
                              <td>
                                <strong>{money(payment.amount)}</strong>
                              </td>
                              <td>{methodLabel(payment.payment_method)}</td>
                              <td className="pm-reference-cell">
                                {payment.reference || "—"}
                                {payment.notes && (
                                  <small>{payment.notes}</small>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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