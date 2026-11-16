import { useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import "../styles/AcceptInvitationPage.css";

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export default function VerifyCompanyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token") || "";

  const validToken =
    /^[A-Za-z0-9_-]{40,200}$/.test(token);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);

  async function handleVerify() {
    if (
      !validToken ||
      actionRef.current ||
      success
    ) {
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/organization-email/verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Unable to verify your company email."
        );
      }

      if (typeof data?.message !== "string") {
        throw new Error(
          "The verification response could not be confirmed. Check the company verification page."
        );
      }

      setSuccess(data.message);

      // Remove the secret token from the visible URL.
      navigate("/verify-company-email", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to verify your company email."
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="invite-page bve-page">
      <section className="invite-card bve-card">

<h1>{success ? "Company email verified" : "Verify company email"}</h1>

{success ? (
  <div className="bve-success">
    <span className="bve-success-icon" aria-hidden="true">✓</span>

    <p role="status">
      Your company email is verified. Return to your dashboard to submit
      your application for Platform Admin review.
    </p>

    <div className="invite-actions bve-actions">
      <Link
        className="invite-button invite-primary bve-primary"
        to="/dashboard"
      >
        Open dashboard
      </Link>
    </div>

    <p className="invite-note bve-signin-note">
      If prompted, sign in with your Company Admin account.
    </p>
  </div>
) : !validToken ? (
          <>
            <p role="alert">
              This link is incomplete. Open the full link
              from your company email, or request a new one
              from your company workspace.
            </p>

            <Link
              className="invite-button"
              to="/"
            >
              Go to home
            </Link>
          </>
        ) : (
          <>
            <p>
              Confirm that this company email address can
              receive Buildora messages.
            </p>

            <p className="invite-note">
              Verify only if you requested this email for
              your company. This link can be used once and
              expires after 30 minutes.
            </p>

            {error && (
              <div
                className="invite-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="invite-actions bve-actions">
              <button
                type="button"
                className="invite-button invite-primary bve-primary"
                disabled={busy}
                onClick={handleVerify}
              >
                {busy
                  ? "Verifying…"
                  : "Verify company email"}
              </button>

              <Link
                className="invite-button"
                to="/"
              >
                Go to home
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}