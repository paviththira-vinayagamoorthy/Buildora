import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/CompanyVerificationPage.css";
import { ArrowLeft, ArrowRight, House, Mail } from "lucide-react";


const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const FIELDS = [
  ["name", "Registered company name", 150, "text"],
  ["registration_number", "Registration number", 100, "text"],
  ["company_email", "Company email", 255, "email"],
  ["company_phone", "Company phone", 30, "tel"],
  ["address", "Company address", 1000, "text"],
  ["contact_person_name", "Representative name", 100, "text"],
  ["contact_person_position", "Representative position", 100, "text"],
];

const STATUS_LABELS = {
  unsubmitted: "Not submitted",
  pending: "Under review",
  approved: "Approved",
  rejected: "Changes required",
};

const STEPS = ["Company details", "Certificate", "Verify email", "Review & submit"];

function formFrom(record) {
  return Object.fromEntries(
    FIELDS.map(([key]) => [key, record?.[key] || ""])
  );
}

function getToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

async function request(path, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
  if (response.status === 401) {
    throw new Error("Session expired. Please sign in again.");
  }

  const data = await response.json().catch(() => null);
  const detail = data?.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : "Unable to complete the request."
    );
  }

  return response;
}

async function jsonRequest(path, options = {}) {
  const response = await request(path, options);
  return response.json();
}

export default function CompanyVerificationPage() {
  const { organizationId } = useParams();

  const [organization, setOrganization] = useState(null);
  const [form, setForm] = useState(() => formFrom(null));
  const [savedForm, setSavedForm] = useState(() => formFrom(null));
  const [documents, setDocuments] = useState([]);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [file, setFile] = useState(null);
  const [declaration, setDeclaration] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [selectedStep, setSelectedStep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);
  const fileRef = useRef(null);

  const validId = /^[1-9]\d*$/.test(organizationId || "");
  const editable =
    organization?.verification_status === "unsubmitted" ||
    organization?.verification_status === "rejected";

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const registrationDocument = documents.find(
    (document) => document.document_type === "company_registration"
  );

  const verified =
    emailStatus?.verified === true &&
    emailStatus.company_email === form.company_email &&
    !dirty;

  const hasSavedDetails = FIELDS.every(([name]) =>
    String(savedForm[name] ?? "").trim()
  );

  const nextRequiredStep = !hasSavedDetails || dirty
    ? 1
    : !registrationDocument || file
      ? 2
      : !verified
        ? 3
        : 4;

  const activeStep = editable
    ? Math.min(selectedStep ?? nextRequiredStep, nextRequiredStep)
    : (selectedStep ?? 4);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      if (!validId) {
        setError("Invalid company link.");
        setLoading(false);
        return;
      }

      try {
        const paths = [
          `/organizations/${organizationId}/verification-details`,
          `/organization-documents/organizations/${organizationId}`,
          `/organization-email/organizations/${organizationId}/status`,
        ];

        const [details, files, email] = await Promise.all(
          paths.map((path) =>
            jsonRequest(path, { signal: controller.signal })
          )
        );

        if (controller.signal.aborted) return;

        setOrganization(details);
        setForm(formFrom(details));
        setSavedForm(formFrom(details));
        setDocuments(files);
        setEmailStatus(email);
        setEmailSent(false);
        setResendUntil(0);
        setSecondsLeft(0);
        setSelectedStep(null);
        setFile(null);
        setDeclaration(false);
        setDetailsSaved(false);
        setSuccess("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load company details.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, [organizationId, validId]);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (!dirty && !file) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () =>
      window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty, file]);

  async function perform(action, callback) {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy(action);
    setError("");
    setSuccess("");

    try {
      await callback();
    } catch (err) {
      setError(err.message || "Unable to complete the request.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setDeclaration(false);
    setDetailsSaved(false);
    setSuccess("");
  }

  async function saveDetails(event) {
    event.preventDefault();
    if (!editable) return;

    await perform("save", async () => {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim()])
      );

      const updated = await jsonRequest(
        `/organizations/${organizationId}/verification-details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      setOrganization(updated);
      setForm(formFrom(updated));
      setSavedForm(formFrom(updated));
      setDeclaration(false);
      setDetailsSaved(true);
      setSelectedStep(2);

      // A changed email must not retain a stale verified badge.
      setEmailStatus((current) =>
        current?.company_email === updated.company_email ? current : null
      );

      setSuccess("Company details saved.");
    });
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (!editable || !file) return;

    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Select a non-empty file up to 10 MB.");
      return;
    }

    if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      setError("Select a PDF, JPG, PNG or WEBP file.");
      return;
    }

    await perform("upload", async () => {
      const body = new FormData();
      body.append("file", file);

      const uploaded = await jsonRequest(
        `/organization-documents/organizations/${organizationId}`,
        { method: "POST", body }
      );

      setDocuments((current) => [uploaded, ...current]);
      setFile(null);
      setDeclaration(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }

      setSuccess("Registration document uploaded.");
    });
  }

  useEffect(() => {
  if (!resendUntil) return;

  const updateCountdown = () => {
    const remaining = Math.max(
      0,
      Math.ceil((resendUntil - Date.now()) / 1000)
    );

    setSecondsLeft(remaining);
  };

  updateCountdown();

  const timer = window.setInterval(updateCountdown, 1000);

  return () => window.clearInterval(timer);
}, [resendUntil]);

  async function sendVerificationEmail() {
  if (dirty) {
    setError("Save your company details before sending the email.");
    return;
  }

  if (resendUntil > Date.now()) return;

  await perform("email", async () => {
    const result = await jsonRequest(
      `/organization-email/organizations/${organizationId}/send`,
      { method: "POST" }
    );

    setEmailStatus(null);
    setEmailSent(true);
    setResendUntil(Date.now() + 60_000);
    setSecondsLeft(60);

    setSuccess("");
  });
}

useEffect(() => {
  if (
    !emailSent ||
    verified ||
    !editable ||
    dirty ||
    activeStep !== 3 ||
    !validId
  ) {
    return;
  }

  let stopped = false;
  let checking = false;

  const controller = new AbortController();

  const checkAutomatically = async () => {
    if (checking || stopped || actionRef.current) return;

    checking = true;

    try {
      const result = await jsonRequest(
        `/organization-email/organizations/${organizationId}/status`,
        { signal: controller.signal }
      );

      if (stopped) return;

      setEmailStatus(result);

      if (
        result.verified === true &&
        result.company_email === form.company_email
      ) {
        setEmailSent(false);
        setSelectedStep(4);
        setSuccess("Company email verified successfully.");
      }
    } catch (err) {
      if (stopped) return;

      if (
        err.message ===
        "Session expired. Please sign in again."
      ) {
        setError(err.message);
        stopped = true;
        window.clearInterval(timer);
      }
      // Temporary network errors are retried on the next interval.
    } finally {
      checking = false;
    }
  };

  const timer = window.setInterval(
    checkAutomatically,
    15000
  );

  return () => {
    stopped = true;
    window.clearInterval(timer);
    controller.abort();
  };
}, [
  emailSent,
  verified,
  editable,
  dirty,
  activeStep,
  validId,
  organizationId,
  form.company_email,
]);

  async function refreshEmailStatus() {
  await perform("check-email", async () => {
    const result = await jsonRequest(
      `/organization-email/organizations/${organizationId}/status`
    );

    setEmailStatus(result);

    if (
      result.verified === true &&
      result.company_email === form.company_email &&
      !dirty
    ) {
      setEmailSent(false);
      setSelectedStep(4);
      setSuccess("Company email verified successfully.");
    } else {
      setSuccess(
        "Email is not verified yet. Open the link in your inbox."
      );
    }
  });
}

  async function submitVerification(event) {
    event.preventDefault();

    if (!editable || dirty || file || !verified || !registrationDocument || !declaration) {
      setError(
        "Save details, upload the document, verify the email and accept the declaration before submitting."
      );
      return;
    }

    if (!window.confirm("Submit this company for Platform Admin review?")) {
      return;
    }

    await perform("submit", async () => {
      const updated = await jsonRequest(
        `/organizations/${organizationId}/submit-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ declaration_accepted: true }),
        }
      );

      setOrganization(updated);
      setDeclaration(false);
      setSuccess("Company submitted. Platform Admin review is pending.");
    });
  }


async function deleteDocument(document) {
  if (!editable || busy) return;

  const confirmed = window.confirm(
    `Are you sure you want to delete "${document.original_filename}"?\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  await perform(`delete-${document.id}`, async () => {
    await request(
      `/organization-documents/${document.id}`,
      { method: "DELETE" }
    );

    setDocuments((current) =>
      current.filter((item) => item.id !== document.id)
    );

    setDeclaration(false);
    setSelectedStep(2);

    setSuccess("Registration certificate deleted successfully.");
  });
}

  async function downloadDocument(document) {
    await perform(`download-${document.id}`, async () => {
      const response = await request(
        `/organization-documents/${document.id}/download`
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");

      anchor.href = url;
      anchor.download = document.original_filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  }

  function confirmNavigation(event) {
    if ((dirty || file) && !window.confirm("Leave without saving your current changes?")) {
      event.preventDefault();
    }
  }

  if (loading) {
    return (
      <main className="company-verification">
        <p role="status">Loading company details…</p>
      </main>
    );
  }

  return (
    <main className="company-verification">
      <div className="cv-container">
<Link
  to="/dashboard"
  onClick={confirmNavigation}
  className="cv-back"
>
  <House size={16} strokeWidth={1.8} aria-hidden="true" />
  <span>Back to Home</span>
</Link>

        <header className="cv-heading">
          <div>
            <p className="cv-eyebrow">COMPANY SETUP</p>
            <h1>Company verification</h1>
            <p>
              Complete your company application before creating new projects
              and inviting members.
            </p>
          </div>

          {organization && (
            <span
  className={`cv-status cv-status-${organization.verification_status}`}
>
              {STATUS_LABELS[organization.verification_status] ||
                organization.verification_status}
            </span>
          )}
        </header>

        {error && (
          <div className="cv-message cv-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="cv-message cv-success" role="status">
            {success}
          </div>
        )}

        {organization && (
          <>
            {organization.review_reason && (
              <section className="cv-panel">
                <h2>Admin review</h2>
                <p className="cv-review">{organization.review_reason}</p>
              </section>
            )}

            {organization.verification_status === "pending" && (
              <div className="cv-message">
                Your application is under review. Company details and documents
                are locked during review.
              </div>
            )}

            {organization.verification_status === "approved" && (
              <div className="cv-message cv-success">
                Your company is approved. Return to the dashboard to create projects.
              </div>
            )}

            <p className="cv-step-count">
              Step {activeStep} of {STEPS.length}
            </p>

            <nav aria-label="Company verification steps">
              <ol className="cv-steps">
                {STEPS.map((label, index) => {
                  const step = index + 1;

                  return (
                    <li key={label}>
                      <button
                        type="button"
                        aria-current={step === activeStep ? "step" : undefined}
                        disabled={Boolean(busy) || (editable && step > nextRequiredStep)}
                        onClick={() => setSelectedStep(step)}
                      >
                        <span aria-hidden="true">
                          {step < nextRequiredStep ? "✓" : step}
                        </span>
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <section className="cv-panel" hidden={activeStep !== 1}>
              <h2>Company details</h2>
              <p>All fields below are required.</p>

              <form onSubmit={saveDetails}>
                <fieldset disabled={!editable || Boolean(busy)}>
                  <div className="cv-grid">
                    {FIELDS.map(([key, label, maxLength, type]) => (
                      <label key={key} className="cv-field">
                        <span>{label}</span>
                        <input
                          name={key}
                          type={type}
                          value={form[key]}
                          onChange={handleChange}
                          maxLength={maxLength}
                          minLength={
                            key === "address"
                              ? 10
                              : key === "company_phone"
                                ? 7
                                : type === "email"
                                  ? undefined
                                  : 2
                          }
                          required
                        />
                      </label>
                    ))}
                  </div>

                  {editable && (
                    <>
                      <button className="cv-button cv-primary" type="submit">
  {busy === "save" ? "Saving…" : "Save & continue"}
  <ArrowRight size={16} aria-hidden="true" />
</button>
                      <p role="status" className="mt-2 text-sm font-medium text-green-700">
                        {detailsSaved ? "Company details saved." : ""}
                      </p>
                    </>
                  )}
                </fieldset>
              </form>

              {dirty && (
                <p className="cv-hint">You have unsaved company details.</p>
              )}
            </section>

<section className="cv-panel cv-certificate" hidden={activeStep !== 2}>
              <h2>Business registration certificate</h2>
              <p>
                Upload a clear PDF or image. Maximum 10 MB.
                Company Admin and Platform Admin can access it.
              </p>

              {editable && (
                <form onSubmit={uploadDocument}>
                  <fieldset disabled={Boolean(busy)}>
                    <label className="cv-field">
                      <span>Registration document</span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        required
                        onChange={(event) => {
                          setFile(event.target.files?.[0] || null);
                          setDeclaration(false);
                        }}
                      />
                    </label>

                    <button className="cv-button" type="submit" disabled={!file}>
                      {busy === "upload" ? "Uploading…" : "Upload document"}
                    </button>
                  </fieldset>
                </form>
              )}

              {documents.length === 0 ? (
                <p>No registration document uploaded yet.</p>
              ) : (
                <ul className="cv-files">
                  {documents.map((document, index) => (
                    <li key={document.id}>
                      <div>
                        <strong>{document.original_filename}</strong>
                        <small>
                          {index === 0 ? "Latest upload · " : ""}
                          {(document.file_size / 1024).toFixed(0)} KB
                        </small>
                      </div>

<div className="cv-document-actions">
  <button
    className="cv-button"
    type="button"
    disabled={Boolean(busy)}
    onClick={() => downloadDocument(document)}
  >
    Download
  </button>

  {editable && (
    <button
      className="cv-button cv-delete-button"
      type="button"
      disabled={Boolean(busy)}
      onClick={() => deleteDocument(document)}
    >
      Delete
    </button>
  )}
</div>
                    </li>
                  ))}
                </ul>
              )}

              {editable && (
                <button
                  type="button"
                  className="cv-button cv-primary"
                  disabled={Boolean(busy) || nextRequiredStep < 3}
                  onClick={() => setSelectedStep(3)}
                >
                  Continue to email verification
                </button>
              )}
            </section>


<section
  className="cv-panel cv-email-panel"
  hidden={activeStep !== 3}
>
  <div className="cv-email-heading">
    <h2>Verify company email</h2>

    <span
      className={`cv-email-badge ${
        verified ? "is-verified" : "is-pending"
      }`}
    >
      <span aria-hidden="true">
        {verified ? "✓" : "!"}
      </span>
      {verified ? "Verified" : "Verification required"}
    </span>
  </div>

{emailSent && !verified && (
  <div className="cv-email-sent-alert" role="status">
    <span aria-hidden="true">✓</span>
    <span>
      Verification link sent to your email. Please check your inbox.
    </span>
  </div>
)}
  <div className="cv-email-identity">
    <span className="cv-email-icon" aria-hidden="true">
      <Mail size={20} strokeWidth={1.8} />
    </span>

    <div>
      <strong>
        {organization.company_email ||
          "Company email not provided"}
      </strong>

      <p>
        We'll send a verification link to this email address.
      </p>
    </div>
  </div>

  <div className="cv-email-verification-actions">
    {editable && (
<button
  type="button"
  className="cv-button cv-primary"
  disabled={
    Boolean(busy) ||
    dirty ||
    !organization.company_email ||
    verified ||
    secondsLeft > 0
  }
  onClick={sendVerificationEmail}
>
  {busy === "email"
    ? "Sending…"
    : emailSent
      ? secondsLeft > 0
        ? `Resend in ${secondsLeft}s`
        : "Resend Email"
      : "Send verification email"}

  <ArrowRight size={16} aria-hidden="true" />
</button>
    )}

    <div className="cv-email-check">
      <p className="cv-hint">
        Open the verification link in your inbox, then
        return here to confirm your email status.
      </p>

      <button
        type="button"
        className="cv-button cv-email-check-button"
        disabled={Boolean(busy) || dirty}
        onClick={refreshEmailStatus}
      >
        {busy === "check-email"
          ? "Checking…"
          : "Check email status"}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  </div>

  <div className="cv-email-footer">
    <button
      type="button"
      className="cv-button cv-email-back"
      disabled={Boolean(busy)}
      onClick={() => setSelectedStep(2)}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back
    </button>

    {editable && (
      <div className="cv-email-next">
        <button
          type="button"
          className="cv-button cv-primary"
          disabled={
  Boolean(busy) ||
  !editable ||
  !verified ||
  nextRequiredStep < 4
}
          onClick={() => setSelectedStep(4)}
        >
          Review application
          <ArrowRight size={16} aria-hidden="true" />
        </button>

        {nextRequiredStep < 4 && (
          <span className="cv-email-next-hint">
            Verify your email to continue
          </span>
        )}
      </div>
    )}
  </div>
</section>


            <section className="cv-panel" hidden={activeStep !== 4}>
              <h2>Review application</h2>

              <dl className="cv-review-grid">
                {FIELDS.map(([name, label]) => (
                  <div key={name}>
                    <dt>{label}</dt>
                    <dd>{savedForm[name] || "Not provided"}</dd>
                  </div>
                ))}

                <div>
                  <dt>Registration certificate</dt>
                  <dd>{registrationDocument?.original_filename ?? "Not uploaded"}</dd>
                </div>

                <div>
                  <dt>Company email status</dt>
                  <dd>{verified ? "Verified" : "Not verified"}</dd>
                </div>
              </dl>

              {editable && (
                <form onSubmit={submitVerification}>
                  <label className="cv-declaration">
                    <input
                      type="checkbox"
                      checked={declaration}
                      disabled={Boolean(busy)}
                      required
                      onChange={(event) => setDeclaration(event.target.checked)}
                    />
                    <span>
                      I am authorized to represent this company and confirm that
                      the details and documents submitted are accurate.
                    </span>
                  </label>

                  <p className="cv-hint">
                    Submission does not automatically approve your company.
                    A Platform Admin will review it.
                  </p>

                  <button
                    className="cv-button cv-primary"
                    type="submit"
                    disabled={
                      Boolean(busy) ||
                      dirty ||
                      Boolean(file) ||
                      !verified ||
                      !registrationDocument ||
                      !declaration
                    }
                  >
                    {busy === "submit" ? "Submitting…" : "Submit for review"}
                  </button>
                </form>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}