import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  FolderKanban,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import {
  getMyProjects,
  getWorkspaceContext,
} from "../services/workspaceApi";

import ProjectActions from "../components/projects/ProjectActions";

import "../styles/ProjectsPage.css";

function normalizeStatus(value) {
  return String(value || "unknown").trim().toLowerCase();
}

function statusLabel(value) {
  return normalizeStatus(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(value) {
  const status = normalizeStatus(value);

  if (status === "active") return "pr-status-active";
  if (status === "completed") return "pr-status-completed";

  if (["on_hold", "on hold", "paused", "archived"].includes(status)) {
    return "pr-status-paused";
  }

  return "";
}

function roleLabel(value) {
  return {
    qs: "Quantity Surveyor",
    owner: "Building Owner",
    building_owner: "Building Owner",
    organization_admin: "Organization Admin",
  }[value] || "";
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const requestRef = useRef(0);

  const [projects, setProjects] = useState([]);
  const [adminOrganizationIds, setAdminOrganizationIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const loadProjects = useCallback(async () => {
    const requestId = ++requestRef.current;

    setLoading(true);
    setError("");

    try {
      const [data, context] = await Promise.all([
        getMyProjects(),
        getWorkspaceContext().catch(() => null),
      ]);

      if (requestId !== requestRef.current) return;

      setProjects(Array.isArray(data) ? data : []);

      const organizations = Array.isArray(context?.organizations)
        ? context.organizations
        : [];

      setAdminOrganizationIds(
        organizations
          .filter((org) => org.member_role === "organization_admin")
          .map((org) => String(org.id))
      );
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err?.message || "Unable to load your projects.");
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();

    return () => {
      requestRef.current += 1;
    };
  }, [loadProjects]);

  const statusOptions = useMemo(() => {
    const values = new Set(
      projects.map((project) => normalizeStatus(project.status))
    );

    if (status !== "all") values.add(status);

    return [...values].sort();
  }, [projects, status]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus =
        status === "all" ||
        normalizeStatus(project.status) === status;

      const text = [
        project.name,
        project.location,
        project.organization_name,
        project.id,
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || text.includes(query));
    });
  }, [projects, search, status]);

  const activeCount = projects.filter(
    (project) => normalizeStatus(project.status) === "active"
  ).length;

  const completedCount = projects.filter(
    (project) => normalizeStatus(project.status) === "completed"
  ).length;

  function count(value) {
    return loading ? "…" : error ? "—" : value;
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
  }

  function openProject(project) {
    localStorage.setItem("buildora_active_project", String(project.id));

    if (project.organization_id) {
      localStorage.setItem(
        "buildora_active_organization",
        String(project.organization_id)
      );
    }

    navigate(`/projects/${project.id}`);
  }

  return (
    <div className="pr-page">
      <div className="pr-container">
        <header className="pr-header pr-banner">
          <div className="pr-banner-copy">
            <h1>Projects</h1>
            <p className="pr-subtitle">
              Your construction projects, together in one place.
            </p>
          </div>

          <div className="pr-banner-photo" aria-hidden="true" />
        </header>

        <section className="pr-stats" aria-label="Project summary">
          <div className="pr-stat">
            <span className="pr-stat-icon pr-stat-icon-total">
              <FolderKanban size={21} aria-hidden="true" />
            </span>
            <div className="pr-stat-content">
              <span className="pr-stat-label">Total projects</span>
              <strong>{count(projects.length)}</strong>
            </div>
          </div>

          <div className="pr-stat">
            <span className="pr-stat-icon pr-stat-icon-active">
              <Activity size={21} aria-hidden="true" />
            </span>
            <div className="pr-stat-content">
              <span className="pr-stat-label">Active projects</span>
              <strong>{count(activeCount)}</strong>
            </div>
          </div>

          <div className="pr-stat">
            <span className="pr-stat-icon pr-stat-icon-completed">
              <CheckCircle2 size={21} aria-hidden="true" />
            </span>
            <div className="pr-stat-content">
              <span className="pr-stat-label">Completed projects</span>
              <strong>{count(completedCount)}</strong>
            </div>
          </div>
        </section>

        <section
          className="pr-library"
          aria-labelledby="pr-library-title"
          aria-busy={loading}
        >
          <div className="pr-library-heading">
            <div>
              <h2 id="pr-library-title">Project library</h2>
              <p>Find a project and open its workspace.</p>
            </div>

            {!loading && !error && (
              <span className="pr-result-count" role="status">
                {filteredProjects.length} of {projects.length}
              </span>
            )}
          </div>

          <div className="pr-filters">
            <div className="pr-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search projects"
                placeholder="Search by project, location or organization"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="pr-status-filter">
              <label htmlFor="pr-status">Status</label>
              <select
                id="pr-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="pr-state" role="status">
              <RefreshCw size={25} className="pr-spin" aria-hidden="true" />
              <h3>Loading your projects</h3>
              <p>Getting your latest workspace information.</p>
            </div>
          ) : error ? (
            <div className="pr-state pr-error" role="alert">
              <FolderKanban size={28} aria-hidden="true" />
              <h3>Unable to load projects</h3>
              <p>{error}</p>
              <button
                type="button"
                className="pr-action"
                onClick={loadProjects}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="pr-state">
              <FolderKanban size={28} aria-hidden="true" />
              <h3>No projects yet</h3>
              <p>
                Create a project from your dashboard, or accept a project
                invitation to get started.
              </p>
              <button
                type="button"
                className="pr-action"
                onClick={() => navigate("/dashboard")}
              >
                Go to dashboard
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="pr-state">
              <Search size={28} aria-hidden="true" />
              <h3>No matching projects</h3>
              <p>Try another search or choose a different status.</p>
              <button
                type="button"
                className="pr-action"
                onClick={resetFilters}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="pr-grid">
              {filteredProjects.map((project) => {
                const canManage = adminOrganizationIds.includes(
                  String(project.organization_id)
                );

                return (
                  <article className="pr-card" key={project.id}>
                    <div className="pr-card-surface">
                      <button
                        type="button"
                        className="pr-card-link"
                        onClick={() => openProject(project)}
                        aria-label={`Open ${project.name || "project"}`}
                      >
                        <div className="pr-card-top">
                          <span className="pr-project-icon">
                            <FolderKanban size={23} aria-hidden="true" />
                          </span>
                          <span
                            className={`pr-status ${statusClass(project.status)}`}
                          >
                            <span aria-hidden="true" />
                            {statusLabel(project.status)}
                          </span>
                        </div>

                        <div className="pr-card-content">
                          <span className="pr-project-id">
                            Project #{project.id}
                          </span>
                          <h3>{project.name || "Untitled project"}</h3>

                          <div className="pr-meta">
                            <MapPin size={15} aria-hidden="true" />
                            <span>
                              {project.location || "Location not provided"}
                            </span>
                          </div>

                          {project.organization_name && (
                            <div className="pr-meta">
                              <Building2 size={15} aria-hidden="true" />
                              <span>{project.organization_name}</span>
                            </div>
                          )}

                          {project.description && (
                            <p className="pr-description">
                              {project.description}
                            </p>
                          )}
                        </div>

                        <div className="pr-card-footer">
                          <span>
                            {roleLabel(project.project_role) ||
                              "Project workspace"}
                          </span>
                          <span className="pr-open">
                            Open
                            <ArrowRight size={17} aria-hidden="true" />
                          </span>
                        </div>
                      </button>

                      {canManage && (
                        <ProjectActions
                          project={project}
                          onChanged={loadProjects}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}