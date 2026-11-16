import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Phone,
  Save,
  X,
} from "lucide-react";

import {
  getAccessToken,
  getMyProfile,
  saveProfileDetails,
} from "../services/workspaceApi";

import "../styles/ProfileDrawer.css";

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getInitials(value) {
  const parts = cleanName(value).split(" ").filter(Boolean);

  if (!parts.length) return "U";

  return (
    parts[0][0] +
    (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function formatJoinedDate(value) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cacheProfile(profile) {
  const storage = localStorage.getItem("buildora_access_token")
    ? localStorage
    : sessionStorage;

  const otherStorage =
    storage === localStorage ? sessionStorage : localStorage;

  otherStorage.removeItem("buildora_user");
  storage.setItem("buildora_user", JSON.stringify(profile));

  window.dispatchEvent(new Event("buildora-profile-updated"));
}

export default function ProfileDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function openProfile() {
      if (getAccessToken()) {
        setOpen(true);
      }
    }

    window.addEventListener("buildora-open-profile", openProfile);

    return () => {
      window.removeEventListener(
        "buildora-open-profile",
        openProfile
      );
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!open) return null;

  return (
    <ProfileDrawerContent onClose={() => setOpen(false)} />
  );
}

function ProfileDrawerContent({ onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const fileRef = useRef(null);
  const nameRef = useRef(null);

  const mountedRef = useRef(false);
  const savingRef = useRef(false);
  const previewUrlRef = useRef("");
  const requestRef = useRef(0);

  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [success, setSuccess] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);

  const changed =
    Boolean(profile) &&
    (cleanName(fullName) !== cleanName(profile.full_name) ||
      Boolean(photoFile) ||
      removePhoto);

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }

    setPreviewUrl("");
  }

  async function loadProfile() {
    const requestId = ++requestRef.current;
    const tokenAtStart = getAccessToken();

    setLoading(true);
    setLoadError("");

    try {
      const data = await getMyProfile();

      if (
        !mountedRef.current ||
        requestId !== requestRef.current ||
        getAccessToken() !== tokenAtStart
      ) {
        return;
      }

      setProfile(data);
      setFullName(data.full_name || "");
      cacheProfile(data);
    } catch (err) {
      if (
        mountedRef.current &&
        requestId === requestRef.current &&
        getAccessToken() === tokenAtStart
      ) {
        setLoadError(
          err?.message || "Unable to load your profile."
        );
      }
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;

    dialog.showModal();
    closeRef.current?.focus();

    void loadProfile();

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;

      dialog.close();

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }

      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      }
    };
    // This effect belongs to this drawer's mount/unmount lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    if (savingRef.current) return;

    if (changed) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  }

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || savingRef.current) return;

    setPhotoError("");
    setSuccess("");

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.type
      )
    ) {
      setPhotoError("Choose a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Choose an image that is 2 MB or smaller.");
      return;
    }

    clearPreview();

    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;

    setPhotoFile(file);
    setPreviewUrl(url);
    setRemovePhoto(false);
  }

  function handleRemovePhoto() {
    if (savingRef.current) return;

    clearPreview();
    setPhotoFile(null);
    setRemovePhoto(Boolean(profile?.photo_data));
    setPhotoError("");
    setSuccess("");
  }

  async function handleSave(event) {
    event.preventDefault();

    if (
      savingRef.current ||
      !profile ||
      !changed ||
      discardOpen
    ) {
      return;
    }

    const name = cleanName(fullName);

    setError("");
    setSuccess("");

    if (
      name.length < 2 ||
      name.length > 100 ||
      !/\p{L}/u.test(name)
    ) {
      setError(
        "Enter a name containing letters, between 2 and 100 characters."
      );
      nameRef.current?.focus();
      return;
    }

    const formData = new FormData();

    formData.append("full_name", name);
    formData.append("remove_photo", String(removePhoto));

    if (photoFile) {
      formData.append("photo", photoFile);
    }

    const tokenAtSave = getAccessToken();

    savingRef.current = true;
    setSaving(true);

    try {
      const updated = await saveProfileDetails(formData);

      if (
        !mountedRef.current ||
        getAccessToken() !== tokenAtSave
      ) {
        return;
      }

      cacheProfile(updated);
      setProfile(updated);
      setFullName(updated.full_name || "");

      clearPreview();
      setPhotoFile(null);
      setRemovePhoto(false);
      setPhotoError("");
      setDiscardOpen(false);
      setSuccess("Your profile has been updated.");
    } catch (err) {
      if (
        mountedRef.current &&
        getAccessToken() === tokenAtSave
      ) {
        setError(
          err?.message || "Unable to save your profile."
        );
      }
    } finally {
      savingRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  const photoSource =
    previewUrl ||
    (!removePhoto ? profile?.photo_data : "");

  return (
    <dialog
      ref={dialogRef}
      className="pd-dialog"
      aria-labelledby="pd-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <div className="pd-panel">
        <header className="pd-header">
          <h2 id="pd-title">Profile settings</h2>

          <button
            ref={closeRef}
            type="button"
            className="pd-close"
            aria-label="Close profile"
            disabled={saving}
            onClick={requestClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form
          className="pd-form"
          onSubmit={handleSave}
          aria-busy={saving}
        >
          <div className="pd-body">
            {loading ? (
              <p className="pd-state" role="status">
                <Loader2
                  size={20}
                  className="pd-spin"
                  aria-hidden="true"
                />
                Loading your profile…
              </p>
            ) : loadError ? (
              <div className="pd-load-error">
                <p className="pd-error" role="alert">
                  {loadError}
                </p>

                <button
                  type="button"
                  className="pd-cancel"
                  onClick={loadProfile}
                >
                  Try again
                </button>
              </div>
            ) : profile ? (
              <>
                <div className="pd-identity">
                  <div className="pd-avatar-wrap">
                    <div className="pd-avatar">
                      {photoSource ? (
                        <img
                          src={photoSource}
                          alt="Profile preview"
                        />
                      ) : (
                        getInitials(profile.full_name)
                      )}
                    </div>

                    <button
                      type="button"
                      className="pd-camera"
                      aria-label="Choose profile photo"
                      disabled={saving}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Camera size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="pd-identity-copy">
                    <h3>
                      {cleanName(profile.full_name).split(" ")[0] ||
                        "Your profile"}
                    </h3>

                    <div className="pd-photo-actions">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => fileRef.current?.click()}
                      >
                        {photoSource ? "Change photo" : "Add photo"}
                      </button>

                      {photoSource && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleRemovePhoto}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <p>JPG, PNG or WebP · Up to 2 MB</p>
                  </div>
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={saving}
                  onChange={choosePhoto}
                />

                {photoError && (
                  <p className="pd-error" role="alert">
                    {photoError}
                  </p>
                )}

                <h3 className="pd-section-title">
                  Personal details
                </h3>

                <div className="pd-field">
                  <label htmlFor="pd-name">Full name</label>

                  <input
                    ref={nameRef}
                    id="pd-name"
                    name="full_name"
                    autoComplete="name"
                    value={fullName}
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={saving}
                    aria-describedby="pd-name-help"
                    onChange={(event) => {
                      setFullName(event.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />

                  <p id="pd-name-help">
                    Your name across Buildora.
                  </p>
                </div>

                <div className="pd-field">
                  <label htmlFor="pd-email">
                    Email address
                    <LockKeyhole size={13} aria-hidden="true" />
                  </label>

                  <input
                    id="pd-email"
                    type="email"
                    value={profile.email || ""}
                    readOnly
                    aria-describedby="pd-email-help"
                  />

                  <p id="pd-email-help">
                    Used for sign-in and project invitations.
                  </p>
                </div>

                <section
                  className="pd-account-details"
                  aria-labelledby="pd-account-title"
                >
                  <h3 id="pd-account-title">Account details</h3>

                  <div>
                    <Phone size={17} aria-hidden="true" />
                    <span>Phone number</span>
                    <strong>
                      {profile.phone || "Not provided"}
                    </strong>
                  </div>

                  <div>
                    <CalendarDays size={17} aria-hidden="true" />
                    <span>Member since</span>
                    <strong>
                      {formatJoinedDate(profile.created_at)}
                    </strong>
                  </div>
                </section>
              </>
            ) : null}

            {error && (
              <p className="pd-error" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="pd-success" role="status">
                <CheckCircle2 size={17} aria-hidden="true" />
                {success}
              </p>
            )}

            {discardOpen && (
              <div className="pd-discard" role="alert">
                <strong>Discard your changes?</strong>

                <p>
                  Your unsaved name and photo changes will be
                  lost.
                </p>

                <div>
                  <button
                    type="button"
                    onClick={() => setDiscardOpen(false)}
                  >
                    Keep editing
                  </button>

                  <button type="button" onClick={onClose}>
                    Discard changes
                  </button>
                </div>
              </div>
            )}
          </div>

          <footer className="pd-footer">
            <span aria-live="polite">
              {saving
                ? "Saving…"
                : loading
                  ? "Loading account…"
                  : changed
                    ? "Unsaved changes"
                    : "No unsaved changes"}
            </span>

            <div>
              <button
                type="button"
                className="pd-cancel"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="pd-save"
                disabled={
                  saving ||
                  loading ||
                  !profile ||
                  !changed ||
                  discardOpen
                }
              >
                {saving ? (
                  <Loader2
                    size={16}
                    className="pd-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}

                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </dialog>
  );
}