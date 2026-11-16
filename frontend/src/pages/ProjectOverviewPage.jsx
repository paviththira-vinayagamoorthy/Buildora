import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  Download,
  ImageOff,
} from "lucide-react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  downloadProjectDocument,
  getDocumentPreviewBlob,
  getMyProjects,
  getOwnerProjectOverview,
} from "../services/workspaceApi";

import "../styles/ProjectOverviewPage.css";


function money(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "—";

  const date = new Date(
    `${String(value).slice(0, 10)}T00:00:00`
  );

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function monthLabel(value) {
  if (!value) return "—";

  return new Date(
    `${value.slice(0, 7)}-01T00:00:00`
  ).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}


function SitePhoto({ photo }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    setUrl("");
    setFailed(false);

    async function loadPhoto() {
      try {
        const blob = await getDocumentPreviewBlob(photo.id);

        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void loadPhoto();

    return () => {
      cancelled = true;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  return (
    <figure className="po-photo">
      {url && !failed ? (
        <img
          src={url}
          alt={photo.title}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="po-photo-placeholder">
          {failed ? (
            <>
              <ImageOff size={22} aria-hidden="true" />
              <span>Photo unavailable</span>
            </>
          ) : (
            <span>Loading photo…</span>
          )}
        </div>
      )}

      <figcaption>{photo.title}</figcaption>
    </figure>
  );
}


export default function ProjectOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project") || "";

  const mountedRef = useRef(false);
  const downloadLocks = useRef(new Set());

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState([]);


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
        const data = await getMyProjects();

        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) setProjectsError(messageFrom(err));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [projectsRetry]);


  useEffect(() => {
    let cancelled = false;

    setOverview(null);
    setLoadError("");
    setDownloadError("");

    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    async function loadOverview() {
      try {
        const data = await getOwnerProjectOverview(projectId);

        if (!cancelled) setOverview(data);
      } catch (err) {
        if (!cancelled) setLoadError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [projectId, retry]);


  async function handleDownload(document) {
    if (downloadLocks.current.has(document.id)) return;

    downloadLocks.current.add(document.id);
    setDownloading((previous) => [...previous, document.id]);
    setDownloadError("");

    try {
      await downloadProjectDocument(
        document.id,
        document.original_filename
      );
    } catch (err) {
      if (mountedRef.current) {
        setDownloadError(messageFrom(err));
      }
    } finally {
      downloadLocks.current.delete(document.id);

      if (mountedRef.current) {
        setDownloading((previous) =>
          previous.filter((id) => id !== document.id)
        );
      }
    }
  }


  const update = overview?.latest_site_update;
  const report = overview?.latest_monthly_report;
  const financials = overview?.financials;


  return (
    <div className="ct-page po-page">
      <div className="ct-container">
        <header className="ct-heading">
          <h1>Project overview</h1>
          <p>Published progress, project costs and important records together.</p>
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
            <h2>No projects available</h2>
            <p>Create a project or accept a project invitation.</p>
          </div>
        ) : (
          <>
            <div className="ct-toolbar">
              <div className="ct-project-control">
                <label htmlFor="po-project">Project</label>

                <select
                  id="po-project"
                  value={projectId}
                  disabled={downloading.length > 0}
                  onChange={(event) =>
                    setSearchParams({
                      project: event.target.value,
                    })
                  }
                >
                  <option value="" disabled hidden>
                    Choose a project
                  </option>

                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || "Untitled project"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!projectId ? (
              <div className="ct-state">
                <h2>Choose a project</h2>
                <p>See its latest shared progress and financial overview.</p>
              </div>
            ) : loading ? (
              <div className="ct-state" role="status">
                Loading project overview…
              </div>
            ) : loadError ? (
              <div className="ct-state" role="alert">
                <p>{loadError}</p>
                <button
                  type="button"
                  className="ct-button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            ) : overview ? (
              <>
                <section className="po-project-heading">
                  <div>
                    <span className="ct-eyebrow">PROJECT SNAPSHOT</span>
                    <h2>{overview.project.name}</h2>
                    {overview.project.location && (
                      <p>{overview.project.location}</p>
                    )}
                  </div>
                  <span>Published records only</span>
                </section>

                <dl className="po-financials">
                  <div>
                    <dt>Latest published BOQ</dt>
                    <dd>
                      {overview.boq
                        ? money(overview.boq.total_amount)
                        : "Not published"}
                    </dd>
                    <small>
                      {overview.boq
                        ? `Revision ${overview.boq.revision}`
                        : "No published BOQ available"}
                    </small>
                  </div>

                  <div>
                    <dt>Certified net payable</dt>
                    <dd>{money(financials.certified_net_payable)}</dd>
                    <small>Published certificates after deductions</small>
                  </div>

                  <div>
                    <dt>Recorded payments</dt>
                    <dd>{money(financials.recorded_payments)}</dd>
                    <small>Payments recorded against certificates</small>
                  </div>

                  <div>
                    <dt>Outstanding balance</dt>
                    <dd>{money(financials.outstanding_balance)}</dd>
                    <small>Certified amount remaining to be paid</small>
                  </div>
                </dl>

                <div className="po-main-grid">
                  <section className="ct-panel">
                    <div className="ct-section-heading">
                      <div>
                        <h2>Latest site progress</h2>
                        <p>
                          {update
                            ? `As of ${dateLabel(update.update_date)}`
                            : "No published site update yet"}
                        </p>
                      </div>
                    </div>

                    {update ? (
                      <>
                        <div className="po-progress">
                          <strong>
                            {Number(update.progress_percentage)}%
                          </strong>
                          <span>Reported overall project completion</span>
                          <progress
                            max="100"
                            value={Number(update.progress_percentage)}
                            aria-label="Reported project completion"
                          />
                        </div>

                        <h3 className="po-subheading">{update.title}</h3>
                        <p className="po-text">{update.work_completed}</p>

                        {update.issues && (
                          <div className="po-note">
                            <h3>Issues / delays</h3>
                            <p>{update.issues}</p>
                          </div>
                        )}

                        {update.next_steps && (
                          <div className="po-note">
                            <h3>Next steps</h3>
                            <p>{update.next_steps}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="po-text">
                        Progress will appear after the QS publishes a site update.
                      </p>
                    )}

                    <p className="ct-footnote">
                      Reported work progress is separate from payment percentage.
                    </p>
                  </section>

                  <section className="ct-panel">
                    <div className="ct-section-heading">
                      <div>
                        <h2>Monthly report</h2>
                        <p>
                          {report
                            ? monthLabel(report.report_month)
                            : "No published report yet"}
                        </p>
                      </div>
                    </div>

                    {report ? (
                      <>
                        <p className="po-report-excerpt">{report.summary}</p>

                        <Link
                          className="ct-button ct-primary po-link"
                          to={`/monthly-reports?project=${overview.project.id}&report=${report.id}`}
                        >
                          Read report & comments
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </>
                    ) : (
                      <p className="po-text">
                        The latest published monthly report will appear here.
                      </p>
                    )}
                  </section>
                </div>

                <section className="ct-panel po-section">
                  <div className="ct-section-heading">
                    <div>
                      <h2>Recent site photos</h2>
                      <p>Latest uploads categorised as site photos.</p>
                    </div>
                  </div>

                  {overview.recent_site_photos.length ? (
                    <div className="po-photo-grid">
                      {overview.recent_site_photos.map((photo) => (
                        <SitePhoto key={photo.id} photo={photo} />
                      ))}
                    </div>
                  ) : (
                    <p className="po-text">
                      Upload site photos through Documents to show them here.
                    </p>
                  )}
                </section>

                <section className="ct-panel po-section">
                  <div className="ct-section-heading">
                    <div>
                      <h2>Recent documents</h2>
                      <p>Latest shared project files.</p>
                    </div>
                  </div>

                  {downloadError && (
                    <div className="ct-message ct-error" role="alert">
                      {downloadError}
                    </div>
                  )}

                  {overview.recent_documents.length ? (
                    <div className="po-documents">
                      {overview.recent_documents.map((document) => (
                        <div className="po-document" key={document.id}>
                          <div>
                            <strong>{document.title}</strong>
                            <small>
                              {document.original_filename}
                              {" · "}
                              {dateLabel(document.created_at)}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="ct-button"
                            disabled={downloading.includes(document.id)}
                            onClick={() => handleDownload(document)}
                            aria-label={`Download ${document.title}`}
                          >
                            <Download size={16} aria-hidden="true" />
                            {downloading.includes(document.id)
                              ? "Downloading…"
                              : "Download"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="po-text">No documents uploaded yet.</p>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}