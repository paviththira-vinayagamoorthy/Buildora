import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  RefreshCw,
  Save,
  UserRound,
} from "lucide-react";

import {
  getAccessToken,
  getMyProfile,
  updateMyProfile,
} from "../services/workspaceApi";

import "../styles/ProfilePage.css";

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getInitials(value) {
  const parts = cleanName(value).split(" ").filter(Boolean);

  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function cacheProfile(profile) {
  const storage = localStorage.getItem("buildora_access_token")
    ? localStorage
    : sessionStorage;

  const otherStorage =
    storage === localStorage ? sessionStorage : localStorage;

  storage.setItem("buildora_user", JSON.stringify(profile));
  otherStorage.removeItem("buildora_user");

  window.dispatchEvent(new Event("buildora-profile-updated"));
}

function joinedDate(value) {
  if (!value) return "Not recorded";

  const text = String(value);

  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
    ? text
    : `${text}Z`;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString("en-LK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const savingRef = useRef(false);

  const loadProfile = useCallback(async () => {
    const requestId = ++requestRef.current;
    const tokenAtStart = getAccessToken();

    setLoading(true);
    setLoadError("");
    setError("");
    setSuccess("");

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
        !mountedRef.current ||
        requestId !== requestRef.current ||
        getAccessToken() !== tokenAtStart
      ) {
        return;
      }

      setLoadError(err?.message || "Unable to load your profile.");
    } finally {
      if (
        mountedRef.current &&
        requestId === requestRef.current &&
        getAccessToken() === tokenAtStart
      ) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadProfile();

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [loadProfile]);

  async function handleSave(event) {
    event.preventDefault();

    if (savingRef.current || !profile) return;

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
      return;
    }

    if (name === cleanName(profile.full_name)) return;

    const tokenAtStart = getAccessToken();

    savingRef.current = true;
    setSaving(true);

    try {
      const updated = await updateMyProfile({
        full_name: name,
      });

      if (
        !mountedRef.current ||
        getAccessToken() !== tokenAtStart
      ) {
        return;
      }

      cacheProfile(updated);

      setProfile(updated);
      setFullName(updated.full_name || "");
      setSuccess("Your profile was updated successfully.");
    } catch (err) {
      if (
        mountedRef.current &&
        getAccessToken() === tokenAtStart
      ) {
        setError(err?.message || "Unable to update your profile.");
      }
    } finally {
      savingRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  function resetForm() {
    if (!profile || savingRef.current) return;

    setFullName(profile.full_name || "");
    setError("");
    setSuccess("");
  }

  const changed =
    Boolean(profile) &&
    cleanName(fullName) !== cleanName(profile.full_name);

  return (
    <div className="pf-page">
      <div className="pf-container">
        {/* COMPACT HEADER */}
        <header className="pf-header">
          <div>
            <p className="pf-eyebrow">My account</p>
            <h1>My profile</h1>

            <p className="pf-subtitle">
              View your account details and update your name.
            </p>
          </div>

          <span className="pf-header-icon" aria-hidden="true">
            <UserRound size={34} strokeWidth={1.5} />
          </span>
        </header>

        {loading ? (
          <div className="pf-card pf-state" role="status">
            <RefreshCw
              size={24}
              className="pf-spin"
              aria-hidden="true"
            />
            <p>Loading your profile…</p>
          </div>
        ) : loadError ? (
          <div className="pf-card pf-state" role="alert">
            <UserRound size={28} aria-hidden="true" />
            <p>{loadError}</p>

            <button
              type="button"
              className="pf-button pf-secondary"
              onClick={loadProfile}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : profile ? (
          <section
            className="pf-card"
            aria-labelledby="pf-information-title"
          >
            {/* SAVED ACCOUNT SUMMARY */}
            <div className="pf-account-summary">
              <span className="pf-avatar" aria-hidden="true">
                {getInitials(profile.full_name)}
              </span>

              <div className="pf-account-copy">
                <h2>{profile.full_name || "Buildora User"}</h2>
                <p>{profile.email}</p>
              </div>
            </div>

            <div className="pf-card-heading">
              <h2 id="pf-information-title">
                Personal information
              </h2>
              <p>Your details across Buildora.</p>
            </div>

            <form onSubmit={handleSave} aria-busy={saving}>
              <fieldset disabled={saving}>
                <div className="pf-field">
                  <label htmlFor="pf-name">Full name</label>

                  <input
                    id="pf-name"
                    name="full_name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      setError("");
                      setSuccess("");
                    }}
                    minLength={2}
                    maxLength={100}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={
                      error ? "pf-name-help pf-error" : "pf-name-help"
                    }
                  />

                  <p id="pf-name-help" className="pf-field-help">
                    This name appears on your Buildora account.
                  </p>
                </div>

                <div className="pf-field">
                  <label htmlFor="pf-email">Email address</label>

                  <input
                    id="pf-email"
                    type="email"
                    autoComplete="email"
                    value={profile.email || ""}
                    readOnly
                    aria-describedby="pf-email-help"
                  />

                  <p id="pf-email-help" className="pf-field-help">
                    Your sign-in and project invitation email.
                    This field cannot be changed here.
                  </p>
                </div>

                <div className="pf-details">
                  <div>
                    <span>Phone number</span>
                    <strong>
                      {profile.phone || "Not provided"}
                    </strong>
                  </div>

                  <div>
                    <span>Joined Buildora</span>
                    <strong>
                      {joinedDate(profile.created_at)}
                    </strong>
                  </div>
                </div>
              </fieldset>

              {error && (
                <div
                  id="pf-error"
                  className="pf-alert pf-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {success && (
                <div className="pf-alert pf-success" role="status">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>{success}</span>
                </div>
              )}

              <div className="pf-actions">
                <button
                  type="button"
                  className="pf-button pf-secondary"
                  disabled={saving || !changed}
                  onClick={resetForm}
                >
                  Reset
                </button>

                <button
                  type="submit"
                  className="pf-button pf-primary"
                  disabled={saving || !changed}
                >
                  {saving ? (
                    <RefreshCw
                      size={16}
                      className="pf-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save size={16} aria-hidden="true" />
                  )}

                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}