import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FolderKanban,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { getMyProjects } from "../services/workspaceApi";

import "../styles/BOQPage.css";

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

export default function BOQPage() {
  const navigate = useNavigate();
  const requestRef = useRef(0);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadProjects = useCallback(async () => {
    const requestId = ++requestRef.current;

    setLoading(true);
    setError("");

    try {
      const data = await getMyProjects();

      if (requestId !== requestRef.current) return;

      setProjects(Array.isArray(data) ? data : []);
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

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return projects;

    return projects.filter((project) =>
      [
        project.name,
        project.location,
        project.organization_name,
        project.id,
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [projects, search]);

  function openBOQ(project) {
    localStorage.setItem("buildora_active_project", String(project.id));

    if (project.organization_id) {
      localStorage.setItem(
        "buildora_active_organization",
        String(project.organization_id)
      );
    }

    navigate(`/projects/${project.id}?tab=boq`);
  }

  return (
    <div className="pr-page boq-page">
      <div className="pr-container">
        <header className="pr-header pr-banner">
          <div className="pr-banner-copy">
            <h1>Bill of quantities</h1>
            <p className="pr-subtitle">
              View project quantities, rates and BOQ versions.
            </p>
          </div>

          <div className="pr-banner-photo" aria-hidden="true" />
        </header>

        <section
          className="pr-library"
          aria-labelledby="boq-projects-title"
          aria-busy={loading}
        >
          <div className="pr-library-heading">
            <div>
              <h2 id="boq-projects-title">Choose a project</h2>
              <p>
                Open a project to view its BOQ. Available actions
                depend on your project role.
              </p>
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
          </div>

          {loading ? (
            <div className="pr-state" role="status">
              <RefreshCw size={25} className="pr-spin" aria-hidden="true" />
              <h3>Loading projects</h3>
              <p>Getting the projects you can access.</p>
            </div>
          ) : error ? (
            <div className="pr-state pr-error" role="alert">
              <ClipboardCheck size={28} aria-hidden="true" />
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
              <h3>No projects available</h3>
              <p>
                Create a project from your dashboard or accept a project
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
              <p>Try another project name or location.</p>
              <button
                type="button"
                className="pr-action"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="pr-grid">
              {filteredProjects.map((project) => (
                <article className="pr-card" key={project.id}>
                  <div className="pr-card-surface">
                    <button
                      type="button"
                      className="pr-card-link"
                      onClick={() => openBOQ(project)}
                      aria-label={`Open BOQ for ${project.name || "project"}`}
                    >
                      <div className="pr-card-top">
                        <span className="pr-project-icon">
                          <ClipboardCheck size={23} aria-hidden="true" />
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
                      </div>

                      <div className="pr-card-footer">
                        <span className="boq-open-label">
                          Open project BOQ
                        </span>

                        <span className="pr-open">
                          <ArrowRight size={18} aria-hidden="true" />
                        </span>
                      </div>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}