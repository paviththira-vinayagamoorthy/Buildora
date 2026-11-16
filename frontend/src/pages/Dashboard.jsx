import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Camera,
  Circle,
  FileText,
  FolderKanban,
  Info,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  LockKeyhole,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  UserRound,
  X,
  Pencil,
Archive,
Trash2,
RotateCcw,
} from "lucide-react";

import {
  createOrganization,
  createProject,
  getWorkspaceContext,
  getProjectDocuments,
  updateProjectCover,
  updateProject,
deleteProject,
archiveProject,
restoreProject,
} from "../services/workspaceApi";

import WorkspaceSidebar from "../components/layout/WorkspaceSidebar";

import logo from "../assets/buildora-logo.png";
import projectPhoto from "../assets/buildora-hero.png";

import "../styles/Dashboard.css";
import "../styles/DashboardPlatformTheme.css";



const SRI_LANKA_DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa",
  "Colombo", "Galle", "Gampaha", "Hambantota",
  "Jaffna", "Kalutara", "Kandy", "Kegalle",
  "Kilinochchi", "Kurunegala", "Mannar", "Matale",
  "Matara", "Monaragala", "Mullaitivu",
  "Nuwara Eliya", "Polonnaruwa", "Puttalam",
  "Ratnapura", "Trincomalee", "Vavuniya"
];


/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const STATUS_LABELS = {
  unsubmitted: "Unverified",
  pending: "Under review",
  approved: "Verified",
  rejected: "Changes required",
};

/* =========================================================
   HELPERS
========================================================= */

function getToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function messageFrom(error) {
  const detail =
    error?.response?.data?.detail || error?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return (
      detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(", ") || "Unable to complete the request."
    );
  }

  return error?.message || "Unable to complete the request.";
}

function roleLabel(role) {
  return (
    {
      organization_admin: "Company Admin",
      building_owner: "Building Owner",
      owner: "Building Owner",
      qs: "Quantity Surveyor",
      staff: "Member",
    }[role] || "Company access"
  );
}

async function getCompanies() {
  const token = getToken();

  if (!token) {
    throw new Error(
      "Your session expired. Please sign in again."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/organizations/`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Unable to load company verification status."
    );
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

function signOut() {
  for (const key of [
    "buildora_access_token",
    "buildora_refresh_token",
    "buildora_user",
    "buildora_active_organization",
    "buildora_active_project",
    "buildora_invitation_return",
  ]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  window.location.assign("/");
}

function invitationLabel(invitation) {
  if (
    invitation.revoked_at ||
    invitation.status === "revoked"
  ) {
    return "Cancelled";
  }

  if (invitation.status !== "pending") {
    return invitation.status || "Unavailable";
  }

  if (!invitation.expires_at) {
    return "New email link required";
  }

  const raw = String(invitation.expires_at);

  const date = new Date(
    /(Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? raw
      : `${raw}Z`
  );

  if (Number.isNaN(date.getTime())) {
    return "Check your email";
  }

  return date.getTime() <= Date.now()
    ? "Expired"
    : "Pending";
}

/* =========================================================
   MODAL
========================================================= */

function Modal({
  title,
  busy = false,
  onClose,
  children,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      dialog?.close();
      previous?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bd-modal"
      aria-labelledby="bd-modal-title"
      onCancel={(event) => {
        event.preventDefault();

        if (!busy) onClose();
      }}
    >
      <div className="bd-modal-heading">
        <h2 id="bd-modal-title">{title}</h2>

        <button
          type="button"
          className="bd-icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      {children}
    </dialog>
  );
}

/* =========================================================
   PROJECT CARD
========================================================= */

function ProjectCard({
  project,
  company,
  onOpen,
  onManage,
}) {
const [updatedCover, setUpdatedCover] = useState(null);
const [savingCover, setSavingCover] = useState(false);
const coverInputRef = useRef(null);
const [coverError, setCoverError] = useState("");
const cover = updatedCover ?? project.cover_image;

async function changeCover(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    setCoverError("Choose a JPG, PNG or WebP photo up to 2 MB.");
    return;
  }

  setCoverError("");
  setSavingCover(true);

  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Couldn't read the photo."));
      reader.readAsDataURL(file);
    });

    const result = await updateProjectCover(project.id, image);
    setUpdatedCover(result.cover_image);
  } catch (error) {
    setCoverError(error.message || "Couldn't update the photo.");
  } finally {
    setSavingCover(false);
  }
}
  const value = project.progress_percentage;

  const progress =
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100
      ? Number(value)
      : null;

  const status = project.status || "unknown";

  return (
    <article className="bd-project-card">
      <div className="bd-project-image">
{cover ? (
  <img src={cover} alt="" loading="lazy" />) : (
  <div className="bd-project-blueprint" aria-hidden="true">
    <Building2 size={60} strokeWidth={1.1} />
  </div>
)}

{project.project_role === "organization_admin" && (
  <>
    <input
      ref={coverInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={changeCover}
      disabled={savingCover}
      hidden
    />

    <button
      type="button"
      className="bd-cover-action"
      onClick={() => coverInputRef.current?.click()}
      disabled={savingCover}
      aria-label={cover ? "Change project photo" : "Add project photo"}
      title={cover ? "Change photo" : "Add photo"}
    >
      {savingCover ? "…" : <Camera size={18} aria-hidden="true" />}
    </button>
  </>
)}
        <span
          className={`bd-status ${
            status === "active" ? "bd-status-active" : ""
          }`}
        >
          {status}
        </span>
      </div>

      <div className="bd-project-body">
        <p className="bd-project-company">
          {company?.name ||
            project.organization_name ||
            project.organization?.name ||
            "Company project"}
        </p>

        <h3>
          <button
            type="button"
            onClick={() => onOpen(project)}
          >
            {project.name || `Project #${project.id}`}
          </button>
        </h3>

        <p className="bd-project-location">
          <MapPin size={14} aria-hidden="true" />
          {project.location || "Location not recorded"}
        </p>

        <div className="bd-progress">
          <div className="bd-progress-label">
            <span>Project progress</span>

            <strong>
              {progress === null
                ? "Not updated"
                : `${progress}%`}
            </strong>
          </div>

          {progress === null ? (
            <div
              className="bd-progress-track"
              aria-hidden="true"
            />
          ) : (
            <div
              className="bd-progress-track"
              role="progressbar"
              aria-label={`${project.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

{coverError && <p role="alert">{coverError}</p>}
        <div className="bd-project-footer">
          <span>{roleLabel(project.project_role)}</span>


{project.project_role === "organization_admin" && (
  <details className="bd-project-menu">
    <summary
      aria-label="Project options"
      title="Project options"
    >
      <span aria-hidden="true">⋯</span>
    </summary>


<div className="bd-project-menu-options">
  {project.status !== "archived" && (
    <>
      <button
        type="button"
        className="bd-project-menu-item"
        onClick={() => onManage("edit", project)}
      >
        <Pencil size={16} strokeWidth={1.8} />
        <span>Edit project</span>
      </button>

      <button
        type="button"
        className="bd-project-menu-item"
        onClick={() => onManage("archive", project)}
      >
        <Archive size={16} strokeWidth={1.8} />
        <span>Archive project</span>
      </button>
    </>
  )}

{project.status === "archived" && (
  <button
    type="button"
    className="bd-project-menu-item"
    onClick={() => onManage("restore", project)}
  >
    <RotateCcw size={16} strokeWidth={1.8} />
    <span>Restore project</span>
  </button>
)}


  <div className="bd-project-menu-divider" />

  <button
    type="button"
    className="bd-project-menu-item bd-project-menu-danger"
    onClick={() => onManage("delete", project)}
  >
    <Trash2 size={16} strokeWidth={1.8} />
    <span>Delete project</span>
  </button>
</div>

  </details>
)}

          <button
            type="button"
            className="bd-open-project"
            onClick={() => onOpen(project)}
            aria-label={`Open ${project.name || "project"}`}
          >
            Open
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);  const [error, setError] = useState("");
  const [cachedProfile, setCachedProfile] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [view, setView] = useState("grid");

  const [dismissedBanners, setDismissedBanners] = useState({});

  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const [companyName, setCompanyName] = useState("");

  const [projectCover, setProjectCover] = useState(null);
const [projectForm, setProjectForm] = useState({
  organization_id: "",
  name: "",
  district: "",
  address: "",
  description: "",
});
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const actionRef = useRef(false);

  const workspaceReady = context !== null;

  const loadContext = useCallback(async () => {
    const requestId = ++requestRef.current;

    setRefreshing(true);
    setError("");

    try {
      const [workspace, companies] = await Promise.all([
        getWorkspaceContext(),
        getCompanies(),
      ]);

      if (
        !mountedRef.current ||
        requestId !== requestRef.current
      ) {
        return;
      }

      if (!workspace?.user) {
        throw new Error("Unable to confirm your account.");
      }

      const companyMap = new Map(
        companies.map((company) => [
          String(company.id),
          company,
        ])
      );

      const memberships = Array.isArray(workspace.organizations)
        ? workspace.organizations
        : [];

      setContext({
        ...workspace,
        projects: Array.isArray(workspace.projects)
          ? workspace.projects
          : [],
        pending_invitations: Array.isArray(
          workspace.pending_invitations
        )
          ? workspace.pending_invitations
          : [],
        organizations: memberships.map((membership) => ({
          ...membership,
          ...companyMap.get(String(membership.id)),
          member_role: membership.member_role,
          verification_status:
            companyMap.get(String(membership.id))
              ?.verification_status || null,
        })),
      });
    } catch (err) {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setError(messageFrom(err));
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    void loadContext();

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [loadContext]);

  useEffect(() => {
    function refreshProfile() {
      try {
        const raw =
          localStorage.getItem("buildora_user") ||
          sessionStorage.getItem("buildora_user");

        const saved = raw ? JSON.parse(raw) : null;

        setCachedProfile(
          saved &&
            String(saved.id) === String(context?.user?.id)
            ? saved
            : null
        );
      } catch {
        setCachedProfile(null);
      }
    }

    refreshProfile();

    window.addEventListener(
      "buildora-profile-updated",
      refreshProfile
    );

    return () => {
      window.removeEventListener(
        "buildora-profile-updated",
        refreshProfile
      );
    };
  }, [context?.user?.id]);

  /* Sidebar navigation: Dashboard / Projects / Companies */

  useEffect(() => {
    if (!workspaceReady) return;

    const targetId =
      location.hash === "#projects"
        ? "projects"
        : location.hash === "#companies"
          ? "companies"
          : "dashboard-top";

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    location.pathname,
    location.hash,
    workspaceReady,
  ]);

  const organizations = context?.organizations || [];
  const projects = context?.projects || [];
  const invitations = context?.pending_invitations || [];
  const showGettingStarted =
  organizations.length === 0 &&
  projects.length === 0 &&
  invitations.length === 0;

  const adminCompanies = organizations.filter(
    (company) =>
      company.member_role === "organization_admin"
  );

  const approvedCompanies = adminCompanies.filter(
    (company) =>
      company.verification_status === "approved"
  );

  const canCreateProject = approvedCompanies.length > 0;
  

const verificationCompany = adminCompanies.find(
  (company) => company.verification_status !== "approved"
);

const isVerificationPending =
  verificationCompany?.verification_status === "pending";

const showProjectOnboarding =
  projects.length === 0 && adminCompanies.length > 0;


  const user = cachedProfile || context?.user;
  const fullName = cleanText(user?.full_name) || "Buildora User";
  const firstName = fullName.split(" ")[0];

  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const companyById = new Map(
    organizations.map((company) => [
      String(company.id),
      company,
    ])
  );

  const statuses = [
    ...new Set(
      projects
        .map((project) => project.status)
        .filter(Boolean)
    ),
  ].sort();

  const query = search.trim().toLowerCase();

  const filteredProjects = projects.filter((project) => {
    const company = companyById.get(
      String(project.organization_id)
    );

    const text = [
      project.name,
      project.location,
      company?.name,
      project.organization_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (filter === "all" || project.status === filter) &&
      (!query || text.includes(query))
    );
  });

    const [documentCount, setDocumentCount] = useState(null);

  useEffect(() => {
    if (!context) return;

    const projectIds = [
      ...new Set((context.projects ?? []).map((project) => project.id)),
    ];

    if (projectIds.length === 0) {
      setDocumentCount(0);
      return;
    }

    let cancelled = false;
    setDocumentCount(null);

    async function loadDocumentCount() {
      try {
        const lists = await Promise.all(
          projectIds.map((id) => getProjectDocuments(id))
        );

        if (lists.some((list) => !Array.isArray(list))) {
          throw new Error("Invalid documents response.");
        }

        if (!cancelled) {
          setDocumentCount(
            lists.reduce((total, list) => total + list.length, 0)
          );
        }
      } catch {
        if (!cancelled) setDocumentCount("unavailable");
      }
    }

    void loadDocumentCount();

    return () => {
      cancelled = true;
    };
  }, [context]);
  const stats = [
    {
      label: "Projects",
      value: projects.length,
      Icon: FolderKanban,
      note: "Across your workspace",
    },
    {
      label: "Active",
      value: projects.filter(
        (item) => item.status === "active"
      ).length,
      Icon: CheckCircle2,
      note: "Projects in progress",
    },
{
  label: "Pending invitations",
  value: invitations.length,
  Icon: Bell,
  note: "Open the bell to view invitations",
},
    {
      label: "Documents",
      value: documentCount ?? "…",
      Icon: FileText,
      note: "Across your accessible projects",
      ...(documentCount === "unavailable"
        ? { value: "—", note: "Could not load document count" }
        : {}),
    },
  ];

  function openVerification(id) {
    navigate(`/organizations/${id}/verification`);
  }

  function openProject(project) {
    saveProjectSelection(project);
    navigate(`/projects/${project.id}`);
  }


function openStat(label) {
  if (label === "Pending invitations") {
    setModal({ type: "invitations" });
    return;
  }

  setSearch("");
  setFilter(label === "Active" ? "active" : "all");

  document.getElementById("projects")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}


async function handleEditProject(event) {
  event.preventDefault();

  if (actionRef.current || !modal?.project) return;

  const project = modal.project;
  const name = cleanText(projectForm.name);
  const district = cleanText(projectForm.district);
  const address = cleanText(projectForm.address);
  const description = cleanText(projectForm.description);

  if (name.length < 2 || name.length > 150) {
    setModalError("Project name must be 2 to 150 characters.");
    return;
  }

  if (!SRI_LANKA_DISTRICTS.includes(district)) {
    setModalError("Please select a valid district.");
    return;
  }

  const location = address
    ? `${address}, ${district}`
    : district;

  if (location.length > 255) {
    setModalError("Location must be within 255 characters.");
    return;
  }

  if (
    description.length < 15 ||
    description.length > 2000 ||
    description.split(/\s+/).length < 3
  ) {
    setModalError(
      "Description must contain at least 15 characters and 3 words."
    );
    return;
  }

  actionRef.current = true;
  setBusy(true);
  setModalError("");

  try {
    await updateProject(project.id, {
      name,
      location,
      description,
    });

    await loadContext();

    setModal(null);
  } catch (err) {
    setModalError(messageFrom(err));
  } finally {
    actionRef.current = false;
    setBusy(false);
  }
}



async function handleManageProject() {
  if (actionRef.current || !modal?.project) return;

  const { action, project } = modal;

  if (
    action === "delete" &&
    deleteConfirmation !== project.name
  ) {
    setModalError("Type the project name exactly.");
    return;
  }

  actionRef.current = true;
  setBusy(true);
  setModalError("");

  try {
    if (action === "archive") {
      await archiveProject(project.id);
    } else if (action === "restore") {
      await restoreProject(project.id);
    } else if (action === "delete") {
      await deleteProject(project.id, deleteConfirmation);
    } else {
      throw new Error("Invalid project action.");
    }

    setModal(null);
    setDeleteConfirmation("");
    await loadContext();
  } catch (err) {
    setModalError(messageFrom(err));
  } finally {
    actionRef.current = false;
    setBusy(false);
  }
}


  function closeModal() {
    if (actionRef.current) return;

    setModal(null);
    setModalError("");
  }

  function openCompanyModal() {
    if (actionRef.current) return;

    setCompanyName("");
    setModalError("");
    setModal({ type: "company" });
  }

  function openProjectModal() {
    if (!canCreateProject || actionRef.current) return;

    setProjectForm({
  organization_id: String(approvedCompanies[0].id),
  name: "",
  district: "",
  address: "",
  description: "",
});
    setModalError("");
    setProjectCover(null);
    setModal({ type: "project" });
  }

  async function handleCreateCompany(event) {
    event.preventDefault();

    if (actionRef.current) return;

    const name = cleanText(companyName);

    if (
      name.length < 2 ||
      name.length > 150 ||
      !/[\p{L}\p{N}]/u.test(name)
    ) {
      setModalError(
        "Enter a company name with 2 to 150 characters."
      );
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setModalError("");

    try {
      const company = await createOrganization(name);

      if (
        !Number.isInteger(company?.id) ||
        company.id <= 0
      ) {
        throw new Error(
          "Creation could not be confirmed. Refresh your companies before retrying."
        );
      }

      if (!mountedRef.current) return;

      setModal(null);
      openVerification(company.id);
    } catch (err) {
      if (mountedRef.current) {
        setModalError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy(false);
    }
  }

  async function handleCreateProject(event) {
    event.preventDefault();

    if (actionRef.current) return;

    const company = approvedCompanies.find(
      (item) =>
        String(item.id) === projectForm.organization_id
    );

    const name = cleanText(projectForm.name);
    const district = cleanText(projectForm.district);
const address = cleanText(projectForm.address);

const projectLocation = address
  ? `${address}, ${district}`
  : district;
    const description = cleanText(projectForm.description);

    if (!company) {
      setModalError("Select an approved company.");
      return;
    }

    if (
      name.length < 2 ||
      name.length > 150 ||
      !/\p{L}/u.test(name)
    ) {
      setModalError(
        "Enter a project name with letters and 2 to 150 characters."
      );
      return;
    }

if (!SRI_LANKA_DISTRICTS.includes(district)) {
  setModalError("Please select a valid district.");
  return;
}

if (
  projectLocation.length > 255 ||
  (address && !/\p{L}/u.test(address))
) {
  setModalError(
    "Enter a valid detailed address within 255 characters."
  );
  return;
}

    if (
      description.length < 15 ||
      description.length > 2000 ||
      description.split(/\s+/).length < 3 ||
      !/\p{L}/u.test(description)
    ) {
      setModalError(
        "Describe the project using at least 15 characters and three words, up to 2000 characters."
      );
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setModalError("");

    try {
      const project = await createProject(company.id, {
        name,
        location: projectLocation,
        description,
        cover_image: projectCover,
      });

      if (
        !Number.isInteger(project?.id) ||
        project.id <= 0
      ) {
        throw new Error(
          "Creation could not be confirmed. Refresh your projects before retrying."
        );
      }

      if (!mountedRef.current) return;

      saveProjectSelection({
        ...project,
        organization_id:
          project.organization_id || company.id,
      });

      setModal(null);

      navigate(`/projects/${project.id}`, {
        state: {
          projectCreated: {
            projectId: String(project.id),
            name: project.name || name,
          },
        },
      });
    } catch (err) {
      if (mountedRef.current) {
        setModalError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setBusy(false);
    }
  }

  function updateProjectField(event) {
    const { name, value } = event.target;

    setProjectForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  if (!context) {
    return (
      <main className="bd-initial-state">
        {loading ? (
          <>
            <Loader2
              size={24}
              className="bd-spin"
              aria-hidden="true"
            />
            <p role="status">Opening your workspace…</p>
          </>
        ) : (
          <div className="bd-empty">
            <h1>Unable to open your workspace</h1>
            <p role="alert">{error}</p>

            <div className="bd-inline-actions">
              <button
                type="button"
                className="bd-button bd-primary"
                onClick={loadContext}
                disabled={refreshing}
              >
                Try again
              </button>

              <button
                type="button"
                className="bd-button"
                onClick={() => navigate("/")}
              >
                Go to home
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="bd-shell">
      <header className="bd-topbar">
        <img
          className="bd-logo"
          src={logo}
          alt="Buildora"
        />
        <div className="bd-topbar-actions">
          <button
            type="button"
            className="bd-icon-button bd-notification"
            aria-label={`View invitations. ${invitations.length} listed.`}
            onClick={() => setModal({ type: "invitations" })}
          >
            <Bell size={19} aria-hidden="true" />

            {invitations.length > 0 && (
              <span>{invitations.length}</span>
            )}
          </button>

<details className="bd-account-dropdown">
  <summary className="bd-profile">
    <span className="bd-avatar">
      {user?.photo_data ? (
        <img src={user.photo_data} alt="" />
      ) : (
        initials
      )}
    </span>

    <span className="bd-profile-copy">
      <strong>{fullName}</strong>
      <small>My account</small>
    </span>

<span className="bd-account-chevron" aria-hidden="true" />
  </summary>

  <div className="bd-account-card">
    <button
      type="button"
      className="bd-account-action"
      onClick={(event) => {
        event.currentTarget.closest("details").open = false;
        window.dispatchEvent(new Event("buildora-open-profile"));
      }}
    >
<UserRound size={18} aria-hidden="true" />
<span>My Profile</span>
    </button>

    <button
      type="button"
      className="bd-account-action bd-logout" 
      onClick={(event) => {
        event.currentTarget.closest("details").open = false;
        setModal({ type: "logout" });
      }}
    >
<LogOut size={18} aria-hidden="true" />
<span>Sign out</span>
    </button>
  </div>
</details>
        </div>
      </header>

      <div className="bd-layout">
<WorkspaceSidebar
  hasProjectAccess={projects.length > 0}
  user={user}
  canManageBilling={adminCompanies.length > 0}
/>

        <main className="bd-main">
          <div className="bd-content">
            {!showGettingStarted && (
            <header
              id="dashboard-top"
              className="bd-welcome"
            >
              <div>
                <h1>Welcome back, {firstName}.</h1>
                <p>
                  {showGettingStarted
  ? "Choose how you want to get started."
  : "Everything you need to move your projects forward."}
                </p>
              </div>

              <div className="bd-inline-actions">

                {adminCompanies.length > 0 && (




<div className="bd-project-action">
  <button
    type="button"
    className="bd-button bd-primary bd-new-project"
    disabled={refreshing}
    onClick={() => {
      if (canCreateProject) {
        openProjectModal();
      } else if (verificationCompany) {
        openVerification(verificationCompany.id);
      } else {
        openCompanyModal();
      }
    }}
    title={
      canCreateProject
        ? "Create a new project"
        : "Complete company verification to create projects"
    }
  >
    <Plus size={17} aria-hidden="true" />
    New project
    {!canCreateProject && (
      <ArrowRight size={15} aria-hidden="true" />
    )}
  </button>

  {!canCreateProject && (
    <small className="bd-project-action-help">
      Company verification required
    </small>
  )}
</div>


     )}

                {organizations.length === 0 && !showGettingStarted && (
                  <button
                    type="button"
                    className="bd-button bd-primary"
                    onClick={openCompanyModal}
                  >
                    <Plus size={17} aria-hidden="true" />
                    Register company
                  </button>
                )}
              </div>
            </header>
            )}

            {error && (
              <div
                className="bd-alert bd-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {adminCompanies
  .filter(
    (company) =>
      company.verification_status !== "approved" &&
      projects.length > 0
  )
  .map((company) => {
                const bannerKey = [
                  company.id,
                  company.verification_status,
                  company.reviewed_at,
                  company.updated_at,
                ].join(":");

                if (dismissedBanners[bannerKey]) return null;

                const pending =
                  company.verification_status === "pending";

                return (
                  <div
                    className="bd-verification"
                    key={company.id}
                  >
                    <TriangleAlert
                      size={19}
                      aria-hidden="true"
                    />

                    <div>
                      <strong>
                        {company.name}
                        {" · "}
                        {STATUS_LABELS[
                          company.verification_status
                        ] || "Verification status unavailable"}
                      </strong>

                      <p>
                        {pending
                          ? "Your company submission is under review."
                          : "Complete company verification to create new projects."}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="bd-text-button"
                      onClick={() =>
                        openVerification(company.id)
                      }
                    >
{pending ? "View verification status" : "Verify company"}

                      <ArrowRight
                        size={15}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      className="bd-icon-button"
                      aria-label={`Dismiss ${company.name} verification notice`}
                      onClick={() =>
                        setDismissedBanners((current) => ({
                          ...current,
                          [bannerKey]: true,
                        }))
                      }
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
 
           {showGettingStarted ? (
  <section id="dashboard-top" className="bd-setup" aria-label="Welcome to Buildora">
  <header className="bd-setup-welcome">
  <div className="bd-setup-welcome-row">
    <h1>Welcome to Buildora, {firstName}!</h1>
  </div>

  <p>
    <strong>Register your company</strong> to set up a workspace, or{" "}
    <strong>join a project</strong> using your invitation link.
  </p>
</header>
  <div className="bd-setup-grid">
    <article className="bd-setup-card bd-setup-primary" id="companies">
      <div className="bd-setup-card-heading">
        <span className="bd-setup-icon" aria-hidden="true">
          <Building2 size={26} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Register your company</h2>
        </div>
      </div>

      <ol className="bd-setup-steps" role="list">
        <li>Add company details</li>
        <li>Upload verification documents</li>
        <li>Create your first project after approval</li>
      </ol>

      <button
        type="button"
        className="bd-button bd-primary bd-setup-button"
        onClick={openCompanyModal}
      >
        Register company <ArrowRight size={17} aria-hidden="true" />
      </button>
    </article>

    <article className="bd-setup-card" id="projects">
      <div className="bd-setup-card-heading">
        <span className="bd-setup-icon" aria-hidden="true">
          <Mail size={26} strokeWidth={1.8} />
        </span>
        <div>
          <h2>Join an invited project</h2>
        </div>
      </div>

      <ol className="bd-setup-steps" role="list">
        <li>Open your invitation email</li>
        <li>Click the invite link</li>
        <li>Sign in with the invited email</li>
      </ol>

      <button
        type="button"
        className="bd-button bd-setup-button bd-setup-outline"
        onClick={() => setModal({ type: "invitations" })}
      >
       Check my invitations <ArrowRight size={17} aria-hidden="true" />
      </button>
    </article>
  </div>

<p className="bd-setup-help">
  <strong>Need help?</strong>{" "}
  Ask your project admin to resend the invitation.
</p>
</section>
) : (
  <>
{projects.length > 0 && (
  <section
    className="bd-stats"
    aria-label="Workspace summary"
  >

{stats.map(({ label, value, Icon, note }) => (
  <button
    type="button"
    className="bd-stat bd-stat-action"
    key={label}
    onClick={() => openStat(label)}
    aria-label={
      label === "Documents"
        ? "Browse projects to open their documents"
        : `Open ${label.toLowerCase()}`
    }
  >
    <div className="bd-stat-top">
      <span>{label}</span>

      <span className="bd-stat-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
    </div>

    <strong className={value === 0 ? "bd-stat-zero" : ""}>
      {value}
    </strong>

    <span className="bd-stat-bottom">
      <span>
        {label === "Documents"
          ? "Choose a project to view files"
          : note}
      </span>

      <ArrowRight size={16} aria-hidden="true" />
    </span>
  </button>
))}

  </section>
)}

<section
  id="projects"
  className="bd-projects-section"
  aria-label={projects.length === 0 ? "Workspace setup" : undefined}
  aria-labelledby={
    projects.length > 0 ? "dashboard-projects-title" : undefined
  }
>
  {projects.length > 0 && (
  <div className="bd-section-toolbar">
    <div>
      <h2 id="dashboard-projects-title">
        Your projects
      </h2>

<p>Manage and track your construction projects.</p>
</div>
{projects.length > 0 && (
  <div className="bd-project-controls">
                  <label className="bd-search">
                    <Search
                      size={17}
                      aria-hidden="true"
                    />

                    <input
                      type="search"
                      value={search}
                      placeholder="Search projects…"
                      aria-label="Search projects"
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                    />
                  </label>

                  <select
                    className="bd-filter"
                    aria-label="Filter projects by status"
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value)
                    }
                  >
                    <option value="all">All statuses</option>

                    {statuses.map((status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    ))}
                  </select>

                  <div
                    className="bd-view-toggle"
                    aria-label="Project view"
                  >
                    <button
                      type="button"
                      aria-label="Grid view"
                      aria-pressed={view === "grid"}
                      onClick={() => setView("grid")}
                    >
                      <LayoutGrid
                        size={17}
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      aria-label="List view"
                      aria-pressed={view === "list"}
                      onClick={() => setView("list")}
                    >
                      <List
                        size={18}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
            )}
            </div>
          )}

            {filteredProjects.length > 0 ? (
                <div
                  className={`bd-projects bd-projects-${view}`}
                >
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      company={companyById.get(
                        String(project.organization_id)
                      )}
                      onOpen={openProject}

onManage={(action, project) => {
  setModalError("");
  setDeleteConfirmation("");

  if (action === "edit") {
    const location = project.location || "";
    const parts = location.split(",");
    const district = parts.pop()?.trim() || "";
    const address = parts.join(",").trim();

    setProjectForm({
      organization_id: String(project.organization_id),
      name: project.name || "",
      district,
      address,
      description: project.description || "",
    });

    setModal({ type: "editProject", project });
    return;
  }

  setModal({ type: "manageProject", action, project });
}}

                    />
                  ))}
                </div>
              ) : (
         <div
  className={`bd-empty ${
    !projects.length ? "bd-empty-onboarding" : ""
  }`}
>
  {projects.length > 0 ? (
    <>
      <FolderKanban size={28} aria-hidden="true" />

      <h3>No matching projects</h3>
      <p>Try a different search or status filter.</p>

      <button
        type="button"
        className="bd-button"
        onClick={() => {
          setSearch("");
          setFilter("all");
        }}
      >
        Clear filters
      </button>
    </>
  ) : (
    <div className="bd-onboarding-layout">
      <div className="bd-onboarding-intro">
        <span className="bd-onboarding-eyebrow">YOUR NEXT STEP</span>
        <h3>
          {canCreateProject
            ? "Ready for your first project"
            : "Set up your workspace"}
        </h3>

        <p>
          {canCreateProject
            ? "Your company is verified. Create a project to start managing your work."
            : isVerificationPending
              ? "Your company verification is under review. You can track its progress here."
              : "Complete company verification to unlock project creation."}
        </p>
       

{!canCreateProject && verificationCompany && (
  <ol
    className="bd-onboarding-checklist"
    aria-label="Verification steps"
  >
    <li>Add your company details</li>
    <li>Upload registration documents</li>
    <li>Submit and get approved</li>
  </ol>
)}

        {verificationCompany ? (
          <button
            type="button"
            className="bd-button bd-primary bd-onboarding-cta"
            onClick={() =>
              openVerification(verificationCompany.id)
            }
          >
            {isVerificationPending
              ? "View verification status"
              : "Verify company"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : canCreateProject ? (
          <button
            type="button"
            className="bd-button bd-primary bd-onboarding-cta"
            onClick={openProjectModal}
          >
            <Plus size={16} aria-hidden="true" />
            Create first project
          </button>
        ) : null}
      </div>

      {showProjectOnboarding && (
        <div
          className="bd-onboarding-progress"
          aria-label="Workspace setup steps"
        >
          <span className="bd-onboarding-progress-title">
            SETUP PROGRESS
          </span>


{verificationCompany ? (
  <button
    type="button"
    className={`bd-onboarding-step bd-onboarding-step-button ${
      canCreateProject ? "is-complete" : "is-current"
    }`}
    onClick={() =>
      openVerification(verificationCompany.id)
    }
    aria-label="Open company verification"
  >
    {canCreateProject ? (
      <CheckCircle2 size={18} aria-hidden="true" />
    ) : (
      <Circle size={18} aria-hidden="true" />
    )}

    <span>Company verification</span>

    <small>
      {isVerificationPending ? "Under review" : "Current"}
    </small>

    <ArrowRight size={15} aria-hidden="true" />
  </button>
) : (
  <div className="bd-onboarding-step is-complete">
    <CheckCircle2 size={18} aria-hidden="true" />
    <span>Company verification</span>
    <small>Complete</small>
  </div>
)}


          <div
            className={`bd-onboarding-step ${
              canCreateProject ? "is-current" : "is-upcoming"
            }`}
          >
            <Circle size={18} aria-hidden="true" />
            <span>Create first project</span>
            <small>
              {canCreateProject ? "Next" : "Upcoming"}
            </small>
          </div>

          <div className="bd-onboarding-step is-upcoming">
            <Circle size={18} aria-hidden="true" />
            <span>Invite your team</span>
            <small>Later</small>
          </div>
        </div>
      )}
    </div>
  )}
</div>
              )}
            </section>

            <section
              id="companies"
              className="bd-companies-section"
              aria-labelledby="dashboard-companies-title"
            >
              <div className="bd-section-toolbar">
                <div>
                  <h2 id="dashboard-companies-title">
                    Your companies
                  </h2>
                  <p>Company details and verification status</p>
                </div>

                <button
                  type="button"
                  className="bd-button"
                  onClick={openCompanyModal}
                  disabled={refreshing}
                >
                  <Plus size={16} aria-hidden="true" />
                  {organizations.length
                    ? "Add company"
                    : "Register company"}
                </button>
              </div>

              <div className="bd-companies">
                {organizations.map((company) => {
                  const count = projects.filter(
                    (project) =>
                      String(project.organization_id) ===
                      String(company.id)
                  ).length;

                  const admin =
                    company.member_role === "organization_admin";

                  return (
                    <article
                      className="bd-company-row"
                      key={company.id}
                    >
                      <span className="bd-company-icon">
                        <Building2
                          size={21}
                          aria-hidden="true"
                        />
                      </span>

                      <div className="bd-company-copy">
                        <h3>{company.name}</h3>
                        <p>
                          {roleLabel(company.member_role)}
                          {" · "}
                          {count} accessible projects
                        </p>
                      </div>

                      <span
                        className={`bd-company-status ${
                          company.verification_status === "approved"
                            ? "bd-company-verified"
                            : ""
                        }`}
                      >
                        {STATUS_LABELS[
                          company.verification_status
                        ] || "Status unavailable"}
                      </span>


                      <button
                        type="button"
                        className="bd-text-button"
                        onClick={() =>
                          admin
                            ? openVerification(company.id)
                            : setModal({
                                type: "details",
                                company,
                              })
                        }
                      >
                        Details
                        <ArrowRight
                          size={15}
                          aria-hidden="true"
                        />
                      </button>
                    </article>
                  );
                })}
              </div>

              {organizations.length === 0 && (
                <p className="bd-muted">
                  Register your construction company,
                  or join an invited project.
                </p>
              )}
            </section>
  </>
)}

<footer className="bd-footer">
  <span>© {new Date().getFullYear()} Buildora</span>
</footer>
          </div>
        </main>
      </div>

      {modal?.type === "company" && (
        <Modal
          title="Register your company"
          busy={busy}
          onClose={closeModal}
        >
          <p className="bd-modal-description">
            Start with your company name. Next, complete its
            details, email verification and registration document.
          </p>

          <form onSubmit={handleCreateCompany}>
            <fieldset
              disabled={busy}
              className="bd-form-fields"
            >
              <label>
                Company name
                <input
                  autoFocus
                  required
                  minLength={2}
                  maxLength={150}
                  value={companyName}
                  onChange={(event) =>
                    setCompanyName(event.target.value)
                  }
                  placeholder="Your construction company"
                />
              </label>

              {modalError && (
                <p
                  className="bd-form-error"
                  role="alert"
                >
                  {modalError}
                </p>
              )}

              <div className="bd-modal-actions">
                <button
                  type="button"
                  className="bd-button"
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bd-button bd-primary"
                >
                  {busy ? "Creating…" : "Continue"}
                  {!busy && (
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}


{modal?.type === "editProject" && (
  <Modal
    title="Edit Project"
    busy={busy}
    onClose={closeModal}
  >
    <form onSubmit={handleEditProject}>
      <div className="bd-form-grid">
        <label>
          Project name *
          <input
            type="text"
            required
            minLength={2}
            maxLength={150}
            value={projectForm.name}
            disabled={busy}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                name: event.target.value,
              }))
            }
          />
        </label>

        <label>
          District *
          <select
            required
            value={projectForm.district || ""}
            disabled={busy}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                district: event.target.value,
              }))
            }
          >
            <option value="">Select district</option>
            {SRI_LANKA_DISTRICTS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>

        <label>
          Detailed address (optional)
          <textarea
            rows={2}
            value={projectForm.address || ""}
            disabled={busy}
            placeholder="House no, street, town or landmark..."
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                address: event.target.value,
              }))
            }
          />
        </label>

        <label>
          Description *
          <textarea
            rows={4}
            required
            minLength={15}
            maxLength={2000}
            value={projectForm.description}
            disabled={busy}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                description: event.target.value,
              }))
            }
          />
        </label>
      </div>

      {modalError && (
        <p className="bd-form-error" role="alert">
          {modalError}
        </p>
      )}

      <div className="bd-modal-actions">
        <button
          type="button"
          className="bd-button"
          disabled={busy}
          onClick={closeModal}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="bd-button bd-primary"
          disabled={busy}
        >
          {busy ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  </Modal>
)}



{modal?.type === "manageProject" && (
  <Modal
    title={
      modal.action === "delete"
        ? "Delete project?"
        : modal.action === "restore"
          ? "Restore project?"
          : "Archive project?"
    }
    busy={busy}
    onClose={closeModal}
  >
    <p className="bd-modal-description">
      {modal.action === "delete"
        ? `Permanently delete "${modal.project.name}"? This cannot be undone. Projects with linked records must be archived instead.`
        : modal.action === "restore"
          ? `Restore "${modal.project.name}"? This project will become active again.`
          : `Archive "${modal.project.name}"? Its records will be preserved.`}
    </p>

    {modal.action === "delete" && (
      <label className="bd-delete-confirm-label">
        Type <strong>{modal.project.name}</strong> to confirm
        <input
          type="text"
          value={deleteConfirmation}
          disabled={busy}
          autoComplete="off"
          placeholder="Enter exact project name"
          onChange={(event) =>
            setDeleteConfirmation(event.target.value)
          }
        />
      </label>
    )}

    {modalError && (
      <p className="bd-form-error" role="alert">
        {modalError}
      </p>
    )}

    <div className="bd-modal-actions">
      <button
        type="button"
        className="bd-button"
        disabled={busy}
        onClick={closeModal}
      >
        Cancel
      </button>

      <button
        type="button"
        className={
          modal.action === "delete"
            ? "bd-button bd-danger-button"
            : "bd-button bd-primary"
        }
        disabled={
          busy ||
          (modal.action === "delete" &&
            deleteConfirmation !== modal.project.name)
        }
        onClick={handleManageProject}
      >
        {busy
          ? "Please wait..."
          : modal.action === "delete"
            ? "Delete project"
            : modal.action === "restore"
              ? "Restore project"
              : "Archive project"}
      </button>
    </div>
  </Modal>
)}


      {modal?.type === "project" && (
        <Modal
          title="Create a project"
          busy={busy}
          onClose={closeModal}
        >
          <p className="bd-modal-description">
            Add your project to an approved company.
          </p>

          <form onSubmit={handleCreateProject}>
            <fieldset
              disabled={busy}
              className="bd-form-fields"
            >
              <label>
                Company
                <select
                  name="organization_id"
                  required
                  value={projectForm.organization_id}
                  onChange={updateProjectField}
                >
                  {approvedCompanies.map((company) => (
                    <option
                      key={company.id}
                      value={company.id}
                    >
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Project name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  value={projectForm.name}
                  onChange={updateProjectField}
                  placeholder="Lake View Residence"
                />
              </label>


<label>
  District *
  <select
    required
    value={projectForm.district || ""}
    onChange={(event) =>
      setProjectForm((prev) => ({
        ...prev,
        district: event.target.value,
      }))
    }
  >
    <option value="">Select district</option>
    {SRI_LANKA_DISTRICTS.map((district) => (
      <option key={district} value={district}>
        {district}
      </option>
    ))}
  </select>
</label>

<label>
  Detailed address (optional)
  <textarea
    rows={2}
    placeholder="House no, street, town or landmark..."
    value={projectForm.address || ""}
    onChange={(event) =>
      setProjectForm((prev) => ({
        ...prev,
        address: event.target.value,
      }))
    }
  />
</label>


              <label>
                Description
                <textarea
                  name="description"
                  required
                  minLength={15}
                  maxLength={2000}
                  rows={3}
                  value={projectForm.description}
                  onChange={updateProjectField}
                  placeholder="Briefly describe the construction project."
                />
              </label>

<div>
  <label>
    Project photo (optional)
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={busy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 2 * 1024 * 1024
        ) {
          setModalError("Choose a JPG, PNG or WebP photo up to 2 MB.");
          return;
        }

        setModalError("");
        const reader = new FileReader();
        reader.onload = () => setProjectCover(reader.result);
        reader.onerror = () => setModalError("Couldn't read the photo. Try again.");
        reader.readAsDataURL(file);
      }}
    />
  </label>

  {projectCover && (
    <img
      src={projectCover}
      alt="Project photo preview"
      style={{
        display: "block",
        width: "100%",
        maxHeight: 160,
        objectFit: "contain",
        marginTop: 8,
      }}
    />
  )}
</div>

              {modalError && (
                <p
                  className="bd-form-error"
                  role="alert"
                >
                  {modalError}
                </p>
              )}

              <div className="bd-modal-actions">
                <button
                  type="button"
                  className="bd-button"
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bd-button bd-primary"
                >
                  {busy ? "Creating…" : "Create project"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {modal?.type === "invitations" && (
        <Modal
          title="Project invitations"
          onClose={closeModal}
        >
          <p className="bd-modal-description">
            To accept an invitation, open the email link and sign in with the invited address.
          </p>

          {invitations.length ? (
            <div className="bd-invitations">
              {invitations.map((invitation) => (
                <article key={invitation.id}>
                  <strong>
                    {invitation.project_name ||
                      invitation.organization_name ||
                      "Project invitation"}
                  </strong>

                  <p>{invitation.email}</p>

                  <p>
                    {roleLabel(
                      invitation.project_role ||
                        invitation.member_role
                    )}
                    {" · "}
                    {invitationLabel(invitation)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
<div className="bd-invitations-empty">
  <span className="bd-invitations-empty-icon" aria-hidden="true">
    <Bell size={20} />
  </span>

  <div>
    <strong>No pending invitations</strong>
    <p>New project invitations will appear here.</p>
  </div>
</div>
          )}
        </Modal>
      )}

      {modal?.type === "details" && (
        <Modal
          title={modal.company.name}
          onClose={closeModal}
        >
          <dl className="bd-company-details">
            <dt>Your membership</dt>
            <dd>{roleLabel(modal.company.member_role)}</dd>

            <dt>Verification</dt>
            <dd>
              {STATUS_LABELS[
                modal.company.verification_status
              ] || "Status unavailable"}
            </dd>
          </dl>

          <p className="bd-muted">
            Company registration details are managed
            by the Company Admin.
          </p>
        </Modal>
      )}

      {modal?.type === "logout" && (
        <Modal
          title="Sign out?"
          onClose={closeModal}
        >
          <p className="bd-modal-description">
            You can sign in again to access your workspace.
          </p>

          <div className="bd-modal-actions">
            <button
              type="button"
              className="bd-button"
              onClick={closeModal}
            >
              Cancel
            </button>

            <button
              type="button"
              className="bd-button bd-primary"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}