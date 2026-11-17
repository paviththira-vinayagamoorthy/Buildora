
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  Search,
  Upload,
  X,
} from "lucide-react";

import {
  getDocumentAccess,
  getMyProjects,
  getProjectDocuments,
  uploadProjectDocument,
  extractProjectInvoice,
  downloadProjectDocument,
} from "../services/workspaceApi";

import documentIllustration from "../assets/certificate-illustration.png";
import "../styles/DocumentsPage.css";

const CATEGORIES = [
  ["drawing", "Drawings"],
  ["invoice", "Invoices"],
  ["receipt", "Receipts"],
  ["site_photo", "Site photos"],
  ["other", "Other"],
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;

function emptyForm() {
  return {
    title: "",
    category: "other",
    description: "",
    supplierName: "",
    invoiceNumber: "",
  };
}

function categoryLabel(value) {
  return CATEGORIES.find(([key]) => key === value)?.[1] || value;
}

function fileSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}

function DocumentFileIcon({ filename }) {
  const extension = String(filename || "")
    .split(".")
    .pop()
    ?.toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return <FileImage size={18} aria-hidden="true" />;
  }

  if (["xls", "xlsx", "csv"].includes(extension)) {
    return <FileSpreadsheet size={18} aria-hidden="true" />;
  }

  return <FileText size={18} aria-hidden="true" />;
}

export default function DocumentsPage({
  workspaceProject = null,
}) {
  const embedded = workspaceProject !== null;

  const mountedRef = useRef(false);
  const actionRef = useRef(false);
  const fileInputRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const downloadLocks = useRef(new Set());

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectsRetry, setProjectsRetry] = useState(0);

  const [projectId, setProjectId] = useState(() =>
    workspaceProject ? String(workspaceProject.id) : ""
  );

  const [access, setAccess] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [downloading, setDownloading] = useState([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isArchived = workspaceProject?.status === "archived";
  const canUpload = access?.can_upload === true && !isArchived;

  const project = projects.find(
    (item) => String(item.id) === projectId
  );

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents
      .filter((item) => {
        const matchesCategory =
          category === "all" || item.category === category;

        const matchesSearch =
          !query ||
          [
            item.title,
            item.original_filename,
            item.description,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);

        return matchesCategory && matchesSearch;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
  }, [documents, search, category]);

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
    if (workspaceProject) {
      setProjectId(String(workspaceProject.id));
    }
  }, [workspaceProject?.id]);

  useEffect(() => {
    let cancelled = false;

    setAccess(null);
    setDocuments([]);
    setLoadError("");

    if (!projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    async function loadWorkspace() {
      try {
        const [permissions, records] = await Promise.all([
          getDocumentAccess(projectId),
          getProjectDocuments(projectId),
        ]);

        if (cancelled) return;

        setAccess(permissions);
        setDocuments(Array.isArray(records) ? records : []);
      } catch (err) {
        if (!cancelled) {
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
  }, [projectId, reload]);

  useEffect(() => {
    if (!showUpload) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = drawerRef.current;
    const firstInput = drawer?.querySelector(
      'input[name="title"]'
    );

    if (
  drawer &&
  !drawer.contains(document.activeElement)
) {
  firstInput?.focus();
}

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelUpload();
      }

      if (event.key !== "Tab" || !drawer) return;

      const elements = Array.from(
        drawer.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
        )
      );

      if (!elements.length) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
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
      window.removeEventListener("keydown", handleKeyDown);
      uploadButtonRef.current?.focus();
    };
  }, [showUpload, form, file]);

  useEffect(() => {
    if (!showUpload) return;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [showUpload]);

  function resetUpload() {
    setForm(emptyForm());
    setFile(null);
    setInvoicePreview(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function changeProject(event) {
    if (actionRef.current) return;

    if (
      showUpload &&
      !window.confirm("Discard this unsaved upload form?")
    ) {
      return;
    }

    resetUpload();
    setShowUpload(false);
    setSearch("");
    setCategory("all");
    setError("");
    setSuccess("");
    setProjectId(event.target.value);
  }

  function startUpload() {
    if (!canUpload || actionRef.current) return;

    resetUpload();
    setShowUpload(true);
    setError("");
    setSuccess("");
  }

  function cancelUpload() {
    if (actionRef.current) return;

    const hasChanges = Boolean(
      form.title.trim() ||
        form.description.trim() ||
        form.supplierName.trim() ||
        form.invoiceNumber.trim() ||
        form.category !== "other" ||
        file
    );

    if (
      hasChanges &&
      !window.confirm("Discard this unsaved upload form?")
    ) {
      return;
    }

    resetUpload();
    setShowUpload(false);
    setError("");
  }

  function updateField(event) {
    const { name, value } = event.target;

    if (name === "category") {
      setInvoicePreview(null);
    }

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function chooseFile(event) {
    const selectedFile = event.target.files?.[0];

    setError("");
    setFile(null);
    setInvoicePreview(null);

    if (!selectedFile) return;

    if (!ALLOWED_EXTENSIONS.test(selectedFile.name)) {
      setError("Choose a PDF, JPG, PNG or WEBP file.");
      event.target.value = "";
      return;
    }

    if (
      selectedFile.size === 0 ||
      selectedFile.size > MAX_FILE_SIZE
    ) {
      setError("Choose a non-empty file up to 10 MB.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
  }

  async function handleExtractInvoice() {
    if (
      actionRef.current ||
      !canUpload ||
      form.category !== "invoice" ||
      !file ||
      !ALLOWED_EXTENSIONS.test(file.name)
    ) {
      return;
    }

    actionRef.current = true;
    setExtracting(true);
    setInvoicePreview(null);
    setError("");
    setSuccess("");

    try {
      const result = await extractProjectInvoice(projectId, file);

      if (!mountedRef.current) return;

      setForm((previous) => ({
        ...previous,
        supplierName:
          result.supplier_name?.trim() || previous.supplierName,
        invoiceNumber:
          result.invoice_number?.trim() || previous.invoiceNumber,
      }));

      setInvoicePreview(result);
    } catch (err) {
      if (mountedRef.current) {
        setError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) {
        setExtracting(false);
      }
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (actionRef.current || !canUpload) return;

    if (!form.title.trim() || !file) {
      setError("Enter a document title and choose a file.");
      return;
    }

    if (
      form.category === "site_photo" &&
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      setError("Site photos must be JPG, PNG or WEBP images.");
      return;
    }

    actionRef.current = true;
    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const saved = await uploadProjectDocument(projectId, {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        supplierName: form.supplierName,
        invoiceNumber: form.invoiceNumber,
        file,
      });

      if (!mountedRef.current) return;

      setDocuments((previous) => [saved, ...previous]);
      resetUpload();
      setShowUpload(false);
      setSearch("");
      setCategory("all");
      setSuccess("Document uploaded successfully.");
    } catch (err) {
      if (mountedRef.current) {
        setError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) {
        setUploading(false);
      }
    }
  }

  async function handleDownload(record) {
    if (downloadLocks.current.has(record.id)) return;

    downloadLocks.current.add(record.id);
    setDownloading((previous) => [...previous, record.id]);
    setError("");

    try {
      await downloadProjectDocument(
        record.id,
        record.original_filename
      );
    } catch (err) {
      if (mountedRef.current) {
        setError(messageFrom(err));
      }
    } finally {
      downloadLocks.current.delete(record.id);

      if (mountedRef.current) {
        setDownloading((previous) =>
          previous.filter((id) => id !== record.id)
        );
      }
    }
  }

  const projectControl = (
    <div
      className="ct-project-control"
      style={embedded ? { display: "none" } : undefined}
    >
      <label htmlFor="dc-project">Project</label>

      <select
        id="dc-project"
        value={projectId}
        onChange={changeProject}
        disabled={
          uploading ||
          extracting ||
          downloading.length > 0
        }
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
          {access.role === "qs"
            ? "QS access"
            : access.role === "organization_admin"
              ? "Admin access"
              : "Owner · View only"}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`ct-page dc-page ${
        embedded ? "dc-embedded" : ""
      }`}
    >
      <div className="ct-container">
        {!embedded && (
          <header className="ct-heading">
            <h1>Documents</h1>
            <p>
              Keep project drawings, records and site photos
              together.
            </p>
          </header>
        )}

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
              onClick={() =>
                setProjectsRetry((value) => value + 1)
              }
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="ct-state">
            <FileText size={30} aria-hidden="true" />
            <h2>No projects available</h2>
            <p>
              Create a project or accept a project invitation.
            </p>
          </div>
        ) : !projectId ? (
          <>
            <section className="ct-welcome">
              <div className="ct-welcome-copy">
                <h2>
                  Every document.
                  <br />
                  One project space.
                </h2>

                <p>
                  Select a project to access drawings, invoices,
                  receipts and site photos.
                </p>

                {projectControl}
              </div>

              <img
                className="ct-welcome-image"
                src={documentIllustration}
                alt=""
                aria-hidden="true"
              />
            </section>

            <div className="ct-steps">
              {[
                [
                  "Choose a project",
                  "Open its shared document library.",
                ],
                [
                  "Keep records together",
                  "Organise files by document category.",
                ],
                [
                  "Access when needed",
                  "Search and download project files.",
                ],
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
            {!embedded && (
              <div className="ct-toolbar">
                {projectControl}
              </div>
            )}

            {error && !showUpload && (
              <div
                className="ct-message ct-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                className="ct-message ct-success"
                role="status"
              >
                {success}
              </div>
            )}

            {loading ? (
              <div className="ct-state" role="status">
                Loading documents…
              </div>
            ) : loadError ? (
              <div className="ct-state" role="alert">
                <p>{loadError}</p>

                <button
                  type="button"
                  className="ct-button"
                  onClick={() =>
                    setReload((value) => value + 1)
                  }
                >
                  Try again
                </button>
              </div>
            ) : (
              <section className="ct-panel">
                <div className="ct-section-heading dc-library-heading">
                  <div>
                    <h2>Document library</h2>
                    {!embedded && <p>{project?.name}</p>}
                  </div>

                  <div className="dc-library-actions">
                    <span
                      className="dc-count"
                      role="status"
                    >
                      {filteredDocuments.length} of{" "}
                      {documents.length}
                    </span>

                    {canUpload && (
                      <button
                        ref={uploadButtonRef}
                        type="button"
                        className="ct-button ct-primary dc-upload-trigger"
                        onClick={startUpload}
                        disabled={showUpload}
                      >
                        <Upload
                          size={15}
                          aria-hidden="true"
                        />
                        Upload document
                      </button>
                    )}
                  </div>
                </div>

                <div className="dc-filters">
                  <div className="dc-search">
                    <Search
                      size={17}
                      aria-hidden="true"
                    />

                    <input
                      type="search"
                      value={search}
                      onChange={(event) =>
                        setSearch(event.target.value)
                      }
                      placeholder="Search documents…"
                      aria-label="Search documents"
                    />
                  </div>

                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value)
                    }
                    aria-label="Filter documents by category"
                  >
                    <option value="all">
                      All categories
                    </option>

                    {CATEGORIES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {documents.length === 0 ? (
                  <div className="ct-empty">
                    <FileText
                      size={32}
                      aria-hidden="true"
                    />

                    <h3>No documents yet</h3>

                    <p>
                      {canUpload
                        ? "Upload drawings, invoices, receipts or site photos."
                        : "Project documents will appear here once uploaded."}
                    </p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="ct-empty">
                    <h3>No matching documents</h3>
                    <p>
                      Try another search or category.
                    </p>

                    <button
                      type="button"
                      className="ct-button"
                      onClick={() => {
                        setSearch("");
                        setCategory("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="ct-table-wrap">
                    <table className="ct-table dc-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Category</th>
                          <th>Size</th>
                          <th>Uploaded</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredDocuments.map((record) => (
                          <tr key={record.id}>
                            <td className="dc-document-cell">
                              <div className="dc-document-title">
                                <DocumentFileIcon
                                  filename={
                                    record.original_filename
                                  }
                                />

                                <strong>
                                  {record.title}
                                </strong>
                              </div>

                              <small>
                                {record.original_filename}
                              </small>

                              {record.description && (
                                <p className="dc-description">
                                  {record.description}
                                </p>
                              )}
                            </td>

                            <td>
                              <span className="ct-badge dc-category">
                                {categoryLabel(
                                  record.category
                                )}
                              </span>
                            </td>

                            <td>
                              {fileSize(record.file_size)}
                            </td>

                            <td>
                              {dateLabel(record.created_at)}
                            </td>

                            <td>
                              <button
                                type="button"
                                className="ct-button dc-download"
                                disabled={downloading.includes(
                                  record.id
                                )}
                                onClick={() =>
                                  handleDownload(record)
                                }
                                aria-label={`Download ${record.title}`}
                              >
                                <Download
                                  size={16}
                                  aria-hidden="true"
                                />

                                {downloading.includes(record.id)
                                  ? "Downloading…"
                                  : "Download"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {showUpload && canUpload && (
              <div className="dc-drawer-layer">
                <div
                  className="dc-drawer-backdrop"
                  onClick={cancelUpload}
                  aria-hidden="true"
                />

                <aside
                  ref={drawerRef}
                  className="dc-upload-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="dc-drawer-title"
                >
                  <div className="dc-drawer-header">
                    <div>

                      <h2 id="dc-drawer-title">
                        Upload document
                      </h2>

                      <p>{project?.name}</p>
                    </div>

                    <button
                      type="button"
                      className="dc-drawer-close"
                      onClick={cancelUpload}
                      disabled={uploading || extracting}
                      aria-label="Close upload drawer"
                    >
                      <X
                        size={19}
                        aria-hidden="true"
                      />
                    </button>
                  </div>

                  <div className="dc-drawer-body">
                    {error && (
                      <div
                        className="ct-message ct-error"
                        role="alert"
                      >
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleUpload}>
                      <div className="dc-ai-intro">
  <div className="dc-ai-intro-heading">
    <span className="dc-ai-icon">✦</span>

    <div>
      <h3>AI Invoice Extraction</h3>
      <p>
        Upload an invoice and let AI fill in the available
        details automatically.
      </p>
    </div>
  </div>

  <p className="dc-ai-hint">
    Select <strong>Invoices</strong> as the category,
    choose your file, then click Extract details.
  </p>
</div>
                      <div className="ct-form-grid">
                        <label className="ct-field">
                          Document title

                          <input
                            type="text"
                            name="title"
                            value={form.title}
                            onChange={updateField}
                            maxLength={255}
                            disabled={
                              uploading || extracting
                            }
                            required
                          />
                        </label>

                        <label className="ct-field">
                          Category

                          <select
                            name="category"
                            value={form.category}
                            onChange={updateField}
                            disabled={
                              uploading || extracting
                            }
                          >
                            {CATEGORIES.map(
                              ([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              )
                            )}
                          </select>
                        </label>
                      </div>

                      {form.category === "invoice" && (
                        <div className="ct-form-grid">
                          <label className="ct-field">
                            Supplier name

                            <input
                              type="text"
                              name="supplierName"
                              value={form.supplierName}
                              onChange={updateField}
                              maxLength={150}
                              disabled={
                                uploading || extracting
                              }
                              required
                            />
                          </label>

                          <label className="ct-field">
                            Invoice number

                            <input
                              type="text"
                              name="invoiceNumber"
                              value={form.invoiceNumber}
                              onChange={updateField}
                              maxLength={100}
                              disabled={
                                uploading || extracting
                              }
                              required
                            />
                          </label>
                        </div>
                      )}

                      <label className="ct-field dc-file-field">
                        Choose file

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={chooseFile}
                          disabled={
                            uploading || extracting
                          }
                          aria-describedby="dc-file-help"
                          required
                        />

                        <small id="dc-file-help">
                          PDF, JPG, PNG or WEBP · Max 10 MB
                        </small>

                        {file && (
                          <span className="dc-selected-file">
                            {file.name} ·{" "}
                            {fileSize(file.size)}
                          </span>
                        )}
                      </label>

                      {form.category === "invoice" &&
                        file && (
                          <div className="dc-invoice-extraction">
                            <div className="dc-ai-ready">
  <strong>✦ Ready for AI extraction</strong>
  <p>
    Extract invoice information automatically.
    Review the results before uploading.
  </p>
</div>
                            <button
                              type="button"
                              className="ct-button dc-ai-extract-button"
                              onClick={
                                handleExtractInvoice
                              }
                              disabled={
                                uploading || extracting
                              }
                            >
                              {extracting
                                ? "Extracting…"
                                : "Extract details"}
                            </button>

                            {/\.(pdf)$/i.test(
                              file.name
                            ) && (
                              <small>
                                AI can extract details from
                                PDFs with selectable text.
                                For scanned PDFs, upload
                                an image or enter details
                                manually.
                              </small>
                            )}

                            <div
                              role="status"
                              aria-live="polite"
                            >
                              {invoicePreview && (
                                <>
                                  <p>
                                    Compare extracted
                                    details with the
                                    original invoice before
                                    uploading.
                                  </p>

                                  <p>
                                    Invoice date:{" "}
                                    {invoicePreview.invoice_date ??
                                      "Unreadable"}
                                  </p>

                                  <p>
                                    Grand total:{" "}
                                    {invoicePreview.total_amount ??
                                      "Unreadable"}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                      <label className="ct-field">
                        Description (optional)

                        <textarea
                          name="description"
                          value={form.description}
                          onChange={updateField}
                          maxLength={2000}
                          disabled={
                            uploading || extracting
                          }
                          rows={4}
                        />
                      </label>

                      <p className="ct-footnote">
                        Uploaded documents are available
                        to the assigned QS, Organization
                        Admin and Building Owner.
                      </p>

                      <div className="ct-actions">
                        <button
                          type="button"
                          className="ct-button"
                          onClick={cancelUpload}
                          disabled={
                            uploading || extracting
                          }
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          className="ct-button ct-primary"
                          disabled={
                            uploading || extracting
                          }
                        >
                          <Upload
                            size={17}
                            aria-hidden="true"
                          />

                          {uploading
                            ? "Uploading…"
                            : "Upload document"}
                        </button>
                      </div>
                    </form>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
