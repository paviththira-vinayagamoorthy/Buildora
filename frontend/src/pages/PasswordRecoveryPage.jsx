import { useRef, useState } from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import logo from "../assets/buildora-logo.png";

import "../styles/PasswordRecoveryPage.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function clearOldSession() {
  const keys = [
    "buildora_access_token",
    "buildora_refresh_token",
    "buildora_user",
    "buildora_active_organization",
    "buildora_active_project",
  ];

  for (const key of keys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export default function PasswordRecoveryPage({
  mode = "forgot",
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const isReset = mode === "reset";
  const token = params.get("token") || "";

  const validToken =
    /^[A-Za-z0-9_-]{40,200}$/.test(token);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (actionRef.current || success) return;

    setError("");

    if (isReset) {
      if (!validToken) {
        setError(
          "Open the full reset link from your email."
        );
        return;
      }

      if (
        password.length < 8 ||
        password.length > 128 ||
        !password.trim()
      ) {
        setError(
          "Enter a password containing 8 to 128 characters."
        );
        return;
      }

      if (password !== confirmation) {
        setError("Passwords do not match.");
        return;
      }
    } else if (!email.trim()) {
      setError("Enter your account email.");
      return;
    }

    actionRef.current = true;
    setBusy(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/${
          isReset ? "reset-password" : "forgot-password"
        }`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isReset
              ? {
                  token,
                  password,
                  confirm_password: confirmation,
                }
              : {
                  email: email.trim(),
                }
          ),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let message = "Unable to complete the request.";

        if (typeof data?.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((item) => item?.msg)
            .filter(Boolean)
            .join(", ");
        }

        throw new Error(message);
      }

      if (typeof data?.message !== "string") {
        throw new Error(
          "The response could not be confirmed. Please check before retrying."
        );
      }

      setSuccess(data.message);
      setPassword("");
      setConfirmation("");

      if (isReset) {
        clearOldSession();

        // Remove the secret token from the visible URL.
        navigate("/reset-password", {
          replace: true,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to connect to the server.";

      setError(
        isReset
          ? `${message} If the connection failed, check whether you can sign in with the new password before requesting another link.`
          : message
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  const invalidResetLink =
    isReset && !validToken && !success;

  return (
    <main className="password-recovery">
      <section className="pr-card">
        <Link to="/" className="pr-logo-link">
          <img
            src={logo}
            alt="Buildora home"
            className="pr-logo"
          />
        </Link>

        <p className="pr-eyebrow">ACCOUNT RECOVERY</p>

        <h1>
          {isReset
            ? "Choose a new password"
            : "Forgot your password?"}
        </h1>

        <p className="pr-description">
          {isReset
            ? "Set a new password for your Buildora account."
            : "Enter your account email. We will send a password reset link if an active account exists."}
        </p>

        {error && (
          <div className="pr-message pr-error" role="alert">
            {error}
          </div>
        )}

        {success ? (
          <>
            <div
              className="pr-message pr-success"
              role="status"
            >
              {success}
            </div>

            {!isReset && (
              <p className="pr-note">
                Check your inbox and spam folder. If you
                requested another link, use the latest email.
                Allow at least one minute before requesting again.
              </p>
            )}

            <Link
              to="/invitation-auth"
              className="pr-button pr-primary"
            >
              Go to sign in
            </Link>

            {!isReset && (
              <button
                type="button"
                className="pr-text-button"
                onClick={() => {
                  setSuccess("");
                  setError("");
                }}
              >
                Use another email or request again
              </button>
            )}
          </>
        ) : invalidResetLink ? (
          <>
            <div
              className="pr-message pr-error"
              role="alert"
            >
              This reset link is incomplete. Open the full
              email link or request a new one.
            </div>

            <Link
              to="/forgot-password"
              className="pr-button pr-primary"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <fieldset disabled={busy}>
              {isReset ? (
                <>
                  <label className="pr-field">
                    <span>New password</span>

                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      minLength={8}
                      maxLength={128}
                      required
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                    />
                  </label>

                  <label className="pr-field">
                    <span>Confirm new password</span>

                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmation}
                      minLength={8}
                      maxLength={128}
                      required
                      onChange={(event) =>
                        setConfirmation(event.target.value)
                      }
                    />
                  </label>

                  <label className="pr-checkbox">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(event) =>
                        setShowPassword(event.target.checked)
                      }
                    />
                    Show passwords
                  </label>

                  <p className="pr-note">
                    Use 8 to 128 characters. After reset,
                    sign in again using your new password.
                  </p>
                </>
              ) : (
                <label className="pr-field">
                  <span>Account email address</span>

                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    maxLength={255}
                    placeholder="you@example.com"
                    required
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                  />
                </label>
              )}

              <button
                type="submit"
                className="pr-button pr-primary"
              >
                {busy
                  ? isReset
                    ? "Updating password…"
                    : "Requesting link…"
                  : isReset
                    ? "Save new password"
                    : "Send reset link"}
              </button>
            </fieldset>
          </form>
        )}

        {!success && (
          <Link
            to="/invitation-auth"
            className="pr-back"
          >
            ← Back to sign in
          </Link>
        )}
      </section>
    </main>
  );
}