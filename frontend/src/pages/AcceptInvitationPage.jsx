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

function getAccessToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const invitationId = params.get("invitation") || "";
  const invitationToken = params.get("token") || "";

  const validLink =
    /^[1-9]\d*$/.test(invitationId) &&
    /^[A-Za-z0-9_-]{40,200}$/.test(invitationToken);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const actionRef = useRef(false);

  const signedIn = Boolean(getAccessToken());

  function goToAuthentication() {
  if (!validLink) return;

  const hasExistingSession = Boolean(getAccessToken());

  if (
    hasExistingSession &&
    !window.confirm(
      "Sign out of this Buildora session and sign in using the invited email?"
    )
  ) {
    return;
  }

  const query = new URLSearchParams({
    invitation: invitationId,
    token: invitationToken,
  });

  sessionStorage.setItem(
    "buildora_invitation_return",
    `/accept-invitation?${query.toString()}`
  );

  const authKeys = [
    "buildora_access_token",
    "buildora_refresh_token",
    "buildora_user",
    "buildora_active_organization",
    "buildora_active_project",
  ];

  for (const key of authKeys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  navigate("/invitation-auth");
}

  async function respondToInvitation(action) {
    if (
      !validLink ||
      actionRef.current ||
      result
    ) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      goToAuthentication();
      return;
    }

    const confirmed = window.confirm(
      action === "accept"
        ? "Accept this invitation and join the organization or project?"
        : "Decline this invitation?"
    );

    if (!confirmed) return;

    actionRef.current = true;
    setBusy(action);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/invitations/${invitationId}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: invitationToken,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.setItem(
            "buildora_invitation_return",
            `/accept-invitation?${params.toString()}`
          );

          throw new Error(
            "Your session has expired. Sign in again, then reopen this invitation."
          );
        }

        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Unable to process the invitation."
        );
      }

      if (
        !data ||
        data.status !== (
          action === "accept" ? "accepted" : "declined"
        )
      ) {
        throw new Error(
          "The response could not be confirmed. Check your dashboard before retrying."
        );
      }

      sessionStorage.removeItem(
        "buildora_invitation_return"
      );

      setResult(data);

      // Remove the secret from the visible URL after success.
      navigate("/accept-invitation", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process the invitation."
      );
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  }

  if (result) {
    const accepted = result.status === "accepted";

    return (
      <main className="invite-page">
        <section className="invite-card">
          <span className="invite-brand">BUILDORA</span>

          <h1>
            {accepted
              ? "Invitation accepted"
              : "Invitation declined"}
          </h1>

          <p role="status">
            {accepted
              ? "Your membership has been saved."
              : "You have declined this invitation."}
          </p>

          <Link
            className="invite-button invite-primary"
            to={
              accepted && result.project_id
                ? `/projects/${result.project_id}`
                : "/dashboard"
            }
          >
            {accepted && result.project_id
              ? "Open project"
              : "Go to dashboard"}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="invite-page">
      <section className="invite-card">
        <span className="invite-brand">BUILDORA</span>

        <h1>Project & company invitation</h1>

        {!validLink ? (
          <>
            <p role="alert">
              This invitation link is incomplete or invalid.
              Open the full link from your email, or ask
              the Company Admin to resend it.
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
              Sign in using the email address that received
              this invitation. Access will be added only
              after you accept.
            </p>

            <p className="invite-note">
              The server will check the invitation,
              expiry and your account before granting access.
            </p>

            {error && (
              <div
                className="invite-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="invite-actions">
              <button
                type="button"
                className="invite-button"
                disabled={Boolean(busy)}
                onClick={goToAuthentication}
              >
                {signedIn
                  ? "Sign in with another account"
                  : "Sign in / Register"}
              </button>

              {signedIn && (
                <>
                  <button
                    type="button"
                    className="invite-button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      respondToInvitation("decline")
                    }
                  >
                    {busy === "decline"
                      ? "Declining…"
                      : "Decline"}
                  </button>

                  <button
                    type="button"
                    className="invite-button invite-primary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      respondToInvitation("accept")
                    }
                  >
                    {busy === "accept"
                      ? "Accepting…"
                      : "Accept invitation"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}