import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FolderKanban,
  Loader2,
  X,
} from "lucide-react";

import { createProject } from "../services/workspaceApi";

import "../styles/CreateProjectModal.css";

const DISTRICTS = [
  "Ampara",
  "Anuradhapura",
  "Badulla",
  "Batticaloa",
  "Colombo",
  "Galle",
  "Gampaha",
  "Hambantota",
  "Jaffna",
  "Kalutara",
  "Kandy",
  "Kegalle",
  "Kilinochchi",
  "Kurunegala",
  "Mannar",
  "Matale",
  "Matara",
  "Monaragala",
  "Mullaitivu",
  "Nuwara Eliya",
  "Polonnaruwa",
  "Puttalam",
  "Ratnapura",
  "Trincomalee",
  "Vavuniya",
];

const JUNK_WORDS = new Set([
  "test",
  "dummy",
  "asdf",
  "asdfgh",
  "qwerty",
  "qwertyuiop",
  "abc",
  "abcd",
  "abcde",
  "xyz",
  "xxx",
  "xxxx",
  "aaa",
  "aaaa",
  "aaaaa",
  "sample",
  "nothing",
  "none",
  "null",
  "undefined",
  "hello",
  "hi",
  "blah",
  "blabla",
  "lorem",
  "ipsum",
]);

const EMPTY_FORM = {
  name: "",
  location: "",
  description: "",
};

function cleanText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTextError(
  value,
  label,
  minimumLetters,
  minimumWords
) {
  const letters = value.match(/\p{L}/gu) || [];
  const words = value.match(/\p{L}+/gu) || [];

  if (
    letters.length < minimumLetters ||
    words.length < minimumWords
  ) {
    return `Enter a meaningful ${label}.`;
  }

  if (words.some((word) => JUNK_WORDS.has(word.toLowerCase()))) {
    return `Enter a meaningful ${label}; placeholder text is not allowed.`;
  }

  const joinedLetters = letters.join("").toLowerCase();

  if (
    new Set(joinedLetters).size < 2 ||
    /(.)\1{4,}/u.test(joinedLetters)
  ) {
    return `Enter a valid ${label}; repeated characters are not allowed.`;
  }

  return "";
}

function validateField(field, rawValue) {
  const value = cleanText(rawValue);

  if (!value) {
    const labels = {
      name: "Project name",
      location: "Location",
      description: "Description",
    };

    return `${labels[field]} is required.`;
  }

  if (field === "name") {
    if (value.length < 3 || value.length > 150) {
      return "Project name must contain 3–150 characters.";
    }

    return meaningfulTextError(value, "project name", 3, 1);
  }

  if (field === "location") {
    return DISTRICTS.includes(value)
      ? ""
      : "Invalid location. Select a district from the list.";
  }

  if (value.length < 15 || value.length > 2000) {
    return "Description must contain 15–2000 characters.";
  }

  return meaningfulTextError(
    value,
    "description with at least three words",
    10,
    3
  );
}

function getServerErrors(error) {
  let detail =
    error?.response?.data?.detail ||
    error?.detail;

  if (!detail && error?.message) {
    try {
      detail = JSON.parse(error.message).detail;
    } catch {
      // Plain API error message.
    }
  }

  const fields = {};

  if (Array.isArray(detail)) {
    detail.forEach((item) => {
      const field = item.loc?.[item.loc.length - 1];

      if (["name", "location", "description"].includes(field)) {
        fields[field] = String(item.msg || "Invalid value.")
          .replace(/^Value error,\s*/i, "");
      }
    });
  }

  return {
    fields,
    message:
      typeof detail === "string"
        ? detail
        : Object.keys(fields).length
          ? "Please correct the highlighted fields."
          : error?.message || "Unable to create project.",
  };
}

export default function CreateProjectModal({
  open,
  organization,
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [serverError, setServerError] = useState("");

  const fieldRefs = useRef({});
  const dialogRef = useRef(null);
  const submittingRef = useRef(false);
  const createdRef = useRef(false);
  const sessionRef = useRef(0);
  const closeRef = useRef(onClose);

  closeRef.current = onClose;

  useEffect(() => {
    const sessionId = ++sessionRef.current;

    setForm({ ...EMPTY_FORM });
    setErrors({});
    setTouched({});
    setServerError("");
    setSaving(false);
    setCreated(false);

    submittingRef.current = false;
    createdRef.current = false;

    if (!open || !organization?.id) return;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    fieldRefs.current.name?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (!submittingRef.current) {
          closeRef.current?.();
        }

        return;
      }

      if (event.key !== "Tab") return;

      const controls = Array.from(
        dialogRef.current?.querySelectorAll(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
        ) || []
      ).filter((element) => element.getClientRects().length);

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (!first) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const focusInside = dialogRef.current?.contains(
        document.activeElement
      );

      if (
        event.shiftKey &&
        (document.activeElement === first || !focusInside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !focusInside)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (sessionRef.current === sessionId) {
        sessionRef.current += 1;
      }

      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      if (previousFocus?.isConnected) {
        previousFocus.focus?.();
      }
    };
  }, [open, organization?.id]);

  function requestClose() {
    if (!submittingRef.current) onClose();
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setServerError("");

    if (touched[name]) {
      setErrors((current) => ({
        ...current,
        [name]: validateField(name, value),
      }));
    }
  }

  function handleBlur(event) {
    const { name, value } = event.target;

    setTouched((current) => ({
      ...current,
      [name]: true,
    }));

    setErrors((current) => ({
      ...current,
      [name]: validateField(name, value),
    }));
  }

  function renderError(field) {
    if (!errors[field]) return null;

    return (
      <p
        id={`project-${field}-error`}
        className="cpm-field-error"
        role="alert"
      >
        {errors[field]}
      </p>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      submittingRef.current ||
      createdRef.current ||
      !organization?.id
    ) {
      return;
    }

    const nextErrors = {};

    Object.keys(EMPTY_FORM).forEach((field) => {
      const message = validateField(field, form[field]);

      if (message) nextErrors[field] = message;
    });

    setErrors(nextErrors);
    setTouched({
      name: true,
      location: true,
      description: true,
    });
    setServerError("");

    const firstInvalid = Object.keys(nextErrors)[0];

    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    const sessionId = sessionRef.current;

    submittingRef.current = true;
    setSaving(true);

    let createdProject;

    try {
      const payload = {
        name: cleanText(form.name),
        location: cleanText(form.location),
        description: cleanText(form.description),
      };

      const project = await createProject(
        organization.id,
        payload
      );

      if (sessionRef.current !== sessionId) return;

      createdRef.current = true;
      setCreated(true);

      createdProject = {
        ...project,
        name: project?.name || payload.name,
        organization_id:
          project?.organization_id || organization.id,
      };
    } catch (error) {
      if (sessionRef.current !== sessionId) return;

      const parsed = getServerErrors(error);

      setErrors(parsed.fields);
      setServerError(parsed.message);

      submittingRef.current = false;
      setSaving(false);

      const firstField = Object.keys(parsed.fields)[0];
      fieldRefs.current[firstField]?.focus();
      return;
    }

    if (!createdProject?.id) {
      setServerError(
        "Project was created, but its ID was not returned. Close this form and refresh the dashboard before trying again."
      );

      submittingRef.current = false;
      setSaving(false);
      return;
    }

    try {
      await onCreated(createdProject);
    } catch {
      if (sessionRef.current === sessionId) {
        setServerError(
          "Project was created, but its page could not be opened. Close this form and refresh the dashboard."
        );
      }
    } finally {
      if (sessionRef.current === sessionId) {
        submittingRef.current = false;
        setSaving(false);
      }
    }
  }

  if (!open || !organization) return null;

  return (
    <div
      className="cpm-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="cpm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        aria-describedby="create-project-description"
        tabIndex={-1}
      >
        <header className="cpm-header">
          <div className="cpm-header-top">
            <span className="cpm-icon" aria-hidden="true">
              <FolderKanban size={24} />
            </span>

            <button
              type="button"
              className="cpm-close"
              aria-label="Close project form"
              onClick={requestClose}
              disabled={saving}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <h2 id="create-project-title">Create project</h2>

          <p id="create-project-description">
            Add your project details to get started.
            All three fields are required.
          </p>

          <div className="cpm-organization">
            <Building2 size={15} aria-hidden="true" />
            <span>{organization.name}</span>
          </div>
        </header>

        <form
          className="cpm-form"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={saving}
        >
          <fieldset disabled={saving || created}>
            <div className="cpm-field">
              <label htmlFor="project-name">
                Project name <span aria-hidden="true">*</span>
              </label>

              <input
                ref={(element) => {
                  fieldRefs.current.name = element;
                }}
                id="project-name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Example: Sunrise Apartments"
                required
                minLength={3}
                maxLength={150}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name ? "project-name-error" : undefined
                }
              />

              {renderError("name")}
            </div>

            <div className="cpm-field">
              <label htmlFor="project-location">
                Location — District{" "}
                <span aria-hidden="true">*</span>
              </label>

              <select
                ref={(element) => {
                  fieldRefs.current.location = element;
                }}
                id="project-location"
                name="location"
                value={form.location}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                aria-invalid={Boolean(errors.location)}
                aria-describedby={
                  errors.location
                    ? "project-location-error"
                    : undefined
                }
              >
                <option value="">
                  Select a Sri Lankan district
                </option>

                {DISTRICTS.map((district) => (
                  <option value={district} key={district}>
                    {district}
                  </option>
                ))}
              </select>

              {renderError("location")}
            </div>

            <div className="cpm-field">
              <div className="cpm-label-row">
                <label htmlFor="project-description">
                  Description <span aria-hidden="true">*</span>
                </label>

                <span className="cpm-counter">
                  {form.description.length}/2000
                </span>
              </div>

              <textarea
                ref={(element) => {
                  fieldRefs.current.description = element;
                }}
                id="project-description"
                name="description"
                value={form.description}
                onChange={handleChange}
                onBlur={handleBlur}
                rows={4}
                placeholder="Example: Three-storey apartment building with six residential units."
                required
                minLength={15}
                maxLength={2000}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description
                    ? "project-description-hint project-description-error"
                    : "project-description-hint"
                }
              />

              {renderError("description")}

              <p
                id="project-description-hint"
                className="cpm-help"
              >
                Use at least 15 characters and three words.
              </p>
            </div>
          </fieldset>

          {created && (
            <div className="cpm-alert cpm-success" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Project created
                {saving ? ". Opening your workspace…" : "."}
              </span>
            </div>
          )}

          {serverError && (
            <div className="cpm-alert cpm-error" role="alert">
              {serverError}
            </div>
          )}

          <div className="cpm-actions">
            <button
              type="button"
              className="cpm-button cpm-secondary"
              onClick={requestClose}
              disabled={saving}
            >
              {created ? "Close" : "Cancel"}
            </button>

            <button
              type="submit"
              className="cpm-button cpm-primary"
              disabled={saving || created}
            >
              {saving ? (
                <>
                  <Loader2
                    size={16}
                    className="cpm-spin"
                    aria-hidden="true"
                  />
                  {created ? "Opening…" : "Creating…"}
                </>
              ) : created ? (
                <>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Created
                </>
              ) : (
                <>
                  Create project
                  <ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}