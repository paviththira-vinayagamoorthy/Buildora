import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  House,
  Mail,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";

import {
  getProject,
  getProjectBOQs,
  getProjectMembers,
  getProjectPaymentSummary,
  getWorkspaceContext,
  getProjectSiteUpdates,
} from "../services/workspaceApi";

import BOQSection from "../components/boq/BOQSection";

import ValuationsPage from "./ValuationsPage";
import CertificatesPage from "./CertificatesPage";
import PaymentsPage from "./PaymentsPage";
import DocumentsPage from "./DocumentsPage";
import VariationsPage from "./VariationsPage";
import SiteUpdatesPage from "./SiteUpdatesPage";
import MonthlyReportsPage from "./MonthlyReportsPage";

import buildoraLogo from "../assets/buildora-logo.png";
import projectPreview from "../assets/buildora-hero.png";

import "../styles/ProjectWorkspace.css";
import "../styles/ProjectWorkspacePolish.css";

/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#D9C8BA] bg-[#FFFCF8] px-4 py-2.5 text-[14px] font-semibold text-[#352A3D] disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#352A3D] bg-[#352A3D] px-4 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

const INPUT =
  "min-h-[46px] w-full rounded-lg border border-[#D9C8BA] bg-white px-3 py-2.5 text-[14px] text-[#352A3D] outline-none focus:border-[#AC523E] focus:ring-2 focus:ring-[#AC523E]/15";

const ALLOWED_TABS = [
  "overview",
  "boq",
  "valuations",
  "certificates",
  "payments",
  "documents",
  "site-updates",
  "monthly-reports",
  "team",
  "variations",
];

const MAIN_SECTIONS = [
  ["overview", "Overview"],
  ["boq", "BOQ"],
  ["valuations", "Costs & Payments"],
  ["documents", "Documents"],
  ["variations", "Variations"],
  ["site-updates", "Progress & Reports"],
  ["team", "Members"],
];

const COST_SECTIONS = [
  ["valuations", "Valuations"],
  ["certificates", "Certificates"],
  ["payments", "Payments"],
];

const REPORT_SECTIONS = [
  ["site-updates", "Site updates"],
  ["monthly-reports", "Monthly reports"],
];

/* =========================================================
   HELPERS
========================================================= */

function roleLabel(role) {
  return (
    {
      qs: "Quantity Surveyor",
      owner: "Building Owner",
      building_owner: "Building Owner",
      organization_admin: "Company Admin",
      platform_admin: "Platform Admin",
    }[role] || "Project member"
  );
}

function initials(value) {
  return String(value || "Member")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value);

  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? `${raw}Z`
      : raw;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) return "—";

  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortDate(value) {
  const date = parseDate(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function invitationStatus(invitation) {
  if (
    invitation.revoked_at ||
    invitation.status === "revoked"
  ) {
    return "Cancelled";
  }

  if (invitation.status === "accepted") return "Accepted";
  if (invitation.status === "declined") return "Declined";

  if (invitation.status !== "pending") {
    return invitation.status || "Unavailable";
  }

  const expiry = parseDate(invitation.expires_at);

  if (!expiry) return "Resend required";

  return expiry.getTime() <= Date.now()
    ? "Expired"
    : "Pending";
}

async function requestJson(path, options = {}) {
  const token =
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token");

  if (!token) {
    throw new Error(
      "Your session expired. Please sign in again."
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;

    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) => item?.msg)
              .filter(Boolean)
              .join(", ")
          : "Unable to complete the request.";

    const error = new Error(
      message || "Unable to complete the request."
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

function saveProjectSelection(project) {
  const storage = localStorage.getItem(
    "buildora_access_token"
  )
    ? localStorage
    : sessionStorage;

  for (const key of [
    "buildora_active_project",
    "buildora_active_organization",
  ]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  storage.setItem(
    "buildora_active_project",
    String(project.id)
  );

  storage.setItem(
    "buildora_active_organization",
    String(project.organization_id)
  );
}

/* =========================================================
   MEMBERS AND INVITATIONS
========================================================= */

function ProjectMembers({
  project,
  userId,
  isCompanyAdmin,
  companyApproved,
}) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("qs");
  const [busy, setBusy] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const actionRef = useRef(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  const canInvite =
    isCompanyAdmin &&
    companyApproved &&
    project.status === "active";

  const loadTeam = useCallback(async () => {
    const requestId = ++requestRef.current;

    if (mountedRef.current) setLoading(true);

    try {
      const results = await Promise.allSettled([
        getProjectMembers(project.id),
        isCompanyAdmin
          ? requestJson(
              `/invitations/organizations/${project.organization_id}`
            )
          : Promise.resolve([]),
      ]);

      if (
        !mountedRef.current ||
        requestId !== requestRef.current
      ) {
        return;
      }

      const messages = [];

      if (results[0].status === "fulfilled") {
        setMembers(
          Array.isArray(results[0].value)
            ? results[0].value
            : []
        );
      } else {
        setMembers([]);
        messages.push(
          results[0].reason?.message ||
            "Unable to load members."
        );
      }

      if (results[1].status === "fulfilled") {
        const records = Array.isArray(results[1].value)
          ? results[1].value
          : [];

        setInvitations(
          records
            .filter(
              (invitation) =>
                String(invitation.project_id) ===
                String(project.id)
            )
            .sort((a, b) => Number(b.id) - Number(a.id))
        );
      } else {
        setInvitations([]);
        messages.push(
          results[1].reason?.message ||
            "Unable to load invitations."
        );
      }

      if (messages.length) {
        setError(messages.join(" "));
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }, [
    project.id,
    project.organization_id,
    isCompanyAdmin,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    void loadTeam();

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [loadTeam]);

  async function refreshTeam() {
    if (actionRef.current || loading) return;

    setError("");
    await loadTeam();
  }

  async function handleInvite(event) {
    event.preventDefault();

    if (
      actionRef.current ||
      loading ||
      !canInvite
    ) {
      return;
    }

    const invitedEmail = email.trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    if (!["qs", "building_owner"].includes(role)) {
      setError("Select a valid project role.");
      return;
    }

    actionRef.current = true;
    setBusy("create");
    setError("");
    setSuccess("");

    try {
      await requestJson(
        `/invitations/organizations/${project.organization_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: invitedEmail,
            member_role: role === "qs" ? "qs" : "staff",
            project_id: Number(project.id),
            project_role: role,
          }),
        }
      );

      if (!mountedRef.current) return;
setEmail("");
setInviteOpen(false);

setSuccess(
  "Invitation email sent. Project access is added only after acceptance."
);
    } catch (err) {
      if (!mountedRef.current) return;

      setError(
        `${err?.message || "Unable to send invitation."} Check invitation history before trying again; a saved invitation may need resending.`
      );
    } finally {
      if (mountedRef.current) {
        await loadTeam();

        if (mountedRef.current) setBusy("");
      }

      actionRef.current = false;
    }
  }

  async function manageInvitation(invitation, action) {
    if (
      actionRef.current ||
      loading ||
      !isCompanyAdmin ||
      project.status !== "active" ||
      invitation.status !== "pending" ||
      invitation.revoked_at ||
      !["resend", "revoke"].includes(action)
    ) {
      return;
    }

    if (action === "resend" && !canInvite) return;

    if (
      action === "revoke" &&
      !window.confirm(
        `Cancel the pending invitation for ${invitation.email}?`
      )
    ) {
      return;
    }

    actionRef.current = true;
    setBusy(`${action}-${invitation.id}`);
    setError("");
    setSuccess("");

    try {
      await requestJson(
        `/invitations/${invitation.id}/${action}`,
        { method: "POST" }
      );

      if (!mountedRef.current) return;

      setSuccess(
        action === "resend"
          ? "New invitation email sent. The previous link is no longer valid."
          : "Invitation cancelled."
      );
    } catch (err) {
      if (!mountedRef.current) return;

      setError(
        `${err?.message || "Unable to update invitation."} Refresh and check the invitation status before retrying.`
      );
    } finally {
      if (mountedRef.current) {
        await loadTeam();

        if (mountedRef.current) setBusy("");
      }

      actionRef.current = false;
    }
  }

  const qsCount = members.filter(
    (member) => member.project_role === "qs"
  ).length;

  const ownerCount = members.filter(
    (member) =>
      member.project_role === "building_owner" ||
      member.project_role === "owner"
  ).length;

  return (
    <div className="pw-members-page space-y-6">
      <section className="rounded-2xl border border-[#E3D6CA] bg-[#FFFCF8] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[23px] font-bold text-[#352A3D]">
              Project members
            </h2>
            <p className="mt-2 text-[14px] leading-7 text-[#6D646C]">
              Assigned Quantity Surveyors and Building Owners.
            </p>
          </div>

<div className="flex flex-wrap items-center justify-end gap-3">
  {isCompanyAdmin && (
    <button
      type="button"
      className={PRIMARY_BUTTON}
      disabled={!canInvite || loading || Boolean(busy)}
      onClick={() => setInviteOpen(true)}
    >
      <Users size={16} aria-hidden="true" />
      + Invite Member
    </button>
  )}
</div>

        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-[#E4B5AB] bg-[#FFF0EB] p-4 text-[14px] leading-6 text-[#8C3327]"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-[#BDCDBF] bg-[#EDF3ED] p-4 text-[14px] leading-6 text-[#3D6046]"
          >
            {success}
          </div>
        )}

        <div className="my-5 flex flex-wrap gap-5 text-[14px] text-[#6D646C]">
          <span>{members.length} members</span>
          <span>{qsCount} QS</span>
          <span>{ownerCount} owners</span>
        </div>

        {loading && (
          <p role="status" className="text-[14px] text-[#6D646C]">
            Updating members and invitations…
          </p>
        )}

        {!loading && members.length === 0 && (
          <p className="text-[14px] leading-7 text-[#6D646C]">
            No members assigned yet. Invited people appear
            here after accepting their invitation.
          </p>
        )}

        <div className="space-y-3">
          {members.map((member) => {
            const name =
              member.full_name ||
              member.email ||
              `User #${member.user_id}`;

            return (
              <article
                key={member.id || member.user_id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E3D6CA] bg-white p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEE7DF] text-[13px] font-bold text-[#352A3D]">
                    {initials(name)}
                  </span>

                  <div className="min-w-0">
                    <h3 className="break-words text-[15px] font-semibold text-[#352A3D]">
                      {name}
                      {String(member.user_id) === String(userId)
                        ? " (You)"
                        : ""}
                    </h3>

                    <p className="break-all text-[13px] text-[#6D646C]">
                      {member.email}
                    </p>
                  </div>
                </div>

                <span className="text-[13px] font-semibold text-[#805140]">
                  {roleLabel(member.project_role)}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      {isCompanyAdmin && (
        <>
          {inviteOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) {
        setInviteOpen(false);
      }
    }}
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
      className="w-full max-w-xl rounded-2xl border border-[#E3D6CA] bg-[#FFFCF8] p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          id="invite-member-title"
          className="text-[22px] font-bold text-[#352A3D]"
        >
          Invite a member
        </h2>

        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => setInviteOpen(false)}
          className="text-2xl text-[#6D646C] hover:text-[#352A3D]"
          aria-label="Close invitation popup"
        >
          ×
        </button>
      </div>

      <p className="mt-2 text-[14px] leading-7 text-[#6D646C]">
        An invitation link will be emailed to the person.
        They must sign in with that email and accept it.
      </p>

      <form onSubmit={handleInvite} className="mt-5">
        <fieldset disabled={!canInvite || loading || Boolean(busy)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[14px] font-semibold text-[#352A3D]">
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                maxLength={255}
                required
                className={`${INPUT} mt-2`}
                placeholder="member@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="text-[14px] font-semibold text-[#352A3D]">
              Project role
              <select
                className={`${INPUT} mt-2`}
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="qs">Quantity Surveyor</option>
                <option value="building_owner">Building Owner</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className={BUTTON}
              onClick={() => setInviteOpen(false)}
            >
              Cancel
            </button>

            <button type="submit" className={PRIMARY_BUTTON}>
              <Mail size={16} aria-hidden="true" />
              {busy === "create" ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>
)}

          <section className="rounded-2xl border border-[#E3D6CA] bg-[#FFFCF8] p-6">
            <h2 className="text-[22px] font-bold text-[#352A3D]">
              Invitation history
            </h2>

            <p className="mt-2 text-[14px] leading-7 text-[#6D646C]">
              Resending creates a new link. Cancelling a pending
              invitation does not remove existing members.
            </p>

            {!loading && invitations.length === 0 && (
              <p className="mt-4 text-[14px] text-[#6D646C]">
                No invitations recorded for this project.
              </p>
            )}

            <div className="mt-5 space-y-3">
              {invitations.map((invitation) => {
                const pending =
                  invitation.status === "pending" &&
                  !invitation.revoked_at;

                return (
                  <article
                    key={invitation.id}
                    className="rounded-xl border border-[#E3D6CA] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="break-all text-[15px] font-semibold text-[#352A3D]">
                          {invitation.email}
                        </h3>
                        <p className="mt-1 text-[13px] text-[#6D646C]">
                          {roleLabel(invitation.project_role)}
                        </p>
                      </div>

                      <span className="text-[13px] font-semibold text-[#805140]">
                        {invitationStatus(invitation)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-[12px] leading-6 text-[#6D646C]">
                      <p>Created: {formatDate(invitation.created_at)}</p>
                      <p>Expires: {formatDate(invitation.expires_at)}</p>
                      <p>
                        Email server accepted: {formatDate(invitation.sent_at)}
                      </p>

                      {invitation.accepted_at && (
                        <p>Accepted: {formatDate(invitation.accepted_at)}</p>
                      )}
                    </div>

                    {pending && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className={BUTTON}
                          disabled={!canInvite || loading || Boolean(busy)}
                          onClick={() => manageInvitation(invitation, "resend")}
                        >
                          {busy === `resend-${invitation.id}`
                            ? "Resending…"
                            : "Resend email"}
                        </button>

                        <button
                          type="button"
                          className={BUTTON}
                          disabled={loading || Boolean(busy)}
                          onClick={() => manageInvitation(invitation, "revoke")}
                        >
                          {busy === `revoke-${invitation.id}`
                            ? "Cancelling…"
                            : "Cancel invitation"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* =========================================================
   PROJECT WORKSPACE
========================================================= */

export default function ProjectWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  const [project, setProject] = useState(null);
  const isArchived = project?.status === "archived";
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [company, setCompany] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creationNotice, setCreationNotice] = useState(null);

  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  const activeTab = useMemo(() => {
    const requested = new URLSearchParams(
      location.search
    ).get("tab");

    return ALLOWED_TABS.includes(requested)
      ? requested
      : "overview";
  }, [location.search]);

  const loadProject = useCallback(async () => {
    const requestId = ++requestRef.current;

    setLoading(true);
    setError("");

    try {
      if (!/^[1-9]\d*$/.test(projectId || "")) {
        throw new Error("Invalid project link.");
      }

      const [details, context, assignedMembers] = await Promise.all([
        getProject(projectId),
        getWorkspaceContext(),
        getProjectMembers(projectId),
      ]);

      if (!details?.organization_id) {
        throw new Error(
          "Project company information is unavailable."
        );
      }

      const membership = context?.organizations?.find(
        (item) => String(item.id) === String(details.organization_id)
      );

      let organization;

      try {
        organization = await requestJson(
          `/organizations/${details.organization_id}`
        );
      } catch (err) {
        if (
          err.status !== 403 ||
          membership?.member_role === "organization_admin"
        ) {
          throw err;
        }

        organization = {
          id: details.organization_id,
          name:
            membership?.name ||
            details.organization_name ||
            details.organization?.name ||
            "Company project",
          verification_status: null,
        };
      }

      if (
        !mountedRef.current ||
        requestId !== requestRef.current
      ) {
        return;
      }

      setProject(details);
      setWorkspace(context);
      setMembers(
        Array.isArray(assignedMembers) ? assignedMembers : []
      );
      setCompany(organization);

      saveProjectSelection(details);
    } catch (err) {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setError(err?.message || "Unable to load the project.");
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;

    setProject(null);
    setWorkspace(null);
    setCompany(null);
    setMembers([]);
    setCreationNotice(null);

    void loadProject();

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [loadProject]);

  useEffect(() => {
    const notice = location.state?.projectCreated;

    if (
      !notice ||
      String(notice.projectId) !== String(projectId)
    ) {
      return;
    }

    setCreationNotice(notice);

    const nextState = { ...(location.state || {}) };
    delete nextState.projectCreated;

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: Object.keys(nextState).length ? nextState : null,
      }
    );
  }, [
    projectId,
    location.pathname,
    location.search,
    location.hash,
    location.state,
    navigate,
  ]);

  const organizationMembership = workspace?.organizations?.find(
    (item) => String(item.id) === String(project?.organization_id)
  );

  const workspaceProject = workspace?.projects?.find(
    (item) => String(item.id) === String(projectId)
  );

  const currentMember = members.find(
    (item) => String(item.user_id) === String(workspace?.user?.id)
  );

  const isCompanyAdmin =
    organizationMembership?.member_role === "organization_admin";

  const assignedRoles = [
    currentMember?.project_role,
    workspaceProject?.project_role,
    project?.project_role,
  ];

  const projectRole = assignedRoles.includes("qs")
    ? "qs"
    : isCompanyAdmin
      ? "organization_admin"
      : assignedRoles.find(
          (role) => role === "owner" || role === "building_owner"
        ) || "";

  const showingCosts = COST_SECTIONS.some(
    ([id]) => id === activeTab
  );

  const showingReports = REPORT_SECTIONS.some(
    ([id]) => id === activeTab
  );

  const user = workspace?.user;
  const userInitials = initials(user?.full_name);

  const progressValue = project?.progress_percentage;

  const progress =
    progressValue !== null &&
    progressValue !== undefined &&
    progressValue !== "" &&
    Number.isFinite(Number(progressValue)) &&
    Number(progressValue) >= 0 &&
    Number(progressValue) <= 100
      ? Number(progressValue)
      : null;

  const memberCount = new Set(
    members
      .map((member) => member.user_id)
      .filter((id) => id !== null && id !== undefined)
      .map(String)
  ).size;

  function selectTab(tab) {
    if (!ALLOWED_TABS.includes(tab)) return;

    const query = new URLSearchParams(location.search);
    query.set("tab", tab);

    navigate(
      {
        pathname: location.pathname,
        search: `?${query.toString()}`,
        hash: location.hash,
      },
      { state: location.state }
    );
  }

  const nextSteps = isCompanyAdmin
    ? [
        {
          title: "Manage project members",
          description: "Invite the QS and Building Owner.",
          destination: "team",
          Icon: Users,
        },
        {
          title: "Review BOQ",
          description: "View quantities, rates and revisions.",
          destination: "boq",
          Icon: ClipboardCheck,
        },
        {
          title: "Review payments",
          description: "Follow recorded payments and balances.",
          destination: "payments",
          Icon: CheckCircle2,
        },
      ]
    : projectRole === "qs"
      ? [
          {
            title: "Open BOQ",
            description: "Import or review project quantities.",
            destination: "boq",
            Icon: ClipboardCheck,
          },
          {
            title: "Prepare a valuation",
            description: "Value work against the published BOQ.",
            destination: "valuations",
            Icon: Building2,
          },
          {
            title: "Review certificates",
            description: "Review deductions and net payable.",
            destination: "certificates",
            Icon: CheckCircle2,
          },
        ]
      : [
          {
            title: "Review published BOQ",
            description: "Understand the project cost breakdown.",
            destination: "boq",
            Icon: ClipboardCheck,
          },
          {
            title: "Review completed work",
            description: "View published valuations.",
            destination: "valuations",
            Icon: Building2,
          },
          {
            title: "Follow payments",
            description: "See payments and outstanding balances.",
            destination: "payments",
            Icon: CheckCircle2,
          },
        ];

  const [paidSummary, setPaidSummary] = useState(null);

  const overviewProjectId =
    !loading && !error && String(project?.id) === String(projectId)
      ? project.id
      : null;

  useEffect(() => {
    if (!overviewProjectId || activeTab !== "overview") return;

    let cancelled = false;

    setPaidSummary({
      projectId: overviewProjectId,
      status: "loading",
    });

    async function loadPaidTotal() {
      try {
        const balances = await getProjectPaymentSummary(overviewProjectId);

        if (cancelled) return;

        if (!Array.isArray(balances)) {
          throw new Error("Invalid payment summary.");
        }

        const totalInCents = balances.reduce((total, balance) => {
          const amount = balance.paid_amount;

          if (
            amount == null ||
            String(amount).trim() === "" ||
            !Number.isFinite(Number(amount))
          ) {
            throw new Error("Invalid paid amount.");
          }

          return total + Math.round(Number(amount) * 100);
        }, 0);

        setPaidSummary({
          projectId: overviewProjectId,
          status: "ready",
          total: totalInCents / 100,
        });
      } catch {
        if (!cancelled) {
          setPaidSummary({
            projectId: overviewProjectId,
            status: "unavailable",
          });
        }
      }
    }

    void loadPaidTotal();

    return () => {
      cancelled = true;
    };
  }, [overviewProjectId, activeTab]);

  const currentPaidSummary =
    paidSummary?.projectId === overviewProjectId ? paidSummary : null;

  const paidLabel =
    currentPaidSummary?.status === "ready"
      ? new Intl.NumberFormat("en-LK", {
          style: "currency",
          currency: "LKR",
        }).format(currentPaidSummary.total)
      : currentPaidSummary?.status === "unavailable"
        ? "Unavailable"
        : "Loading…";
          const [publishedBOQ, setPublishedBOQ] = useState(null);
  const boqProjectId =
    !loading && !error && String(project?.id) === String(projectId)
      ? project.id
      : null;

  useEffect(() => {
    if (!boqProjectId || activeTab !== "overview") return;

    let cancelled = false;
    setPublishedBOQ({ projectId: boqProjectId, label: "Loading…" });

    async function loadPublishedBOQ() {
      let label;

      try {
        const records = await getProjectBOQs(boqProjectId);

        if (!Array.isArray(records)) {
          throw new Error("Invalid BOQ response.");
        }

        const latest = records
          .filter((record) => record.status === "published")
          .sort((a, b) => Number(b.revision) - Number(a.revision))[0];

        if (!latest) {
          label = "No published BOQ yet";
        } else {
          const amount = Number(latest.total_amount);

          if (latest.total_amount == null || !Number.isFinite(amount)) {
            throw new Error("Invalid BOQ total.");
          }

          label = new Intl.NumberFormat("en-LK", {
            style: "currency",
            currency: "LKR",
          }).format(amount);
        }
      } catch {
        label = "Unavailable";
      }

      if (!cancelled) {
        setPublishedBOQ({ projectId: boqProjectId, label });
      }
    }

    void loadPublishedBOQ();

    return () => {
      cancelled = true;
    };
  }, [boqProjectId, activeTab]);
    const [siteProgress, setSiteProgress] = useState(null);

  useEffect(() => {
    if (!boqProjectId || activeTab !== "overview") return;

    let cancelled = false;
    setSiteProgress({ projectId: boqProjectId, label: "Loading…" });

    async function loadSiteProgress() {
      let label = "No published update yet";

      try {
        const updates = await getProjectSiteUpdates(boqProjectId);

        if (!Array.isArray(updates)) {
          throw new Error("Invalid site updates response.");
        }

        const latest = updates
          .filter((update) => update.status === "published")
          .sort((a, b) =>
            String(b.update_date ?? "").localeCompare(
              String(a.update_date ?? "")
            ) || Number(b.id) - Number(a.id)
          )[0];

        if (latest) {
          const raw = latest.progress_percentage;
          const percentage = Number(raw);

          label =
            raw != null &&
            String(raw).trim() !== "" &&
            Number.isFinite(percentage) &&
            percentage >= 0 &&
            percentage <= 100
              ? `${percentage}%`
              : "Unavailable";
        }
      } catch {
        label = "Unavailable";
      }

      if (!cancelled) {
        setSiteProgress({ projectId: boqProjectId, label });
      }
    }

    void loadSiteProgress();

    return () => {
      cancelled = true;
    };
  }, [boqProjectId, activeTab]);
  if (loading || error || !project) {
    return (
      <main className="pd-state-page">
        <div className="pd-state-card">
          {loading ? (
            <>
              <RefreshCw
                size={24}
                className="animate-spin"
                aria-hidden="true"
              />
              <p role="status">Opening project workspace…</p>
            </>
          ) : (
            <>
              <h1>Unable to open project</h1>
              <p role="alert">{error || "Project unavailable."}</p>

              <div className="pd-state-actions">
                <button
                  type="button"
                  className="pd-button"
                  onClick={loadProject}
                >
                  Try again
                </button>

                <button
                  type="button"
                  className="pd-button"
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="pd-page">
      <header className="pd-topbar">
        <div className="pd-topbar-left">
<button
  type="button"
  className="pd-back-button"
  onClick={() => navigate("/dashboard")}
>
  <House size={16} strokeWidth={1.8} aria-hidden="true" />
  <span>Back to Home</span>
</button>

          <span
            className="pd-topbar-divider"
            aria-hidden="true"
          />

          <img
            className="pd-logo"
            src={buildoraLogo}
            alt="Buildora"
          />
        </div>

        <button
          type="button"
          className="pd-account"
          onClick={() =>
            window.dispatchEvent(
              new Event("buildora-open-profile")
            )
          }
        >
          <span className="pd-avatar">
            {user?.photo_data ? (
              <img src={user.photo_data} alt="" />
            ) : (
              userInitials
            )}
          </span>

          <span>
            <strong>{user?.full_name || "My account"}</strong>
            <small>My account</small>
          </span>
        </button>
      </header>

      <main className="pd-main">
        {creationNotice && (
          <div className="pd-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />

            <span>
              {creationNotice.name || project.name} created successfully.
            </span>

            <button
              type="button"
              onClick={() => setCreationNotice(null)}
            >
              Dismiss
            </button>
          </div>
        )}

{isArchived && (
  <div
    role="status"
    style={{
      margin: "16px 0",
      padding: "14px 18px",
      borderRadius: "10px",
      backgroundColor: "#FFF4E5",
      border: "1px solid #F2C078",
      color: "#78450A",
      fontSize: "14px",
      lineHeight: 1.6,
    }}
  >
    <strong>📦 Archived Project</strong>
    <div>
      This project has been archived. Existing records are
      preserved. Restore the project to resume work.
    </div>
  </div>
)}
        <header className="pd-project-heading">
          <img
            className="pd-project-photo"
            src={projectPreview}
            alt=""
          />

          <div className="pd-project-title">
            <p>{company?.name || "Company project"}</p>
            <h1>{project.name}</h1>

            <div className="pd-project-meta">
              <span className="pd-location">
  <MapPin size={14} aria-hidden="true" />
  {project.location || "Location not recorded"}
</span>

              <span
                className={
                  project.status === "active"
                    ? "pd-status pd-status-active"
                    : "pd-status"
                }
              >
                <i aria-hidden="true" />
                {project.status || "Status unavailable"}
              </span>

            </div>
          </div>
        </header>

        <nav
          className="pd-navigation"
          aria-label="Project sections"
        >
          {MAIN_SECTIONS.map(([id, label]) => {
            const active =
              id === "valuations"
                ? showingCosts
                : id === "site-updates"
                  ? showingReports
                  : activeTab === id;

            return (
              <button
                key={id}
                id={`pd-nav-${id}`}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <section
          aria-labelledby="pd-nav-overview"
          hidden={activeTab !== "overview"}
        >

<div className="pd-metrics">
  <article className="pd-stat-card">
    <span>Published BOQ total</span>

    {publishedBOQ?.projectId === boqProjectId &&
    publishedBOQ.label === "No published BOQ yet" ? (
      <>
        <strong className="pd-stat-empty">
          Not published yet
        </strong>
        <small>No BOQ has been published for this project.</small>

        {isCompanyAdmin && (
          <button
            type="button"
            className="pd-stat-cta"
            onClick={() => selectTab("boq")}
          >
            Create BOQ <ArrowRight size={14} />
          </button>
        )}
      </>
    ) : (
      <>
        <strong>
          {publishedBOQ?.projectId === boqProjectId
            ? publishedBOQ.label
            : "Loading…"}
        </strong>
        <small>Latest published revision</small>
      </>
    )}
  </article>

  <article
    className="pd-stat-card pd-stat-clickable"
    role="button"
    tabIndex={0}
    onClick={() => selectTab("payments")}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectTab("payments");
      }
    }}
    aria-label="Open Costs and Payments"
  >
    <span>
      Paid <ArrowRight size={15} aria-hidden="true" />
    </span>

    <strong
      className={
        currentPaidSummary?.status === "ready" &&
        Number(currentPaidSummary.total) === 0
          ? "pd-stat-zero"
          : ""
      }
    >
      {paidLabel}
    </strong>

    <small>View recorded payments</small>
  </article>

  <article
    className="pd-stat-card pd-stat-clickable"
    role="button"
    tabIndex={0}
    onClick={() => selectTab("team")}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectTab("team");
      }
    }}
    aria-label="Open project members"
  >
    <span>
      Members <ArrowRight size={15} aria-hidden="true" />
    </span>
    <strong>{memberCount}</strong>
    <small>View project members</small>
  </article>

  <article className="pd-stat-card">
    <span>Last updated</span>
    <strong className="pd-date-value">
      {shortDate(project.updated_at)}
    </strong>
    <small>Project details updated</small>
  </article>
</div>


          
<div className="pd-overview-grid pd-overview-refined">
  {/* LEFT — PROJECT INFORMATION */}
  <article className="pd-panel pd-about-card">
    <div className="pd-panel-heading">
      <span className="pd-panel-icon">
        <Building2 size={18} aria-hidden="true" />
      </span>

      <div>
        <h2>About this project</h2>
<p className="pd-panel-subtitle">
  Project details and status
</p>
      </div>
    </div>

    <p className="pd-description">
      {project.description?.trim()
        ? project.description
            .trim()
            .replace(/^[\s\-–—•]+/, "")
        : "No project description added yet."}
    </p>

    <dl className="pd-details">
      <div>
        <dt>Company</dt>
        <dd>{company?.name || "Not available"}</dd>
      </div>

      <div>
        <dt>Created on</dt>
        <dd>{shortDate(project.created_at)}</dd>
      </div>

      <div>
        <dt>Your role</dt>
        <dd>{roleLabel(projectRole)}</dd>
      </div>

      <div>
        <dt>Project progress</dt>
        <dd>
          {siteProgress?.projectId === boqProjectId
            ? siteProgress.label === "No published update yet"
              ? "No updates yet"
              : siteProgress.label
            : "Loading…"}
        </dd>
      </div>
    </dl>

    {progress !== null && (
      <div className="pd-progress-summary">
        <div className="pd-progress-summary-label">
          <span>Overall progress</span>
          <strong>{Math.round(progress)}%</strong>
        </div>

        <div
          className="pd-progress-track"
          role="progressbar"
          aria-label="Project progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    )}
  </article>

  {/* RIGHT — CONTEXTUAL GUIDANCE */}
  <aside className="pd-panel pd-guidance-card">
    <div className="pd-guidance-heading">
      <span className="pd-guidance-symbol">
        <ClipboardCheck size={19} aria-hidden="true" />
      </span>

      <div>
        <h2>What's next?</h2>
        <p>Keep your project moving forward</p>
      </div>
    </div>

    {publishedBOQ?.projectId !== boqProjectId ? (
      <p className="pd-guidance-loading">
        Checking project status…
      </p>
    ) : publishedBOQ.label === "No published BOQ yet" ? (
      <div className="pd-guidance-content">
        <span className="pd-guidance-tag">
          Getting started
        </span>

        <h3>Set up your project budget</h3>

        <p>
          Your project doesn't have a published BOQ yet.
          Start with a Bill of Quantities to organize
          estimated construction costs.
        </p>

        <button
          type="button"
          className="pd-guidance-link"
          onClick={() => selectTab("boq")}
        >
          {isCompanyAdmin ? "Go to BOQ setup" : "View BOQ"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    ) : siteProgress?.projectId === boqProjectId &&
      siteProgress.label === "No published update yet" ? (
      <div className="pd-guidance-content">
        <span className="pd-guidance-tag">
          Next step
        </span>

        <h3>Track construction progress</h3>

        <p>
          Your BOQ is available. Visit progress reports
          to review the latest construction updates.
        </p>

        <button
          type="button"
          className="pd-guidance-link"
          onClick={() => selectTab("site-updates")}
        >
          View progress reports
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    ) : (
      <div className="pd-guidance-content">
        <span className="pd-guidance-tag">
          Project workspace
        </span>

        <h3>Stay on top of your project</h3>

        <p>
          Review project costs, documents and team
          activity from the sections above.
        </p>

        <button
          type="button"
          className="pd-guidance-link"
          onClick={() => selectTab("valuations")}
        >
          View costs and payments
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    )}
  </aside>
</div>

        </section>

        <section
          aria-labelledby="pd-nav-boq"
          hidden={activeTab !== "boq"}
        >
          <div className="pd-module-panel">

<BOQSection
  key={project.id}
  projectId={Number(project.id)}
  projectRole={projectRole}
  projectStatus={project.status}
/>

          </div>
        </section>

        <section
          aria-labelledby="pd-nav-valuations"
          hidden={!showingCosts}
        >
          <nav
            className="pd-cost-navigation"
            aria-label="Costs and payments"
          >
            {COST_SECTIONS.map(([id, label]) => (
              <button
                key={id}
                id={`pd-cost-${id}`}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <section
            aria-labelledby="pd-cost-valuations"
            hidden={activeTab !== "valuations"}
          >
            <ValuationsPage
              key={project.id}
              workspaceProject={project}
            />
          </section>

          <section
            aria-labelledby="pd-cost-certificates"
            hidden={activeTab !== "certificates"}
          >
            <CertificatesPage
              key={project.id}
              workspaceProject={project}
            />
          </section>

          <section
  aria-labelledby="pd-cost-payments"
  hidden={activeTab !== "payments"}
>
  <PaymentsPage
    key={project.id}
    workspaceProject={project}
    isActive={activeTab === "payments"}
  />
</section>
        </section>

        <section
          aria-labelledby="pd-nav-documents"
          hidden={activeTab !== "documents"}
        >
          <DocumentsPage
            key={project.id}
            workspaceProject={project}
          />
        </section>
        <section
  aria-labelledby="pd-nav-variations"
  hidden={activeTab !== "variations"}
>
  {activeTab === "variations" && (
<VariationsPage
  key={project.id}
  projectId={project.id}
  projectRole={projectRole}
  projectStatus={project.status}
/>
  )}
</section>

        <section
          aria-labelledby="pd-nav-site-updates"
          hidden={!showingReports}
        >
          <nav
  className="pd-cost-navigation pd-report-navigation"
  aria-label="Progress and report sections"
>
            {REPORT_SECTIONS.map(([id, label]) => (
              <button
                key={id}
                id={`pd-progress-${id}`}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <section
            aria-labelledby="pd-progress-site-updates"
            hidden={activeTab !== "site-updates"}
          >
            <SiteUpdatesPage
              key={project.id}
              workspaceProject={project}
            />
          </section>

          <section
            aria-labelledby="pd-progress-monthly-reports"
            hidden={activeTab !== "monthly-reports"}
          >
            <MonthlyReportsPage
              key={project.id}
              workspaceProject={project}
            />
          </section>
        </section>

        <section
          aria-labelledby="pd-nav-team"
          hidden={activeTab !== "team"}
        >
          {activeTab === "team" && (
            <ProjectMembers
              key={`${project.id}-${workspace?.user?.id}`}
              project={project}
              userId={workspace?.user?.id}
              isCompanyAdmin={isCompanyAdmin}
              companyApproved={
                company?.verification_status === "approved"
              }
            />
          )}
        </section>

        <footer className="pd-footer">
          <span>Buildora · Build with clarity.</span>
        </footer>
      </main>
    </div>
  );
}