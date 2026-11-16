import {
  useEffect,
  useRef,
  useState,
} from "react";

import { Link, useNavigate } from "react-router-dom";

import {
  getPlatformAdminAccount,
  updatePlatformAdminProfile,
  getAdminCompanies,
  getAdminVerificationQueue,
  getAdminCompanyDetails,
  getAdminCompanyDocuments,
  getAdminCompanyReviews,
  downloadCompanyVerificationDocument,
  reviewAdminCompany,
  getAdminSubscriptionPlans,
  getAdminOrganizationSubscriptions,
  getAdminWeeklySignups,
  getAdminDashboardSummary,
  saveAdminSubscriptionPlan,
} from "../services/platformAdminApi";

import {
  Building2,
  BarChart3,
  ChevronDown,
  CreditCard,
  LogOut,
  Tags,
  UsersRound,
} from "lucide-react";

import logo from "../assets/buildora-logo.png";

import "../styles/PlatformAdminPage.css";

const PAGE_SIZE = 25;

const STATUS_LABELS = {
  unsubmitted: "Not submitted",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

function formatDate(value) {
  if (!value) return "—";

  const raw = String(value);

  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? `${raw}Z`
      : raw;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function CompanyDetails({
  organizationId,
  onReviewed,
}) {
  const [company, setCompany] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [reason, setReason] = useState("");
  const reviewDialogRef = useRef(null);
const [reviewDecision, setReviewDecision] = useState(null);
  const [busy, setBusy] = useState("");

  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyMore, setHistoryMore] = useState(false);

  const actionRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const options = {
          signal: controller.signal,
        };

        const [details, files, history] = await Promise.all([
          getAdminCompanyDetails(organizationId, options),
          getAdminCompanyDocuments(organizationId, options),
          getAdminCompanyReviews(organizationId, options),
        ]);

        if (controller.signal.aborted) return;

        setCompany(details);
        setDocuments(files);
        setReviews(history);
        setHistoryMore(history.length === PAGE_SIZE);
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

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [organizationId]);

  async function downloadDocument(document) {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy(`download-${document.id}`);
    setError("");

    try {
      await downloadCompanyVerificationDocument(
        document.id,
        document.original_filename
      );
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Unable to download document.");
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  async function loadMoreHistory() {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy("history");
    setError("");

    try {
      const nextOffset = historyOffset + PAGE_SIZE;

      const history = await getAdminCompanyReviews(
        organizationId,
        {
          offset: nextOffset,
          limit: PAGE_SIZE,
        }
      );

      if (!mountedRef.current) return;

      setReviews((current) => {
        const records = new Map(
          [...current, ...history].map((item) => [
            item.id,
            item,
          ])
        );

        return [...records.values()];
      });

      setHistoryOffset(nextOffset);
      setHistoryMore(history.length === PAGE_SIZE);
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Unable to load review history.");
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  async function handleReview(decision, confirmed = false) {
    if (
      actionRef.current ||
      company?.verification_status !== "pending"
    ) {
      return;
    }

    const cleanReason = reason.trim();

    if (
      cleanReason.length < 5 ||
      cleanReason.length > 2000
    ) {
      setError(
        "Enter a review reason containing 5 to 2000 characters."
      );
      return;
    }

if (!confirmed) {
  setReviewDecision(decision);
  reviewDialogRef.current?.showModal();
  return;
}

reviewDialogRef.current?.close();

    actionRef.current = true;
    setBusy(decision);
    setError("");
    setSuccess("");

    try {
      const updated = await reviewAdminCompany(
        organizationId,
        {
          decision,
          reason: cleanReason,
        }
      );

      if (!mountedRef.current) return;

      setCompany(updated);
      setReason("");

      setSuccess(
        decision === "approved"
          ? "Company approved successfully."
          : "Company rejected. The company can correct its application and resubmit."
      );

      onReviewed(updated);

      // The decision has already been saved.
      // Refreshing history must not be treated as a failed decision.
      try {
        const history = await getAdminCompanyReviews(
          organizationId
        );

        if (!mountedRef.current) return;

        setReviews(history);
        setHistoryOffset(0);
        setHistoryMore(history.length === PAGE_SIZE);
      } catch {
        if (mountedRef.current) {
          setError(
            "The decision was saved, but history could not be refreshed. Reopen the company to view it."
          );
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          `${err.message || "Unable to save review."} If the connection failed, reopen the company to check its status before retrying.`
        );
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy("");
    }
  }

  if (loading) {
    return (
      <section className="pa-panel" role="status">
        Loading company details…
      </section>
    );
  }

  if (!company) {
    return (
      <section className="pa-panel">
        <p className="pa-message pa-error" role="alert">
          {error || "Company details unavailable."}
        </p>
      </section>
    );
  }

  const details = [
    ["Registration number", company.registration_number],
    ["Company email", company.company_email],
    ["Company phone", company.company_phone],
    ["Address", company.address],
    ["Representative", company.contact_person_name],
    ["Position", company.contact_person_position],
    ["Submitted", formatDate(company.submitted_at)],
    ["Declaration accepted", formatDate(company.declaration_accepted_at)],
  ];

  return (
    <section className="pa-panel">
      <header className="pa-section-heading">
        <div>
          <p className="pa-eyebrow">COMPANY APPLICATION</p>
          <h2>{company.name}</h2>
        </div>

        <span className="pa-badge">
          {STATUS_LABELS[company.verification_status] ||
            company.verification_status}
        </span>
      </header>

      {error && (
        <div className="pa-message pa-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="pa-message pa-success" role="status">
          {success}
        </div>
      )}

      <dl className="pa-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not provided"}</dd>
          </div>
        ))}
      </dl>

      <div className="pa-divider" />

      <h3>Registration documents</h3>

      <p className="pa-muted">
        Compare the document against the submitted company
        details. Upload validation does not confirm authenticity.
      </p>

      {documents.length === 0 ? (
        <p className="pa-muted">No documents uploaded.</p>
      ) : (
        <ul className="pa-document-list">
          {documents.map((document, index) => (
            <li key={document.id}>
              <div>
                <strong>{document.original_filename}</strong>

                <small>
                  {index === 0 ? "Latest upload · " : ""}
                  {(document.file_size / 1024).toFixed(0)} KB
                  {" · "}
                  {formatDate(document.created_at)}
                </small>
              </div>

              <button
                type="button"
                className="pa-button"
                disabled={Boolean(busy)}
                onClick={() => downloadDocument(document)}
              >
                {busy === `download-${document.id}`
                  ? "Downloading…"
                  : "Download"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {company.verification_status === "pending" && (
        <>
          <div className="pa-divider" />

          <h3>Review decision</h3>
          <dialog
  ref={reviewDialogRef}
  className="pa-signout-dialog pa-review-dialog"
  aria-labelledby="pa-review-dialog-title"
  aria-describedby="pa-review-dialog-description"
  onClose={() => setReviewDecision(null)}
>
  <h2 id="pa-review-dialog-title">
    {reviewDecision === "approved" ? "Approve" : "Reject"} {company.name}?
  </h2>

  <p id="pa-review-dialog-description">
    {reviewDecision === "approved"
      ? "Confirm that you reviewed the company details and registration document."
      : "The reason below will be recorded with the rejection."}
  </p>

  <blockquote className="pa-review-confirm-reason">
    {reason.trim()}
  </blockquote>

  <div className="pa-signout-actions">
    <button
      type="button"
      className="pa-button"
      autoFocus
      onClick={() => reviewDialogRef.current?.close()}
    >
      Cancel
    </button>

    <button
      type="button"
      className={`pa-button ${
        reviewDecision === "approved"
          ? "pa-review-confirm-approve"
          : "pa-signout-confirm"
      }`}
      disabled={!reviewDecision || Boolean(busy)}
      onClick={() => handleReview(reviewDecision, true)}
    >
      {reviewDecision === "approved" ? "Approve company" : "Reject company"}
    </button>
  </div>
</dialog>

          <label className="pa-field">
            <span>Review reason — required</span>

            <textarea
              rows={4}
              value={reason}
              disabled={Boolean(busy)}
              maxLength={2000}
              placeholder="Record what you checked, or explain what needs to be corrected."
              onChange={(event) =>
                setReason(event.target.value)
              }
            />
          </label>

          <p className="pa-muted">
            Approval requires verified company email and a
            registration document. The backend rechecks these
            requirements. You cannot review a company you created
            or belong to.
          </p>

          <div className="pa-actions">
            <button
              type="button"
              className="pa-button pa-reject"
              disabled={Boolean(busy)}
              onClick={() => handleReview("rejected")}
            >
              {busy === "rejected"
                ? "Rejecting…"
                : "Reject with reason"}
            </button>

            <button
              type="button"
              className="pa-button pa-primary"
              disabled={Boolean(busy)}
              onClick={() => handleReview("approved")}
            >
              {busy === "approved"
                ? "Approving…"
                : "Approve company"}
            </button>
          </div>
        </>
      )}

      {company.review_reason && (
        <div className="pa-review-note">
          <h3>Latest decision reason</h3>
          <p>{company.review_reason}</p>
        </div>
      )}

      <div className="pa-divider" />

      <h3>Review history</h3>

      {reviews.length === 0 ? (
        <p className="pa-muted">No review decisions recorded.</p>
      ) : (
        <ol className="pa-history">
          {reviews.map((review) => (
            <li key={review.id}>
              <div className="pa-section-heading">
                <strong>
                  {STATUS_LABELS[review.decision] ||
                    review.decision}
                </strong>

                <small>{formatDate(review.reviewed_at)}</small>
              </div>

              <p>{review.reason}</p>

              <small>
                Reviewer user #{review.reviewed_by}
                {" · "}
                Application submitted {formatDate(review.submitted_at)}
              </small>
            </li>
          ))}
        </ol>
      )}

      {historyMore && (
        <button
          type="button"
          className="pa-button"
          disabled={Boolean(busy)}
          onClick={loadMoreHistory}
        >
          {busy === "history"
            ? "Loading…"
            : "Load older reviews"}
        </button>
      )}
    </section>
  );
}

function VerificationSummary({ filter, onFilterChange, reload }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadReport() {
      const counts = {
        unsubmitted: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      let total = 0;

      try {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const companies = await getAdminCompanies({
            status: "all",
            offset,
            limit: PAGE_SIZE,
            signal: controller.signal,
          });

          if (controller.signal.aborted) return;

          total += companies.length;

          for (const company of companies) {
            const status = company.verification_status;
            if (Object.hasOwn(counts, status)) {
              counts[status] += 1;
            }
          }

          if (companies.length < PAGE_SIZE) break;
        }

        setReport({ total, counts });
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load the verification report.");
        }
      }
    }

        loadReport();
    return () => controller.abort();
}, [reload]);

    return (
    <div className="pa-verification-summary" role="group" aria-label="Verification status counts">
      {[
        ["all", "Total companies", report?.total],
        ["pending", "Pending review", report?.counts.pending],
        ["approved", "Approved", report?.counts.approved],
        ["rejected", "Rejected", report?.counts.rejected],
        ["unsubmitted", "Not submitted", report?.counts.unsubmitted],
      ].map(([status, label, count]) => (
        <button
          key={status}
          type="button"
          aria-pressed={filter === status}
          onClick={() => onFilterChange(status)}
        >
          <span>{label}</span>
          <strong>{count ?? "—"}</strong>
        </button>
      ))}

      {error && <p role="alert">Unable to load verification counts.</p>}
    </div>
  );
}

const ADMIN_USER_ROLE_LABELS = {
  platform_admin: "Platform Admin",
  organization_admin: "Organization Admin",
  org_admin: "Organization Admin",
  qs: "Quantity Surveyor (QS)",
  owner: "Building Owner",
  building_owner: "Building Owner",
  staff: "Staff",
};

function getAdminUserRoleLabel(user) {
  const roles = new Set(user.membership_roles ?? []);

  if (user.system_role && user.system_role !== "user") {
    roles.add(user.system_role);
  }

  if (roles.size === 0) return "No assigned role";

  const labels = [...roles].map(
    (role) => ADMIN_USER_ROLE_LABELS[role] ?? role.replace(/_/g, " ")
  );

  return [...new Set(labels)].join(" · ");
}

function PlatformAdminUsers({ initialFilter = "all" }) {
  const [users, setUsers] = useState([]);
  const [offset, setOffset] = useState(0);
  const [userFilter, setUserFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setLoading(true);
      setError("");

      try {
        const token =
          localStorage.getItem("buildora_access_token") ||
          sessionStorage.getItem("buildora_access_token");

        if (!token) {
          throw new Error("Your session expired. Please sign in again.");
        }

        const apiBase = (
          import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
        ).replace(/\/+$/, "");

        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(PAGE_SIZE + 1),
          user_filter: userFilter,
        });

        const response = await fetch(`${apiBase}/platform-admin/users?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 401) {
  window.dispatchEvent(new Event("buildora:admin-session-expired"));
  return;
}
        if (!response.ok) {
          throw new Error(`Unable to load users (${response.status}).`);
        }

        const result = await response.json();
        if (!controller.signal.aborted) setUsers(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load users.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadUsers();
    return () => controller.abort();
  }, [offset, userFilter]);

  return (
    <>
      <section className="pa-panel pa-users-panel" aria-labelledby="pa-users-title">
<header className="pa-users-heading">
  <h1 id="pa-users-title">Users</h1>
</header>

  <div className="pa-users-filters" role="group" aria-label="Filter users">
    {[
      { value: "all", label: "All users" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "platform_admin", label: "Platform admins" },
    ].map(({ value, label }) => (
      <button
        key={value}
        type="button"
        aria-pressed={userFilter === value}
        onClick={() => {
          setOffset(0);
          setUserFilter(value);
        }}
      >
        {label}
      </button>
    ))}
  </div>
        {loading ? (
          <p role="status">Loading users…</p>
        ) : error ? (
          <p className="pa-message pa-error" role="alert">{error}</p>
        ) : users.length === 0 ? (
          <p>No users found on this page.</p>
        ) : (
          <div
  className="pa-users-table-scroll"
  role="region"
  aria-label="Registered users table"
  tabIndex={0}
>
  <table className="pa-users-table">
    <thead>
      <tr>
        <th scope="col">User</th>
        <th scope="col">Role</th>
        <th scope="col">Account type</th>
        <th scope="col">Status</th>
      </tr>
    </thead>

    <tbody>
      {users.slice(0, PAGE_SIZE).map((user) => {
        const name = user.full_name?.trim() || "Unnamed user";
        const initials = name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0].toUpperCase())
          .join("");

        const accountType =
          user.system_role === "platform_admin"
            ? "Platform Admin"
            : user.system_role === "user"
              ? "User"
              : user.system_role || "—";

        return (
          <tr key={user.id}>
            <th scope="row">
              <span className="pa-users-identity">
                <span className="pa-users-avatar" aria-hidden="true">
                  {user.photo_data ? (
                    <img src={user.photo_data} alt="" />
                  ) : (
                    initials
                  )}
                </span>

                <strong>{name}</strong>
              </span>
            </th>

            <td>{getAdminUserRoleLabel(user)}</td>
            <td>{accountType}</td>
            <td>
              <span
                className={`pa-badge pa-user-status ${
                  user.is_active ? "is-active" : "is-inactive"
                }`}
              >
                {user.is_active ? "Active" : "Inactive"}
              </span>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
        )}

        <div className="pa-pagination">
          <button
            type="button"
            className="pa-button"
            disabled={loading || offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          >
            Previous
          </button>

          <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>

          <button
            type="button"
            className="pa-button"
            disabled={loading || Boolean(error) || users.length <= PAGE_SIZE}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
function PlatformAdminSubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

const [editingPlan, setEditingPlan] = useState(null);
const [saving, setSaving] = useState(false);
const [saveError, setSaveError] = useState("");

function openPlanEditor(plan) {
  setSaveError("");
  setEditingPlan(plan);
}

async function handleSavePlan(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const code = String(form.get("code")).trim().toLowerCase();
  const price = String(form.get("price")).trim();
  const projectLimit = String(form.get("project_limit")).trim();

  if (!editingPlan.code && plans.some((plan) => plan.code === code)) {
    setSaveError("This plan code already exists. Use Edit on that plan.");
    return;
  }

  setSaveError("");
  setSaving(true);

  try {
    const savedPlan = await saveAdminSubscriptionPlan(code, {
      name: String(form.get("name")).trim(),
      description: String(form.get("description")).trim() || null,
      price: price || null,
      currency: String(form.get("currency")).trim().toUpperCase() || null,
      billing_interval: form.get("billing_interval") || null,
      project_limit: projectLimit ? Number(projectLimit) : null,
      features: String(form.get("features"))
        .split("\n")
        .map((feature) => feature.trim())
        .filter(Boolean),
      is_published: form.has("is_published"),
    });

    setPlans((current) =>
      [...current.filter((plan) => plan.code !== savedPlan.code), savedPlan]
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingPlan(null);
  } catch (err) {
    setSaveError(err.message || "Unable to save the subscription plan.");
  } finally {
    setSaving(false);
  }
}

  useEffect(() => {
    const controller = new AbortController();

    getAdminSubscriptionPlans({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPlans(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="pa-panel" aria-labelledby="pa-subscription-title">
<header className="pa-section-heading pa-plans-heading">
  <h1 id="pa-subscription-title">Subscription plans</h1>

  <button
    type="button"
    className="pa-button"
    disabled={loading || Boolean(error) || Boolean(editingPlan)}
    onClick={() => openPlanEditor({})}
  >
    New plan
  </button>
</header>
      {editingPlan && (
  <form
    key={editingPlan.code || "new-plan"}
    className="pa-panel pa-plan-editor"
    onSubmit={handleSavePlan}
  >
    <h2>{editingPlan.code ? "Edit plan" : "New plan"}</h2>

    <label className="pa-field">
      <span>Plan code</span>
      <input
        name="code"
        defaultValue={editingPlan.code ?? ""}
        placeholder="free"
        pattern="[a-z0-9][a-z0-9_-]{0,49}"
        readOnly={Boolean(editingPlan.code)}
        required
      />
    </label>

    <label className="pa-field">
      <span>Plan name</span>
      <input name="name" defaultValue={editingPlan.name ?? ""} maxLength={100} required />
    </label>

    <label className="pa-field">
      <span>Description</span>
      <textarea
        name="description"
        defaultValue={editingPlan.description ?? ""}
        maxLength={500}
      />
    </label>

    <label className="pa-field">
      <span>Price</span>
      <input
        name="price"
        type="number"
        min="0"
        max="9999999999.99"
        step="0.01"
        defaultValue={editingPlan.price ?? ""}
      />
    </label>

    <label className="pa-field">
      <span>Currency</span>
      <input name="currency" maxLength={3} placeholder="LKR" defaultValue={editingPlan.currency ?? ""} />
    </label>

    <label className="pa-field">
      <span>Billing period</span>
      <select name="billing_interval" defaultValue={editingPlan.billing_interval ?? ""}>
        <option value="">Select later</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </label>

    <label className="pa-field">
      <span>Project limit</span>
      <input
        name="project_limit"
        type="number"
        min="1"
        max="4294967295"
        step="1"
        defaultValue={editingPlan.project_limit ?? ""}
      />
    </label>

    <label className="pa-field">
      <span>Features, one per line</span>
      <textarea name="features" defaultValue={editingPlan.features?.join("\n") ?? ""} />
    </label>

    <label>
      <input
        name="is_published"
        type="checkbox"
        defaultChecked={editingPlan.is_published ?? false}
      />{" "}
      Publish plan
    </label>

    {saveError && <p className="pa-message pa-error" role="alert">{saveError}</p>}

    <div className="pa-actions">
      <button
        type="button"
        className="pa-button"
        disabled={saving}
        onClick={() => setEditingPlan(null)}
      >
        Cancel
      </button>
      <button type="submit" className="pa-button pa-primary" disabled={saving}>
        {saving ? "Saving…" : "Save plan"}
      </button>
    </div>
  </form>
)}

      {loading ? (
        <p role="status">Loading plans…</p>
      ) : error ? (
        <p className="pa-message pa-error" role="alert">{error}</p>
      ) : plans.length === 0 ? (
        <p>No subscription plans yet.</p>
      ) : (
        <ul className="pa-document-list">
          {plans.map((plan) => (
            <li key={plan.code}>
              <div>
                <strong>{plan.name}</strong>
                <small>
                  {plan.price === null
                    ? "Price not set"
                    : [plan.currency, plan.price, plan.billing_interval]
                        .filter(Boolean)
                        .join(" · ")}
                </small>
                <small>
                  {plan.project_limit === null
                    ? "Project limit not set"
                    : `Project limit: ${plan.project_limit}`}
                </small>
              </div>
              <span className="pa-badge">
                {plan.is_published ? "Published" : "Draft"}
              </span>
              <button
  type="button"
  className="pa-button"
  disabled={Boolean(editingPlan)}
  onClick={() => openPlanEditor(plan)}
>
  Edit
</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function PlatformAdminOrganizationSubscriptions() {
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getAdminOrganizationSubscriptions({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSubscriptions(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="pa-panel pa-users-panel" aria-labelledby="pa-org-subscriptions-title">
      <header className="pa-section-heading pa-plans-heading">
        <h1 id="pa-org-subscriptions-title">Organization subscriptions</h1>
      </header>
      {subscriptions && !error && (
  <dl className="pa-subscription-summary">
    <div>
      <dt>Organizations</dt>
      <dd>{subscriptions.length}</dd>
    </div>

    <div>
      <dt>Plans assigned</dt>
      <dd>{subscriptions.filter((item) => item.plan != null).length}</dd>
    </div>

    <div>
      <dt>Setup pending</dt>
      <dd>
        {subscriptions.filter((item) => item.status === "setup_pending").length}
      </dd>
    </div>
  </dl>
)}

      {error ? (
        <p className="pa-message pa-error" role="alert">{error}</p>
      ) : subscriptions === null ? (
        <p role="status">Loading organization subscriptions…</p>
      ) : subscriptions.length === 0 ? (
        <p>No organizations yet.</p>
      ) : (
        <div
          className="pa-users-table-scroll"
          role="region"
          aria-label="Organization subscriptions table"
          tabIndex={0}
        >
          <table className="pa-users-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Assigned plan</th>
                <th scope="col">Subscription status</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.organization_id}>
                  <th scope="row">{subscription.organization_name}</th>
                  <td>{subscription.plan ?? "Not configured"}</td>
                  <td>
                    <span className="pa-badge">
                      {subscription.status === "setup_pending"
                        ? "Setup pending"
                        : subscription.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PlatformAdminWeeklySignups({ onNavigate }) {
  const [weeks, setWeeks] = useState(null);
  const [summary, setSummary] = useState(null);
  const [signupError, setSignupError] = useState("");
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    getAdminWeeklySignups({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setWeeks(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setSignupError(
            err.message || "Unable to load signup reports."
          );
        }
      });

    getAdminDashboardSummary({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSummary(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setSummaryError(
            err.message || "Unable to load dashboard summary."
          );
        }
      });

    return () => controller.abort();
  }, []);

  const navigateTo = (page, filter) => {
    if (typeof onNavigate === "function") {
      onNavigate(page, filter);
    }
  };

  const number = (value) => Number(value ?? 0) || 0;
  const format = (value) => number(value).toLocaleString("en-US");

  const organizations = summary?.organizations;
  const projects = summary?.projects;
  const users = summary?.users;
  const subscriptions = summary?.subscriptions;

  const cards = summary
    ? [
        {
          label: "Total Organizations",
          value: organizations?.total,
          detail: `${format(organizations?.approved)} verified`,
          icon: Building2,
          page: "organizations",
          filter: "all",
        },
        {
          label: "Total Users",
          value: users?.total,
          detail: "Registered platform users",
          icon: UsersRound,
          page: "users",
        },
        {
          label: "Active Projects",
          value: projects?.active,
          detail: `${format(projects?.total)} total projects`,
          icon: BarChart3,
          page: "projects-chart",
        },
        {
          label: "Pending Verifications",
          value: organizations?.pending,
          detail: "Awaiting company review",
          icon: Building2,
          page: "organizations",
          filter: "pending",
        },
        {
          label: "Active Users",
          value: users?.active,
          detail: `${format(users?.inactive)} inactive users`,
          icon: UsersRound,
          page: "users",
          filter: "active",
        },
        {
          label: "Assigned Subscriptions",
          value: subscriptions?.total,
          detail: "Organizations with subscriptions",
          icon: CreditCard,
          page: "organization-subscriptions",
        },
      ]
    : [];

  const statusColors = {
    approved: "#79516F",
    pending: "#C58B78",
    rejected: "#AD6670",
    unsubmitted: "#C9BCCB",
  };

  const statusLabels = {
    approved: "Approved",
    pending: "Pending review",
    rejected: "Rejected",
    unsubmitted: "Not submitted",
  };

  const rawStatuses = organizations?.by_status;

  const verificationSegments =
    rawStatuses &&
    typeof rawStatuses === "object" &&
    !Array.isArray(rawStatuses)
      ? Object.entries(rawStatuses).map(([status, count]) => ({
          key: status,
          label:
            statusLabels[status] ||
            status.replace(/_/g, " "),
          value: number(count),
          color: statusColors[status] || "#BDB2C4",
        }))
      : [
          {
            key: "approved",
            label: "Approved",
            value: number(organizations?.approved),
            color: statusColors.approved,
          },
          {
            key: "pending",
            label: "Pending review",
            value: number(organizations?.pending),
            color: statusColors.pending,
          },
          {
            key: "other",
            label: "Other statuses",
            value: Math.max(
              0,
              number(organizations?.total) -
                number(organizations?.approved) -
                number(organizations?.pending)
            ),
            color: "#C9BCCB",
          },
        ];

  const totalOrganizations = number(organizations?.total);
  const totalProjects = number(projects?.total);
  const activeProjects = number(projects?.active);

  const projectSegments = [
    {
      key: "active",
      label: "Active",
      value: activeProjects,
      color: "#79516F",
    },
    {
      key: "other",
      label: "Other",
      value: Math.max(0, totalProjects - activeProjects),
      color: "#C9BCCB",
    },
  ];

  const signupWeeks = weeks ?? [];
  const totalSignups = signupWeeks.reduce(
    (sum, week) => sum + number(week.count),
    0
  );
  const thisWeek = number(signupWeeks.at(-1)?.count);
  const lastWeek = number(signupWeeks.at(-2)?.count);

  const highestCount = Math.max(
    0,
    ...signupWeeks.map((week) => number(week.count))
  );

  const chartStep = Math.max(1, Math.ceil(highestCount / 4));
  const chartMax = chartStep * 4;

  const weekFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  const handleKpiClick = (card) => {
    if (card.page === "projects-chart") {
      document
        .getElementById("pa-project-distribution")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      return;
    }

    navigateTo(card.page, card.filter);
  };

  return (
    <section
      className="pa-signup-report pa-unified-dashboard"
      aria-label="Platform dashboard"
    >
      {/* PLATFORM OVERVIEW */}

      <section
        className="pa-dashboard-overview"
        aria-labelledby="pa-overview-title"
      >
        <div className="pa-dashboard-section-heading">
          <h2 id="pa-overview-title">Platform overview</h2>
          <span>Live platform statistics</span>
        </div>

        {summaryError && (
          <p className="pa-message pa-error" role="alert">
            {summaryError}
          </p>
        )}

        {!summary && !summaryError && (
          <p role="status">Loading platform statistics…</p>
        )}

        {summary && (
          <div className="pa-dashboard-kpi-grid">
            {cards.map((card) => {
              const Icon = card.icon;

              return (
                <button
                  key={card.label}
                  type="button"
                  className="pa-dashboard-kpi pa-dashboard-kpi-action"
                  onClick={() => handleKpiClick(card)}
                >
                  <div className="pa-kpi-top">
                    <span className="pa-dashboard-kpi-label">
                      {card.label}
                    </span>

                    <span className="pa-kpi-icon">
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                  </div>

                  <strong className="pa-dashboard-kpi-value">
                    {format(card.value)}
                  </strong>

                  <span className="pa-dashboard-kpi-detail">
                    {card.detail}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* VERIFICATION + PROJECT DISTRIBUTION */}

      {summary && (
        <div
          id="pa-project-distribution"
          className="pa-dashboard-analytics-grid"
        >
          <section className="pa-verification-card pa-unified-card">
            <div className="pa-verification-heading">
              <div>
                <h2>Company verification</h2>
                <p>Organization verification status breakdown</p>
              </div>

              <strong>{format(totalOrganizations)} total</strong>
            </div>

            <div
              className="pa-verification-progress"
              role="img"
              aria-label={verificationSegments
                .map(
                  (item) => `${item.label}: ${item.value}`
                )
                .join(", ")}
            >
              {verificationSegments.map((item) => (
                <span
                  key={item.key}
                  style={{
                    width: `${
                      totalOrganizations > 0
                        ? (item.value / totalOrganizations) * 100
                        : 0
                    }%`,
                    background: item.color,
                  }}
                />
              ))}
            </div>

            <div className="pa-verification-legend">
              {verificationSegments.map((item) => (
                <div
                  key={item.key}
                  className="pa-verification-legend-item"
                >
                  <span
                    className="pa-verification-dot"
                    style={{ background: item.color }}
                  />

                  <span>{item.label}</span>
                  <strong>{format(item.value)}</strong>

                  <small>
                    {totalOrganizations > 0
                      ? Math.round(
                          (item.value / totalOrganizations) * 100
                        )
                      : 0}
                    %
                  </small>
                </div>
              ))}
            </div>
          </section>

          <section className="pa-analytics-card pa-unified-card">
            <div className="pa-analytics-card-header">
              <div>
                <h2>Project distribution</h2>
                <p>Current project status breakdown</p>
              </div>
            </div>

            <div className="pa-analytics-total">
              <strong>{format(totalProjects)}</strong>
              <span>Total projects</span>
            </div>

            <div
              className="pa-analytics-stacked-bar"
              role="img"
              aria-label={`Active: ${activeProjects}, Other: ${
                totalProjects - activeProjects
              }`}
            >
              {projectSegments.map((segment) => (
                <span
                  key={segment.key}
                  style={{
                    width: `${
                      totalProjects > 0
                        ? (segment.value / totalProjects) * 100
                        : 0
                    }%`,
                    background: segment.color,
                  }}
                />
              ))}
            </div>

            <div className="pa-analytics-segments">
              {projectSegments.map((segment) => (
                <div
                  key={segment.key}
                  className="pa-analytics-segment"
                >
                  <div className="pa-analytics-segment-info">
                    <span
                      className="pa-analytics-dot"
                      style={{ background: segment.color }}
                    />
                    <span>{segment.label}</span>
                  </div>

                  <div className="pa-analytics-segment-values">
                    <strong>{format(segment.value)}</strong>
                    <span>
                      {totalProjects > 0
                        ? Math.round(
                            (segment.value / totalProjects) * 100
                          )
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="pa-analytics-footnote">
              {totalProjects === 0
                ? "No projects available yet"
                : "Based on current platform data"}
            </p>
          </section>
        </div>
      )}

      {/* USER GROWTH */}

      <section
        className="pa-dashboard-growth"
        aria-labelledby="pa-growth-title"
      >
        <div className="pa-dashboard-section-heading">
          <h2 id="pa-growth-title">User growth</h2>
          <span>Last 8 weeks</span>
        </div>

        {signupError ? (
          <p className="pa-message pa-error" role="alert">
            {signupError}
          </p>
        ) : weeks === null ? (
          <p role="status">Loading signup report…</p>
        ) : (
          <>
            <dl className="pa-signup-metrics">
              <div>
                <dt>New signups · 8 weeks</dt>
                <dd>{format(totalSignups)}</dd>
              </div>

              <div>
                <dt>This week so far</dt>
                <dd>{format(thisWeek)}</dd>
              </div>

              <div>
                <dt>Last week</dt>
                <dd>{format(lastWeek)}</dd>
              </div>
            </dl>

            <section
              className="pa-panel pa-signup-chart-panel"
              aria-labelledby="pa-weekly-chart-title"
            >
              <div className="pa-chart-heading">
                <div>
                  <h2 id="pa-weekly-chart-title">
                    Weekly new users
                  </h2>
                  <p>
                    Weeks start Monday · Sri Lanka time
                  </p>
                </div>
              </div>

              <div className="pa-weekly-chart">
                <div className="pa-weekly-chart-legend">
                  <span>
                    <i className="pa-weekly-legend-dot" />
                    Weekly signups
                  </span>

                  <span>
                    <i className="pa-weekly-legend-dot current" />
                    Current week · In progress
                  </span>
                </div>

                <div className="pa-weekly-chart-body">
                  <div
                    className="pa-weekly-y-axis"
                    aria-hidden="true"
                  >
                    {[4, 3, 2, 1, 0].map((step) => (
                      <span key={step}>
                        {chartStep * step}
                      </span>
                    ))}
                  </div>

                  <div className="pa-weekly-plot">
                    <div
                      className="pa-weekly-grid"
                      aria-hidden="true"
                    >
                      {[0, 1, 2, 3, 4].map((line) => (
                        <span key={line} />
                      ))}
                    </div>

                    <ul
                      className="pa-weekly-bars"
                      aria-label="Weekly signups"
                    >
                      {signupWeeks.map((week, index) => {
                        const count = number(week.count);
                        const current =
                          index === signupWeeks.length - 1;

                        const startDate = new Date(
                          `${week.week_start}T00:00:00Z`
                        );

                        const endDate = new Date(startDate);
                        endDate.setUTCDate(
                          endDate.getUTCDate() + 6
                        );

                        const label =
                          weekFormatter.format(startDate);

                        const range = `${label} – ${weekFormatter.format(
                          endDate
                        )}`;

                        return (
                          <li
                            key={week.week_start}
                            className={
                              current ? "is-current" : ""
                            }
                          >
                            <div
                              className="pa-weekly-bar-area"
                              tabIndex={0}
                              aria-label={`${range}: ${count} new users`}
                            >
                              <div
                                className={`pa-weekly-bar ${
                                  count === 0
                                    ? "is-zero"
                                    : ""
                                }`}
                                style={{
                                  height:
                                    count === 0
                                      ? "4px"
                                      : `${Math.max(
                                          4,
                                          (count / chartMax) * 100
                                        )}%`,
                                }}
                              />

                              <div
                                className="pa-weekly-tooltip"
                                role="tooltip"
                              >
                                <strong>{range}</strong>
                                <span>
                                  {count} new{" "}
                                  {count === 1
                                    ? "signup"
                                    : "signups"}
                                </span>

                                {current && (
                                  <small>
                                    Week in progress
                                  </small>
                                )}
                              </div>
                            </div>

                            <time dateTime={week.week_start}>
                              {label}
                            </time>

                            {current && (
                              <span className="pa-weekly-current-label">
                                Current
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </section>

      {/* QUICK ACTIONS */}

      <section
        className="pa-dashboard-quick-actions"
        aria-labelledby="pa-quick-actions-title"
      >
        <div className="pa-dashboard-section-heading">
          <h2 id="pa-quick-actions-title">
            Quick actions
          </h2>
        </div>

        <div className="pa-quick-actions-grid">
          <button
            type="button"
            onClick={() => navigateTo("users")}
          >
            <UsersRound size={20} />
            <span>Manage users</span>
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            onClick={() =>
              navigateTo("organizations", "pending")
            }
          >
            <Building2 size={20} />
            <span>Review companies</span>
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            onClick={() =>
              navigateTo("subscription-plans")
            }
          >
            <CreditCard size={20} />
            <span>Subscription plans</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </section>
  );
}

export default function PlatformAdminPage() {
  const navigate = useNavigate();
  const profileDrawerRef = useRef(null);
  const companyDrawerRef = useRef(null);
  const signOutDialogRef = useRef(null);
  const [profilePhoto, setProfilePhoto] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [account, setAccount] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [companySearch, setCompanySearch] = useState("");
  const [companyTotal, setCompanyTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  
  const [selectedId, setSelectedId] = useState(null);
  const [dashboardUserFilter, setDashboardUserFilter] = useState("all");
  const [adminSection, setAdminSection] = useState(() => {
  const savedSection = sessionStorage.getItem("buildora_admin_section");
  const sections = [
    "reports",
    "users",
    "organizations",
    "subscription-plans",
    "organization-subscriptions",
  ];

return "reports";
});

useEffect(() => {
  sessionStorage.setItem("buildora_admin_section", adminSection);
}, [adminSection]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function showSessionExpired() {
      setSessionExpired(true);
      setAccount(null);
      setCheckingAccount(false);
    }

    window.addEventListener("buildora:admin-session-expired", showSessionExpired);

    return () => {
      window.removeEventListener(
        "buildora:admin-session-expired",
        showSessionExpired
      );
    };
  }, []);
  

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      try {
        const user = await getPlatformAdminAccount({
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (user.system_role !== "platform_admin") {
          setAccountError(
            "Platform Admin access is required to open this dashboard."
          );
          return;
        }

        setAccount(user);
      } catch (err) {
        if (!controller.signal.aborted) {
          setSessionExpired(err.status === 401);
          setAccountError(
            err.message || "Unable to verify admin access."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingAccount(false);
        }
      }
    }

    loadAccount();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!account) return;

    const controller = new AbortController();

    async function loadCompanies() {
      setListLoading(true);
      setListError("");

      try {
const result = await getAdminVerificationQueue({
  status: filter,
  search: companySearch,
  offset,
  limit: PAGE_SIZE,
  signal: controller.signal,
});
        if (controller.signal.aborted) return;

        setCompanies(result.items);
setCompanyTotal(result.total);
      } catch (err) {
        if (!controller.signal.aborted) {
          setCompanies([]);
          setCompanyTotal(0);
          setListError(
            err.message || "Unable to load companies."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      }
    }

    loadCompanies();

    return () => controller.abort();
  }, [account, filter, companySearch, offset, reload]);

  async function saveProfile(event) {
  event.preventDefault();

  const fullName = String(
    new FormData(event.currentTarget).get("full_name") ?? ""
  ).trim();

  if (!fullName) {
    setProfileError("Enter your full name.");
    return;
  }

  setProfileError("");
  setProfileSaving(true);

  try {
const changedPhoto =
  profilePhoto && profilePhoto !== account.photo_data
    ? profilePhoto
    : undefined;

const updatedAccount = await updatePlatformAdminProfile(
  fullName,
  changedPhoto
);
    setAccount(updatedAccount);
    profileDrawerRef.current?.close();
  } catch (error) {
    setProfileError(error.message);
  } finally {
    setProfileSaving(false);
  }
}

  function signOut() {

    const keys = [
      "buildora_access_token",
      "buildora_refresh_token",
      "buildora_user",
      "buildora_active_organization",
      "buildora_active_project",
      "buildora_invitation_return",
    ];

    for (const key of keys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    navigate("/", { replace: true });
  }

  if (checkingAccount) {
    return (
      <main className="pa-page">
        <p role="status">Checking Platform Admin access…</p>
      </main>
    );
  }

  if (!account) {
  return (
    <main className="pa-page pa-access-screen app-feedback-page">
  <section
    className="pa-access-card app-feedback-card"
    aria-labelledby="pa-access-title"
  >
        <img className="pa-access-logo" src={logo} alt="Buildora" />

<h1 id="pa-access-title">
  {sessionExpired ? "Session expired" : "Admin access required"}
</h1>

<p role="alert">
  {sessionExpired
    ? "Please sign in again to continue to the admin dashboard."
    : accountError || "Use a Platform Admin account to open this dashboard."}
</p>

{sessionExpired ? (
  <button
    type="button"
    className="pa-button pa-access-action"
    onClick={signOut}
  >
    Sign in again
  </button>
) : (
  <Link className="pa-button pa-access-action" to="/">
    Back to home
  </Link>
)}
      </section>
    </main>
  );
}

  return (
    <div className="pa-page buildora-platform-admin">
<header className="pa-topbar">
  <button
  type="button"
  className="pa-mobile-nav-toggle"
  aria-label={mobileNavOpen ? "Close admin menu" : "Open admin menu"}
  aria-expanded={mobileNavOpen}
  aria-controls="pa-admin-sidebar"
  onClick={() => setMobileNavOpen((open) => !open)}
>
  {mobileNavOpen ? "×" : "☰"}
</button>
  <img src={logo} alt="Buildora" />

  <details className="pa-account-menu">
    <summary className="pa-account-trigger">
      <span className="pa-avatar" aria-hidden="true">
        {account.photo_data ? (
          <img src={account.photo_data} alt="" />
        ) : (
          account.full_name?.trim().split(/\s+/).slice(0, 2)
            .map((name) => name[0]?.toUpperCase()).join("") || "PA"
        )}
      </span>

      <span className="pa-account-name">
        <strong>{account.full_name}</strong>
        <small>Platform Admin</small>
      </span>

      <span className="pa-account-chevron">
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </summary>

    <div className="pa-account-card">
      <button
  type="button"
  className="pa-button"
  onClick={(event) => {
  event.currentTarget.closest("details")?.removeAttribute("open");
  setProfilePhoto(account.photo_data || "");
  profileDrawerRef.current.showModal();
}}
>
  <UsersRound size={16} aria-hidden="true" />
  My profile
</button>
<button
  type="button"
  className="pa-button"
  onClick={(event) => {
    const menu = event.currentTarget.closest("details");
    menu?.removeAttribute("open");
    menu?.querySelector("summary")?.focus();
    signOutDialogRef.current?.showModal();
  }}
>
  <LogOut size={16} aria-hidden="true" />
  Sign out
</button>
    </div>
  </details>
</header>

<dialog
  ref={profileDrawerRef}
  className="pa-profile-drawer"
  aria-labelledby="pa-profile-title"
>
  <div className="pa-profile-heading">
    <h2 id="pa-profile-title">Profile settings</h2>

    <button
      type="button"
      className="pa-button"
      aria-label="Close profile settings"
      onClick={() => profileDrawerRef.current?.close()}
    >
      ×
    </button>
  </div>

  <form className="pa-profile-form" onSubmit={saveProfile}>
    <div className="pa-profile-body">
      <label className="pa-profile-photo">
        <span className="pa-profile-avatar" aria-hidden="true">
          {profilePhoto ? (
            <img src={profilePhoto} alt="" />
          ) : (
            account.full_name?.trim().split(/\s+/).slice(0, 2)
              .map((name) => name[0]?.toUpperCase()).join("") || "PA"
          )}
        </span>

        <span className="pa-profile-photo-copy">
          <strong>Profile photo</strong>
          <span className="pa-profile-photo-action">Change photo</span>
          <small>JPG or PNG · Up to 512 KB</small>
        </span>

        <input
          className="pa-profile-file"
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            if (
              !["image/jpeg", "image/png"].includes(file.type) ||
              file.size > 512 * 1024
            ) {
              setProfileError("Choose a JPG or PNG photo up to 512 KB.");
              input.value = "";
              return;
            }

            setProfileError("");
            const reader = new FileReader();
            reader.onload = () => setProfilePhoto(String(reader.result));
            reader.onerror = () => setProfileError("Unable to read the photo.");
            reader.readAsDataURL(file);
            input.value = "";
          }}
        />
      </label>

      <h3 className="pa-profile-section-title">Personal details</h3>

      <label>
        Full name
        <input
          name="full_name"
          defaultValue={account.full_name}
          minLength={2}
          maxLength={100}
          required
        />
      </label>

      {account.email && (
        <label>
          Email address
          <input type="email" value={account.email} readOnly />
        </label>
      )}

      <label>
        Role
        <input value="Platform Admin" readOnly />
      </label>

      {profileError && (
        <p className="pa-profile-error" role="alert">{profileError}</p>
      )}
    </div>

    <footer className="pa-profile-footer">
      <button
        type="button"
        className="pa-button"
        onClick={() => profileDrawerRef.current?.close()}
      >
        Cancel
      </button>

      <button
        type="submit"
        className="pa-button pa-profile-save"
        disabled={profileSaving}
      >
        {profileSaving ? "Saving…" : "Save changes"}
      </button>
    </footer>
  </form>
</dialog>

<dialog
  ref={signOutDialogRef}
  className="pa-signout-dialog"
  aria-labelledby="pa-signout-title"
  aria-describedby="pa-signout-description"
>
  <span className="pa-signout-icon" aria-hidden="true">
    <LogOut size={22} />
  </span>

  <h2 id="pa-signout-title">Sign out of Buildora?</h2>
  <p id="pa-signout-description">
    You’ll need to sign in again to access the admin dashboard.
  </p>

  <div className="pa-signout-actions">
    <button
      type="button"
      className="pa-button"
      autoFocus
      onClick={() => signOutDialogRef.current?.close()}
    >
      Cancel
    </button>

    <button
      type="button"
      className="pa-button pa-signout-confirm"
      onClick={signOut}
    >
      Sign out
    </button>
  </div>
</dialog>

<div className="pa-shell">
  {mobileNavOpen && (
  <button
    type="button"
    className="pa-mobile-nav-backdrop"
    aria-label="Close admin menu"
    onClick={() => setMobileNavOpen(false)}
  />
)}

<aside
  id="pa-admin-sidebar"
  className={`pa-sidebar${mobileNavOpen ? " pa-sidebar-open" : ""}`}
>
  <p className="pa-sidebar-intro">
    Review companies and manage platform access.
  </p>

  <nav
  aria-label="Platform admin navigation"
  onClick={(event) => {
    if (event.target.closest("button:not(:disabled)")) {
      setMobileNavOpen(false);
    }
  }}
  onKeyDown={(event) => {
    if (event.key === "Escape" && mobileNavOpen) {
      setMobileNavOpen(false);
      document.querySelector(".pa-mobile-nav-toggle")?.focus();
    }
  }}
>

<ul>
  {/* 1. Dashboard — first */}
  <li>
    <button
      type="button"
      aria-current={adminSection === "reports" ? "page" : undefined}
      onClick={() => setAdminSection("reports")}
    >
      <BarChart3 size={18} aria-hidden="true" />
      Dashboard
    </button>
  </li>

  {/* 2. Users */}
  <li>
    <button
      type="button"
      aria-current={adminSection === "users" ? "page" : undefined}
      onClick={() => setAdminSection("users")}
    >
      <UsersRound size={18} aria-hidden="true" />
      Users
    </button>
  </li>

  {/* 3. Company verification */}
  <li>
    <button
      type="button"
      aria-current={adminSection === "organizations" ? "page" : undefined}
      onClick={() => setAdminSection("organizations")}
    >
      <Building2 size={18} aria-hidden="true" />
      Company verification
    </button>
  </li>

  <li className="pa-sidebar-group-heading" aria-hidden="true">
    <span>Subscriptions</span>
  </li>

  {/* 4. Subscription Plans */}
  <li>
    <button
      type="button"
      aria-current={adminSection === "subscription-plans" ? "page" : undefined}
      onClick={() => setAdminSection("subscription-plans")}
    >
      <Tags size={18} aria-hidden="true" />
      Subscription Plans
    </button>
  </li>

  {/* 5. Organization Subscriptions */}
  <li>
    <button
      type="button"
      aria-current={
        adminSection === "organization-subscriptions"
          ? "page"
          : undefined
      }
      onClick={() => setAdminSection("organization-subscriptions")}
    >
      <CreditCard size={18} aria-hidden="true" />
      Organization Subscriptions
    </button>
  </li>
</ul>

  </nav>

  <footer className="pa-sidebar-footer">
    <strong>BUILDORA</strong>
    <small>Build with clarity.</small>
  </footer>
</aside>
<main className="pa-container pa-content" id="pa-organizations">
  {adminSection === "users" ? (
  <PlatformAdminUsers
  key={dashboardUserFilter}
  initialFilter={dashboardUserFilter}
/>
 ) : adminSection === "subscription-plans" ? (
    <PlatformAdminSubscriptionPlans />
) : adminSection === "organization-subscriptions" ? (
  <PlatformAdminOrganizationSubscriptions />
) : adminSection === "reports" ? (
<PlatformAdminWeeklySignups
  onNavigate={(section, status) => {
    if (section === "organizations") {
      setFilter(status ?? "all");
      setOffset(0);
      setCompanySearch("");
    }

    if (section === "users") {
      setDashboardUserFilter(status ?? "all");
    }

    setAdminSection(section);
  }}
/>
) : (
    <>
<header className="pa-heading pa-verification-heading">
          <h1>Company verification</h1>
          <p>
            Review company applications, inspect supporting
            documents and record approval decisions.
          </p>
        </header>

<VerificationSummary
  filter={filter}
  reload={reload}
  onFilterChange={(status) => {
    setFilter(status);
    setOffset(0);
  }}
/>
<div className="pa-layout pa-verification-layout">
          <section className="pa-panel">
            <div className="pa-section-heading">
              <h2>Companies</h2>
            </div>

            <label className="pa-field">
              <span>Verification status</span>

              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="all">All companies</option>
<option value="unsubmitted">Not submitted</option>
                <option value="pending">Under review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>

<label className="pa-company-search">
  <input
  aria-label="Search companies"
    type="search"
    value={companySearch}
    maxLength={100}
    placeholder="Company, email or registration number"
    onChange={(event) => {
      setCompanySearch(event.target.value);
      setOffset(0);
    }}
  />
</label>
            {listError && (
              <p className="pa-message pa-error" role="alert">
                {listError}
              </p>
            )}

            {listLoading ? (
              <p role="status">Loading companies…</p>
            ) : companies.length === 0 ? (
              <p className="pa-muted">
                No companies found for this filter.
              </p>
            ) : (
              <div className="pa-company-list">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className={
                      selectedId === company.id
                        ? "pa-company pa-company-selected"
                        : "pa-company"
                    }
                    onClick={() => {
  setSelectedId(company.id);
  companyDrawerRef.current?.showModal();
}}
                    aria-pressed={selectedId === company.id}
                  >
<span className="pa-company-identity">
  <strong>{company.name}</strong>
  <small>
    Company email · {company.company_email || (
      <em className="pa-company-missing">Not provided</em>
    )}
  </small>
  <small>
    Created by · {company.creator_email || (
      <em className="pa-company-missing">Not provided</em>
    )}
  </small>
  <small>
    Address · {company.address || (
      <em className="pa-company-missing">Not provided</em>
    )}
  </small>
</span>

<span className="pa-company-meta">
  <small>
    Reg. no. · {company.registration_number || (
      <em className="pa-company-missing">Not provided</em>
    )}
  </small>
  <small className={company.document_count === 0 ? "pa-company-no-docs" : undefined}>
    {company.document_count === 0
      ? "0 documents · Review evidence missing"
      : `${company.document_count} ${company.document_count === 1 ? "document" : "documents"}`}
  </small>
  <small>Created {formatDate(company.created_at)}</small>
</span>

<span
  className="pa-company-status"
  data-status={company.verification_status}
>
  {STATUS_LABELS[company.verification_status] || company.verification_status}
</span>

<span className="pa-company-review">
  Review <span aria-hidden="true">→</span>
</span>
                  </button>
                ))}
              </div>
            )}

            <div className="pa-pagination">
              <button
                type="button"
                className="pa-button"
                disabled={listLoading || offset === 0}
                onClick={() =>
                  setOffset((value) =>
                    Math.max(0, value - PAGE_SIZE)
                  )
                }
              >
                Previous
              </button>

              <span>
  {listLoading || listError
    ? "—"
    : `${companyTotal} ${companyTotal === 1 ? "company" : "companies"}`}
  {" · "}Page {Math.floor(offset / PAGE_SIZE) + 1}
</span>

              <button
                type="button"
                className="pa-button"
                disabled={
                  listLoading ||
                  Boolean(listError) ||
offset + PAGE_SIZE >= companyTotal
                }
                onClick={() =>
                  setOffset((value) => value + PAGE_SIZE)
                }
              >
                Next
              </button>
            </div>
          </section>

<dialog
  ref={companyDrawerRef}
  className="pa-profile-drawer pa-company-drawer"
  aria-labelledby="pa-company-drawer-title"
  onClose={() => setSelectedId(null)}
>
  <div className="pa-profile-heading">
    <h2 id="pa-company-drawer-title">Company application</h2>

    <button
      type="button"
      className="pa-button"
      aria-label="Close company application"
      onClick={() => companyDrawerRef.current?.close()}
    >
      ×
    </button>
  </div>

  <div className="pa-company-drawer-body">
    {selectedId && (
      <CompanyDetails
        key={selectedId}
        organizationId={selectedId}
        onReviewed={() => setReload((value) => value + 1)}
      />
    )}
  </div>
</dialog>
        </div>
          </>
)}
      </main>
      </div> {/* pa-shell */}
    </div>
  );
}