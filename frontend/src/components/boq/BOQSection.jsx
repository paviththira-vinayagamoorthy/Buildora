import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  confirmBOQImport,
  createBOQ,
  createBOQItem,
  createBOQRevision,
  deleteBOQItem,
  downloadBOQExcel,
  getProjectBOQs,
  previewBOQImport,
  publishBOQ,
  updateBOQItem,
} from "../../services/workspaceApi";
import "../../styles/BOQSection.css";

const UNIT_OPTIONS = [
  { value: "m3", label: "m³ — Cubic metre" },
  { value: "m2", label: "m² — Square metre" },
  { value: "m", label: "m — Metre" },
  { value: "No.", label: "No. — Number" },
  { value: "kg", label: "kg — Kilogram" },
  { value: "t", label: "t — Tonne" },
  { value: "L", label: "L — Litre" },
  { value: "Item", label: "Item — Lump sum item" },
];

function normalizeUnit(value) {
  const unit = String(value ?? "").trim();

  const aliases = {
    "m³": "m3",
    "m^3": "m3",
    "m²": "m2",
    "m^2": "m2",
  };

  return aliases[unit.toLowerCase()] || unit;
}

function displayUnit(value) {
  const unit = normalizeUnit(value);

  if (unit === "m3") return "m³";
  if (unit === "m2") return "m²";

  return unit;
}

const EMPTY_ITEM = {
  item_no: "",
  description: "",
  unit: "",
  quantity: "",
  rate: "",
};

function money(value) {
  const number = Number(value ?? 0);

  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function revisionLabel(value) {
  return String(value ?? "00").padStart(2, "0");
}

function dateLabel(value) {
  if (!value) return "Not recorded";

  // Backend returns UTC timestamps without a timezone suffix.
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      ? value
      : `${value}Z`;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleString("en-LK", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function Modal({ title, description, busy, onClose, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])"
        ) || []
      ).filter((element) => element.getClientRects().length);

    const firstInput = dialogRef.current?.querySelector(
      "input:not([disabled]), textarea:not([disabled])"
    );

    (firstInput || focusable()[0] || dialogRef.current)?.focus();

    function handleKey(event) {
      if (event.key === "Escape" && !busyRef.current) {
        closeRef.current();
      }

      if (event.key !== "Tab") return;

      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (!first) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div
      className="bq-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bq-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="bq-modal-head">
          <span className="bq-tile">
            <ReceiptText size={23} />
          </span>

          <button
            type="button"
            className="bq-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>

        <h3>{title}</h3>
        <p className="bq-muted">{description}</p>

        {children}
      </div>
    </div>
  );
}

function ItemForm({ item, initialItemNo = "", busy, error, onSave, onClose }) {
  const [form, setForm] = useState(() =>
    item
      ? {
          item_no: item.item_no ?? "",
          description: item.description ?? "",
          unit: normalizeUnit(item.unit),
          quantity: item.quantity ?? "",
          rate: item.rate ?? "",
        }
          : { ...EMPTY_ITEM, item_no: initialItemNo }
  );

  const [validationError, setValidationError] = useState("");

  const [unitChoice, setUnitChoice] = useState(() => {
  const currentUnit = normalizeUnit(item?.unit);

  if (!currentUnit) return "";

  return UNIT_OPTIONS.some((option) => option.value === currentUnit)
    ? currentUnit
    : "other";
});

function changeUnit(event) {
  const selected = event.target.value;

  setUnitChoice(selected);

  setForm((current) => ({
    ...current,
    unit: selected === "other" ? "" : selected,
  }));

  setValidationError("");
}

  function change(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
    setValidationError("");
  }

  function submit(event) {
    event.preventDefault();

    const data = {
      item_no: String(form.item_no).trim(),
      description: String(form.description).trim(),
      unit: String(form.unit).trim(),
      quantity: Number(form.quantity),
      rate: Number(form.rate),
    };

    if (!data.item_no || !data.description || !data.unit) {
      setValidationError("Enter an item number, description and unit.");
      return;
    }

    if (
      form.quantity === "" ||
      form.rate === "" ||
      !Number.isFinite(data.quantity) ||
      !Number.isFinite(data.rate) ||
      data.quantity < 0 ||
      data.rate < 0
    ) {
      setValidationError("Quantity and rate must be valid non-negative numbers.");
      return;
    }

    onSave(data);
  }

  return (
    <form className="bq-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="bq-form-grid">
          <label>
            Item number
            <input
              name="item_no"
              value={form.item_no}
              onChange={change}
              maxLength={50}
              placeholder="1.01"
              required
            />
          </label>

          <label>
  Unit
  <select
    name="unit_choice"
    value={unitChoice}
    onChange={changeUnit}
    required
  >
    <option value="" disabled>
      Select a unit
    </option>

    {UNIT_OPTIONS.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}

    <option value="other">Other — Enter a custom unit</option>
  </select>
</label>

{unitChoice === "other" && (
  <label className="bq-full">
    Custom unit
    <input
      name="unit"
      value={form.unit}
      onChange={change}
      maxLength={50}
      placeholder="Enter your unit"
      required
    />
  </label>
)}

          <label className="bq-full">
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={change}
              maxLength={10000}
              rows={3}
              placeholder="Describe the measured work"
              required
            />
          </label>

          <label>
            Quantity
            <input
              name="quantity"
              type="number"
              min="0"
              step="0.001"
              value={form.quantity}
              onChange={change}
              placeholder="0.000"
              required
            />
          </label>

          <label>
            Rate · LKR
            <input
              name="rate"
              type="number"
              min="0"
              step="0.01"
              value={form.rate}
              onChange={change}
              placeholder="0.00"
              required
            />
          </label>
        </div>
      </fieldset>

      <div className="bq-estimate">
        <span>Calculated amount preview</span>
        <strong>{money(Number(form.quantity) * Number(form.rate))}</strong>
      </div>

      {(validationError || error) && (
        <div className="bq-alert bq-error" role="alert">
          {validationError || error}
        </div>
      )}

      <div className="bq-modal-actions">
        <button
          type="button"
          className="bq-button bq-secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="bq-button bq-primary"
          disabled={busy}
        >
          {busy ? <Loader2 size={16} className="bq-spin" /> : <CheckCircle2 size={16} />}
          {busy ? "Saving…" : item ? "Save changes" : "Add item"}
        </button>
      </div>
    </form>
  );
}


function ItemsTable({ items, editable, busy, onEdit, onDelete }) {
  const number = (value) =>
    Number(value ?? 0).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="bq-table-scroll">
      <table className="bq-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Description</th>
            <th scope="col">Unit</th>
            <th scope="col" className="bq-number">Qty</th>
            <th scope="col" className="bq-number">Rate (LKR)</th>
            <th scope="col" className="bq-number">Amount (LKR)</th>
            {editable && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id ?? `${item.item_no}-${index}`}>
              <td className="bq-item-number">{item.item_no}</td>
              <td className="bq-description">{item.description}</td>
              <td>{displayUnit(item.unit)}</td>
              <td className="bq-number">{number(item.quantity)}</td>
              <td className="bq-number">{number(item.rate)}</td>
              <td className="bq-number bq-amount">
                {number(item.amount)}
              </td>
              {editable && (
                <td>
                  <div className="bq-row-actions">
                    <button
                      type="button"
                      className="bq-icon-button"
                      title="Edit item"
                      aria-label={`Edit item ${item.item_no}`}
                      disabled={busy}
                      onClick={() => onEdit(item)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="bq-icon-button bq-delete"
                      title="Delete item"
                      aria-label={`Delete item ${item.item_no}`}
                      disabled={busy}
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BOQSection({
  projectId,
  projectRole,
  projectStatus,
}) {
  const fileInputRef = useRef(null);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [boqs, setBoqs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");

  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [reason, setReason] = useState("");

  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
const [initialItemNo, setInitialItemNo] = useState("");
  const [importReason, setImportReason] = useState("");
  const [itemSearch, setItemSearch] = useState("");
const [itemSection, setItemSection] = useState("all");

  const isArchived = projectStatus === "archived";
const isQS = projectRole === "qs" && !isArchived;
  const isOwner = ["owner", "building_owner"].includes(projectRole);

  const visibleBOQs = isOwner
    ? boqs
        .filter((item) => item.status === "published")
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, 1)
    : boqs;

  const boq =
    visibleBOQs.find((item) => String(item.id) === String(selectedId)) ||
    visibleBOQs[0] ||
    null;

  const draft = boqs.find((item) => item.status === "draft");

  const latestPublished = [...boqs]
    .filter((item) => item.status === "published")
    .sort((a, b) => Number(b.id) - Number(a.id))[0];

  const canEdit = isQS && boq?.status === "draft";
  const sourceBOQ = !isOwner && boq?.source_boq_id != null
  ? visibleBOQs.find(
      (version) => String(version.id) === String(boq.source_boq_id)
    )
  : null;

const revisionChanges = [];

if (sourceBOQ && Array.isArray(sourceBOQ.items) && Array.isArray(boq.items)) {
  const itemKey = (item) => String(item.item_no).trim().toLowerCase();
  const previousItems = new Map(
    sourceBOQ.items.map((item) => [itemKey(item), item])
  );

  for (const item of boq.items) {
    const key = itemKey(item);
    const previous = previousItems.get(key);

    if (!previous) {
      revisionChanges.push({ key, item, status: "Added" });
    } else if (
      previous.description !== item.description ||
      previous.unit !== item.unit ||
      Number(previous.quantity) !== Number(item.quantity) ||
      Number(previous.rate) !== Number(item.rate)
    ) {
      revisionChanges.push({ key, item, previous, status: "Changed" });
    }

    previousItems.delete(key);
  }

  for (const [key, item] of previousItems) {
    revisionChanges.push({ key, item, status: "Removed" });
  }
}

const canCompare =
  sourceBOQ &&
  Array.isArray(sourceBOQ.items) &&
  Array.isArray(boq.items);
  const boqItems = boq?.items ?? [];

function getItemSection(item) {
  const itemNumber = String(item.item_no ?? "").trim();
  const match = itemNumber.match(/^(\d+)\./);
  return match ? match[1] : "other";
}

const itemSections = [
  ...new Set(boqItems.map(getItemSection)),
];

const searchText = itemSearch.trim().toLowerCase();

const filteredItems = boqItems.filter((item) => {
  const matchesSection =
    itemSection === "all" || getItemSection(item) === itemSection;

  const matchesSearch = [
    item.item_no,
    item.description,
    displayUnit(item.unit),
  ].some((value) =>
    String(value ?? "").toLowerCase().includes(searchText)
  );

  return matchesSection && matchesSearch;
});

const visibleItemGroups = itemSections
  .map((section) => ({
    section,
    items: filteredItems.filter(
      (item) => getItemSection(item) === section
    ),
  }))
  .filter((group) => group.items.length > 0);

  const canRevise =
    isQS &&
    boq?.status === "published" &&
    boq.id === latestPublished?.id &&
    !draft;

    console.log("BOQ revision check", {
  projectRole,
  isQS,
  selectedId: boq?.id,
  selectedStatus: boq?.status,
  latestPublishedId: latestPublished?.id,
  draftId: draft?.id,
  canRevise,
});

  const loadBOQs = useCallback(
    async (preferredId = null) => {
      const requestId = ++requestRef.current;

      setLoading(true);
      setLoadError("");

      try {
        const data = await getProjectBOQs(projectId);

        if (requestId !== requestRef.current) return;

        const list = Array.isArray(data)
          ? [...data].sort((a, b) => Number(b.id) - Number(a.id))
          : [];

        setBoqs(list);
        setSelectedId((previous) => {
          const wanted = preferredId ?? previous;

          return list.some((item) => String(item.id) === String(wanted))
            ? String(wanted)
            : String(list[0]?.id ?? "");
        });
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setLoadError(err?.message || "Unable to load BOQ.");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    setBoqs([]);
    setSelectedId("");
    setPreview(null);
    setFileName("");
    setModal(null);
    setError("");
    setSuccess("");
    loadBOQs();

    return () => {
      requestRef.current += 1;
    };
  }, [loadBOQs, projectRole]);

  async function perform(key, action, afterSuccess) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(key);
    setError("");
    setModalError("");
    setSuccess("");

    try {
      const result = await action();
      await afterSuccess(result);
    } catch (err) {
      const message = err?.message || "Unable to complete this action.";

      if (["save", "revision", "publish", "delete"].includes(key)) {
        setModalError(message);
      } else {
        setError(message);
      }
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  function openModal(type, item = null, itemNo = "") {
  if (busyRef.current || !isQS) return;

  setModalError("");
  setEditingItem(type === "item" ? item : null);
  setInitialItemNo(type === "item" && !item ? itemNo : "");
  setDeleteItem(type === "delete" ? item : null);
  setReason("");
  setModal(type);
}

  function closeModal() {
    if (busyRef.current) return;
    setModal(null);
    setModalError("");
  }

  function createInitial() {
    if (!isQS || boqs.length) return;

    perform(
      "create",
      () => createBOQ(projectId, { title: "Initial BOQ", notes: null }),
      async (created) => {
        setSuccess("Initial BOQ Rev 00 created successfully.");
        await loadBOQs(created.id);
      }
    );
  }

  function saveItem(data) {
    if (!canEdit || !boq) return;

    perform(
      "save",
      () =>
        editingItem
          ? updateBOQItem(boq.id, editingItem.id, data)
          : createBOQItem(boq.id, data),
      async () => {
        setModal(null);
        setSuccess(editingItem ? "BOQ item updated." : "BOQ item added.");
        await loadBOQs(boq.id);
      }
    );
  }

  function removeItem() {
    if (!canEdit || !deleteItem) return;

    perform(
      "delete",
      () => deleteBOQItem(boq.id, deleteItem.id),
      async () => {
        setModal(null);
        setSuccess("BOQ item deleted.");
        await loadBOQs(boq.id);
      }
    );
  }

  function publish() {
    if (!canEdit || !boq.items?.length) return;

    perform(
      "publish",
      () => publishBOQ(boq.id),
      async (published) => {
        setModal(null);
        setSuccess(
          `Rev ${revisionLabel(published.revision)} published successfully.`
        );
        await loadBOQs(published.id);
      }
    );
  }

  function revise(event) {
    event.preventDefault();
    if (!canRevise) return;

    const cleanReason = reason.trim();

    if (cleanReason.length < 5) {
      setModalError("Enter a revision reason with at least 5 characters.");
      return;
    }

    perform(
      "revision",
      () => createBOQRevision(boq.id, cleanReason),
      async (created) => {
        setModal(null);
        setSuccess(
          `Draft Rev ${revisionLabel(created.revision)} created. The previous version is unchanged.`
        );
        await loadBOQs(created.id);
      }
    );
  }


async function readExcel(event) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file || !isQS || busyRef.current) return;

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    setError("Choose an .xlsx Excel file.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setError("Excel file must be 5 MB or smaller.");
    return;
  }

  perform(
    "preview",
    () => previewBOQImport(projectId, file),
    async (data) => {
      setFileName(file.name);
      setPreview(data);
    }
  );
}

  function confirmImport() {
  if (!isQS || !preview?.items?.length || busyRef.current) return;

  const reason = importReason.trim();

  if (preview.sourceBoqId != null && !reason) {
    setError("Enter a reason for the revision.");
    return;
  }

  const payload = {
    title: "Imported BOQ",
    notes: fileName ? `Imported from ${fileName}` : null,
    items: preview.items,
  };

  if (preview.sourceBoqId != null) {
    payload.source_boq_id = preview.sourceBoqId;
    payload.revision_reason = reason;
  }

  perform(
    "import",
    () => confirmBOQImport(projectId, payload),
    async (created) => {
      setPreview(null);
      setFileName("");
      setImportReason("");
      setSuccess(`Excel BOQ imported as draft Rev ${created.revision}.`);
      await loadBOQs(created.id);
    }
  );
}

 function printBOQ() {
  if (!boq) return;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    setError("Allow pop-ups for Buildora to print this BOQ.");
    return;
  }

  printWindow.opener = null;
  const doc = printWindow.document;
  doc.title = `BOQ - Rev ${revisionLabel(boq.revision)}`;

  function appendText(parent, tag, value) {
    const element = doc.createElement(tag);
    element.textContent = String(value ?? "");
    parent.appendChild(element);
  }

  appendText(doc.head, "style", `
    body { font: 13px Arial, sans-serif; margin: 24px; color: #222; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f2efec; }
    tr { break-inside: avoid; }
  `);

  appendText(doc.body, "h1", boq.title || "Bill of Quantities");
  appendText(
    doc.body,
    "p",
    `Revision ${revisionLabel(boq.revision)} · ${boq.status}`
  );

  if (boq.revision_reason) {
    appendText(doc.body, "p", `Revision reason: ${boq.revision_reason}`);
  }

  const table = doc.createElement("table");
  const header = table.createTHead().insertRow();

  for (const label of ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]) {
    appendText(header, "th", label);
  }

  const body = table.createTBody();

  for (const item of boq.items ?? []) {
    const row = body.insertRow();

    for (const value of [
      item.item_no,
      item.description,
      displayUnit(item.unit),
      item.quantity,
      money(item.rate),
      money(item.amount),
    ]) {
      appendText(row, "td", value);
    }
  }

  doc.body.appendChild(table);
  appendText(doc.body, "strong", `BOQ total: ${money(boq.total_amount)}`);

  printWindow.focus();
  printWindow.print();
}
  function exportExcel() {
  if (!boq) return;

  const selectedBOQ = boq;

  perform(
    "export",
    () => downloadBOQExcel(selectedBOQ.id),
    async (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const revision = revisionLabel(selectedBOQ.revision)
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      link.href = url;
      link.download =
        `Buildora_BOQ_${selectedBOQ.id}_Rev_${revision}.xlsx`;

      document.body.appendChild(link);

      try {
        link.click();
      } finally {
        link.remove();

        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10000);
      }

      setSuccess("BOQ Excel download started.");
    }
  );
}

  const notices = (
    <>
      {error && <div className="bq-alert bq-error" role="alert">{error}</div>}
      {success && (
        <div className="bq-alert bq-success" role="status">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="bq-root">
      {loading ? (
        <div className="bq-loading" role="status">
          <Loader2 size={22} className="bq-spin" />
          Loading bill of quantities…
        </div>
      ) : loadError ? (
        <div className="bq-empty" role="alert">
          <span className="bq-tile"><ReceiptText size={26} /></span>
          <h3>Unable to load BOQ</h3>
          <p>{loadError}</p>
          <button
            type="button"
            className="bq-button bq-secondary"
            disabled={Boolean(busy)}
            onClick={() => loadBOQs()}
          >
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : preview && isQS ? (
        <>
          <button
            type="button"
            className="bq-back"
            disabled={Boolean(busy)}
            onClick={() => {
              setPreview(null);
              setFileName("");
              setError("");
            }}
          >
            <ArrowLeft size={16} /> Back to BOQ
          </button>

          <div className="bq-heading">
            <div>
              <p className="bq-eyebrow">Excel import preview</p>
              <h2>Review your quantities</h2>
              <p className="bq-muted">
                {preview.sourceBoqId != null
  ? "Review the extracted items before creating a new draft revision."
  : "Review the extracted items before creating draft Rev 00."}
              </p>
            </div>
            <span className="bq-badge">
              {preview.items?.length || 0} items
            </span>
          </div>

          {notices}

          <div className="bq-file">
            <FileSpreadsheet size={23} />
            <div>
              <strong>{preview.file_name || fileName}</strong>
              <p className="bq-muted">Sheet: {preview.sheet_name}</p>
            </div>
          </div>

          <div className="bq-sheet">
            <ItemsTable items={preview.items || []} />
            <div className="bq-total">
              <span>Calculated total</span>
              <strong>{money(preview.calculated_total)}</strong>
            </div>
          </div>

          {preview.sourceBoqId != null && (
            <label>
              Revision reason
              <textarea
                value={importReason}
                onChange={(event) => setImportReason(event.target.value)}
                maxLength={2000}
                disabled={Boolean(busy)}
                rows={3}
                placeholder="Explain what changed in this BOQ."
              />
            </label>
          )}
          <div className="bq-bottom-actions">
            <button
              type="button"
              className="bq-button bq-secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setPreview(null);
                setFileName("");
                setError("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bq-button bq-primary"
              onClick={confirmImport}
              disabled={Boolean(busy) || !preview.items?.length}
            >
              {busy ? <Loader2 size={16} className="bq-spin" /> : <CheckCircle2 size={16} />}
              {busy ? "Importing…" : "Confirm import"}
            </button>
          </div>
        </>
      ) : !boq ? (
        <>
          <div className="bq-heading">
            <div>
              <p className="bq-eyebrow">Project cost workspace</p>
              <h2>Bill of quantities</h2>
              <p className="bq-muted">
                {isQS
                  ? "Start a measured cost breakdown for this project."
                  : "Your project quantities and cost details."}
              </p>
            </div>
            {!isQS && (
              <span className="bq-badge"><Eye size={14} /> View only</span>
            )}
          </div>

          {notices}

          {isQS ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={readExcel}
                hidden
              />

              <div className="bq-start-grid">
                <button
                  type="button"
                  className="bq-start-card"
                  disabled={Boolean(busy)}
                  onClick={createInitial}
                >
                  <span className="bq-tile bq-dark">
                    {busy === "create"
                      ? <Loader2 size={23} className="bq-spin" />
                      : <Plus size={23} />}
                  </span>
                  <h3>Create a new BOQ</h3>
                  <p>Enter measured items, quantities and rates directly in Buildora.</p>
                  <strong>Start with Rev 00 <span>↗</span></strong>
                </button>

                <button
                  type="button"
                  className="bq-start-card"
                  disabled={Boolean(busy)}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="bq-tile bq-green">
                    {busy === "preview"
                      ? <Loader2 size={23} className="bq-spin" />
                      : <Upload size={23} />}
                  </span>
                  <h3>Import Excel (.xlsx)</h3>
<p>
  Already have a BOQ in Excel? Upload it and review the items
  before saving your first draft.
</p>
<strong>Choose Excel file <span aria-hidden="true">↗</span></strong>
                </button>
              </div>

              <div className="bq-help">
                <FileSpreadsheet size={17} />
                <span>
                  Required headers: Item No · Description · Unit · Quantity · Rate.
                  Maximum file size: 5 MB.
                </span>
              </div>
            </>
          ) : (
            <div className="bq-empty">
              <span className="bq-tile"><ReceiptText size={27} /></span>
              <h3>
                {isOwner ? "No published BOQ yet" : "Your BOQ is waiting to begin"}
              </h3>
              <p>
                {isOwner
                  ? "The latest BOQ will appear here after your Quantity Surveyor publishes it."
                  : "A Quantity Surveyor assigned to this project can create or import its BOQ."}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bq-heading">
            <div>
              <p className="bq-eyebrow">Bill of quantities</p>
              
<div className="bq-title-row">
  <h2>{boq.title}</h2>

</div>

              <p className="bq-muted">
                {canEdit
                  ? "Review quantities and rates before publishing."
                  : "A clear breakdown of your project quantities and costs."}
              </p>
            </div>

<div className="bq-toolbar">
<details className="bq-more">
  <summary className="bq-icon-button" aria-label="More BOQ actions">
    <span aria-hidden="true">⋯</span>
  </summary>

  <div className="bq-more-actions">
    <button
      type="button"
      className="bq-button bq-secondary"
      disabled={Boolean(busy)}
      onClick={exportExcel}
    >
      <Download size={16} aria-hidden="true" />
      {busy === "export" ? "Downloading…" : "Download Excel"}
    </button>
   
   <button
  type="button"
  className="bq-button bq-secondary"
  disabled={Boolean(busy)}
  onClick={printBOQ}
>
  Print / Save as PDF
</button>
  </div>
</details>

{canEdit && (
  <button
    type="button"
    className="bq-button bq-primary"
    disabled={Boolean(busy) || !boq.items?.length}
    onClick={() => openModal("publish")}
  >
    <Send size={15} aria-hidden="true" />
    Publish BOQ
  </button>
)}

{canRevise && (
                <button
                  type="button"
                  className="bq-button bq-primary"
                  disabled={Boolean(busy)}
                  onClick={() => openModal("revision")}
                >
                  <Plus size={16} /> Create revision
                </button>
              )}

              {canRevise && (
  <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx"
      onChange={readExcel}
      hidden
    />

    <button
      type="button"
      className="bq-button bq-secondary"
      disabled={Boolean(busy)}
      onClick={() => fileInputRef.current?.click()}
    >
      <Upload size={16} aria-hidden="true" />
      Import Excel as revision
    </button>
  </>
)}
            </div>
          </div>

          {notices}


{notices}

<div className="bq-version-bar">
  <div className="bq-version-select">
    <History size={17} />
    {isOwner ? (
      <span>Latest published version</span>
    ) : (
      <select
        aria-label="BOQ revision"
        value={String(boq.id)}
        disabled={Boolean(busy)}
        onChange={(event) => {
          setSelectedId(event.target.value);
          setItemSearch("");
          setItemSection("all");
          setError("");
          setSuccess("");
        }}
      >
        {visibleBOQs.map((version) => (
          <option key={version.id} value={String(version.id)}>
            Rev {revisionLabel(version.revision)} · {version.status}
          </option>
        ))}
      </select>
    )}
  </div>

  {canCompare && (
    <details className="bq-toolbar-details">
      <summary>Compare</summary>
      <div className="bq-toolbar-popover">
        <strong>
          Rev {revisionLabel(sourceBOQ.revision)} → Rev{" "}
          {revisionLabel(boq.revision)}
        </strong>
        <p>
          Total difference:{" "}
          {money(
            Number(boq.total_amount) -
              Number(sourceBOQ.total_amount)
          )}
        </p>
        {revisionChanges.length === 0 ? (
          <p>No item changes.</p>
        ) : (
          <ul>
            {revisionChanges.map(
              ({ key, item, previous, status }) => (
                <li key={key}>
                  <strong>{status}</strong> · {item.item_no} ·{" "}
                  {item.description}
                  {previous && (
                    <div>
                      Qty: {previous.quantity} → {item.quantity}
                      {" · "}
                      Rate: {money(previous.rate)} →{" "}
                      {money(item.rate)}
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </details>
  )}

  {boq.revision_reason && (
    <details className="bq-toolbar-details">
      <summary>Revision reason</summary>
      <div className="bq-toolbar-popover">
        {boq.revision_reason}
      </div>
    </details>
  )}

  <div className="bq-version-metrics">
    <span>
      {boqItems.length}{" "}
      {boqItems.length === 1 ? "item" : "items"}
      {" · "}
      {itemSections.length}{" "}
      {itemSections.length === 1 ? "section" : "sections"}
    </span>
    <strong>{money(boq.total_amount)}</strong>
  </div>
</div>

{boq.revision_reason && (
  <div className="bq-reason-inline">
    <span aria-hidden="true">ⓘ</span>
    <span>{boq.revision_reason}</span>
  </div>
)}

{boqItems.length > 0 && (
  <div className="bq-item-filters">
    <label>
      <span>Search items</span>
      <input
        type="search"
        value={itemSearch}
        onChange={(event) => setItemSearch(event.target.value)}
        placeholder="Search items..."
      />
    </label>

    <label>
      <span>Section</span>
      <select
        value={itemSection}
        onChange={(event) => setItemSection(event.target.value)}
      >
        <option value="all">All sections</option>
        {itemSections.map((section) => (
          <option key={section} value={section}>
            {section === "other"
              ? "Other items"
              : `Section ${section}`}
          </option>
        ))}
      </select>
    </label>

    {canEdit && (
      <button
        type="button"
        className="bq-button bq-secondary bq-filter-add"
        disabled={Boolean(busy)}
        onClick={() => openModal("item")}
      >
        <Plus size={16} />
        Add item
      </button>
    )}
  </div>
)}

<div className="bq-sheet">
  {!boqItems.length && (
    <div className="bq-empty">
      <ReceiptText size={26} />
      <h3>No measured items yet</h3>
      <p>
        {canEdit
          ? "Add your first BOQ item to begin."
          : "Your Quantity Surveyor will add the BOQ items."}
      </p>
      {canEdit && (
        <button
          type="button"
          className="bq-button bq-primary"
          disabled={Boolean(busy)}
          onClick={() => openModal("item")}
        >
          <Plus size={16} />
          Add first item
        </button>
      )}
    </div>
  )}

  {boqItems.length > 0 && filteredItems.length === 0 && (
    <div className="bq-empty">
      <h3>No matching items</h3>
      <button
        type="button"
        className="bq-button bq-secondary"
        onClick={() => {
          setItemSearch("");
          setItemSection("all");
        }}
      >
        Clear filters
      </button>
    </div>
  )}

  {visibleItemGroups.map(({ section, items }) => {
    const subtotal = items.reduce(
      (total, item) =>
        total + Math.round(Number(item.amount || 0) * 100),
      0
    ) / 100;

    return (
      <details
        className="bq-item-group"
        key={`${boq.id}-${section}`}
        open
      >
        <summary>
          <span>
            {section === "other"
              ? "Other items"
              : `Section ${section}`}
          </span>
          <strong>
            Subtotal{" "}
            {money(subtotal)}
          </strong>
        </summary>

        <ItemsTable
          items={items}
          editable={canEdit}
          busy={Boolean(busy)}
          onEdit={(item) => openModal("item", item)}
          onDelete={(item) => openModal("delete", item)}
        />

        {canEdit && section !== "other" && (
          <button
            type="button"
            className="bq-button bq-secondary bq-section-add"
            disabled={Boolean(busy)}
            onClick={() =>
              openModal("item", null, `${section}.`)
            }
          >
            <Plus size={16} />
            Add item to this section
          </button>
        )}
      </details>
    );
  })}

  <div className="bq-total bq-total-sticky">
    <div>
      <span>
        BOQ total · Rev {revisionLabel(boq.revision)}{" "}
        {boq.status}
      </span>
    </div>
    <strong>{money(boq.total_amount)}</strong>
  </div>
</div>

{boq.status === "published" ? (
  <div className="bq-info">
    <LockKeyhole size={17} />
    <p>
      Published {dateLabel(boq.published_at)}.
      This version is locked.
      {canRevise && " Create a revision to make changes."}
    </p>
  </div>
) : !isQS ? (
  <div className="bq-info">
    <Eye size={17} />
    <p>
      Read-only preview. Your Quantity Surveyor manages this BOQ.
    </p>
  </div>
) : (
  <div className="bq-info">
    <Pencil size={17} />
    <p>
      Draft workspace. Building Owners will see this version
      after publication.
    </p>
  </div>
)}

        </>
      )}

      {modal && isQS && (
        <Modal
          title={
            modal === "item"
              ? editingItem ? "Edit BOQ item" : "Add BOQ item"
              : modal === "revision"
                ? "Create a new revision"
                : modal === "publish"
                  ? "Publish this BOQ?"
                  : "Delete this item?"
          }
          description={
            modal === "item"
              ? "Enter the measured quantity and rate. Final amounts are calculated by the server."
              : modal === "revision"
                ? "The published version stays unchanged. Its items will be copied into a new draft."
                : modal === "publish"
                  ? "Publishing makes this the latest BOQ visible to the Building Owner and locks its items."
                  : `Item ${deleteItem?.item_no} will be removed from this draft.`
          }
          busy={Boolean(busy)}
          onClose={closeModal}
        >
          {modal === "item" ? (
            <ItemForm
              item={editingItem}
              initialItemNo={initialItemNo}
              busy={Boolean(busy)}
              error={modalError}
              onSave={saveItem}
              onClose={closeModal}
            />
          ) : modal === "revision" ? (
            <form className="bq-form" onSubmit={revise}>
              <label>
                Revision reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why this revision is needed"
                  minLength={5}
                  maxLength={2000}
                  rows={4}
                  required
                  disabled={Boolean(busy)}
                />
              </label>

              {modalError && <div className="bq-alert bq-error" role="alert">{modalError}</div>}

              <div className="bq-modal-actions">
                <button type="button" className="bq-button bq-secondary" onClick={closeModal} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button type="submit" className="bq-button bq-primary" disabled={Boolean(busy)}>
                  {busy ? <Loader2 size={16} className="bq-spin" /> : <Plus size={16} />}
                  {busy ? "Creating…" : "Create draft"}
                </button>
              </div>
            </form>
          ) : (
            <>
              {modalError && <div className="bq-alert bq-error" role="alert">{modalError}</div>}

              <div className="bq-modal-actions">
                <button type="button" className="bq-button bq-secondary" onClick={closeModal} disabled={Boolean(busy)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`bq-button ${modal === "delete" ? "bq-danger" : "bq-primary"}`}
                  disabled={Boolean(busy)}
                  onClick={modal === "publish" ? publish : removeItem}
                >
                  {busy && <Loader2 size={16} className="bq-spin" />}
                  {busy ? "Saving…" : modal === "publish" ? "Publish BOQ" : "Delete item"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}