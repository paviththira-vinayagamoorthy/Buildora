import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserPlus,
} from "lucide-react";

import { GoogleLogin } from "@react-oauth/google";

import authBuilding from "../assets/buildora-auth-building.png";
import "../styles/SignInForm.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");


/* =========================================================
   API ERROR MESSAGE
========================================================= */

function getErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (Array.isArray(data?.detail)) {
    return (
      data.detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(", ") || fallback
    );
  }

  return fallback;
}


/* =========================================================
   SIGN IN FORM
========================================================= */

function SignInForm({
  openRegister,
  openForgotPassword,
}) {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);

  const busy = loading || googleLoading;


  /* =======================================================
     CLEAR OLD AUTH
     Keep invitation return information.
  ======================================================= */

  function clearStoredAuth() {
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


  /* =======================================================
     SAVE AUTH AFTER SERVER ACCOUNT VALIDATION
  ======================================================= */

  async function saveBuildoraAuth(authData) {
    const accessToken = authData?.access_token;

    if (
      typeof accessToken !== "string" ||
      !accessToken
    ) {
      throw new Error(
        "Access token was not returned by the server."
      );
    }

    const response = await fetch(
      `${API_BASE_URL}/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const user = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          user,
          "Unable to load your account."
        )
      );
    }

    if (
      !user ||
      !Number.isInteger(user.id) ||
      user.id <= 0 ||
      user.is_active !== true
    ) {
      throw new Error(
        "The server did not return a valid active account."
      );
    }

    clearStoredAuth();

    const storage = rememberMe
      ? localStorage
      : sessionStorage;

    try {
      storage.setItem(
        "buildora_access_token",
        accessToken
      );

      if (authData.refresh_token) {
        storage.setItem(
          "buildora_refresh_token",
          authData.refresh_token
        );
      }

      storage.setItem(
        "buildora_user",
        JSON.stringify(user)
      );
    } catch {
      clearStoredAuth();

      throw new Error(
        "Unable to save your session. Check your browser storage settings."
      );
    }

    return user;
  }


  /* =======================================================
     LOGIN DESTINATION
  ======================================================= */

  function navigateAfterLogin(user) {
    const savedPath = sessionStorage.getItem(
      "buildora_invitation_return"
    );

    sessionStorage.removeItem(
      "buildora_invitation_return"
    );

    if (savedPath) {
      try {
        const destination = new URL(
          savedPath,
          window.location.origin
        );

        const invitationId =
          destination.searchParams.get("invitation") || "";

        const invitationToken =
          destination.searchParams.get("token") || "";

        const validDestination =
          destination.origin === window.location.origin &&
          destination.pathname === "/accept-invitation" &&
          /^[1-9]\d*$/.test(invitationId) &&
          /^[A-Za-z0-9_-]{40,200}$/.test(invitationToken);

        if (validDestination) {
          const query = new URLSearchParams({
            invitation: invitationId,
            token: invitationToken,
          });

          navigate(
            `/accept-invitation?${query.toString()}`,
            { replace: true }
          );

          return;
        }
      } catch {
        // Ignore an invalid return destination.
      }
    }

    navigate(
      user.system_role === "platform_admin"
        ? "/platform-admin"
        : "/dashboard",
      { replace: true }
    );
  }


  /* =======================================================
     EMAIL + PASSWORD LOGIN
  ======================================================= */

  async function handleSubmit(event) {
    event.preventDefault();

    if (actionRef.current) return;

    const form = new FormData(event.currentTarget);

    const email = String(
      form.get("email") || ""
    ).trim();

    const password = String(
      form.get("password") || ""
    );

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    actionRef.current = true;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Sign in failed. Please try again."
          )
        );
      }

      const signedInUser = await saveBuildoraAuth(data);

      setSuccess("Signed in successfully.");
      navigateAfterLogin(signedInUser);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again."
      );
    } finally {
      actionRef.current = false;
      setLoading(false);
    }
  }


  /* =======================================================
     GOOGLE LOGIN
  ======================================================= */

  async function handleGoogleSuccess(credentialResponse) {
    if (actionRef.current) return;

    const credential = credentialResponse?.credential;

    if (!credential) {
      setError(
        "Google did not return a valid credential."
      );
      return;
    }

    actionRef.current = true;

    setGoogleLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/google`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credential,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Google sign in failed. Please try again."
          )
        );
      }

      const signedInUser = await saveBuildoraAuth(data);

      setSuccess("Signed in with Google successfully.");
      navigateAfterLogin(signedInUser);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in with Google."
      );
    } finally {
      actionRef.current = false;
      setGoogleLoading(false);
    }
  }

  function handleGoogleError() {
    if (actionRef.current) return;

    setSuccess("");
    setError(
      "Google Sign-In was unsuccessful. Please try again."
    );
  }


  /* =======================================================
     UI
  ======================================================= */

  const inputClass =
    "h-[50px] w-full rounded-[14px] border border-[#DED3CB] bg-white/90 pl-11 pr-12 text-[13px] text-[#302536] outline-none transition placeholder:text-[#91898D] focus:border-[#D87963] focus:ring-4 focus:ring-[#D87963]/10 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="buildora-signin">
      {/* BUILDING IMAGE */}
      <div className="pointer-events-none absolute -right-8 -top-3 z-0 h-[245px] w-[285px] overflow-hidden">
        <img
          src={authBuilding}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain object-right-top opacity-55"
        />
      </div>

      {/* INTRO */}
      <section className="relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C25A43]">
          Welcome back
        </p>

        <h1 className="font-sora mt-2.5 max-w-[370px] text-[32px] font-bold leading-[1.12] tracking-[-0.04em] text-[#302536]">
          Sign in to continue
          <br />
          building with clarity.
        </h1>

        <p className="mt-3 max-w-[340px] text-[13px] leading-6 text-[#777177]">
          Access your Buildora workspace and continue
          managing your construction projects.
        </p>
      </section>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 mt-6"
      >
        <label
          htmlFor="signin-email"
          className="mb-2 block text-[12px] font-semibold text-[#302536]"
        >
          Email address
        </label>

        <div className="relative">
          <Mail
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B9397]"
          />

          <input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            disabled={busy}
            className={inputClass}
          />
        </div>

        <label
          htmlFor="signin-password"
          className="mb-2 mt-4 block text-[12px] font-semibold text-[#302536]"
        >
          Password
        </label>

        <div className="relative">
          <LockKeyhole
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B9397]"
          />

          <input
            id="signin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            disabled={busy}
            className={inputClass}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setShowPassword((current) => !current)
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#777177]"
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
          >
            {showPassword ? (
              <EyeOff size={17} />
            ) : (
              <Eye size={17} />
            )}
          </button>
        </div>

<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
    marginTop: "16px",
  }}
>
  <label
    className="flex cursor-pointer items-center gap-2 text-[12px] text-[#777177]"
    style={{ margin: 0 }}
  >
    <input
      type="checkbox"
      checked={rememberMe}
      disabled={busy}
      onChange={(event) =>
        setRememberMe(event.target.checked)
      }
      className="h-4 w-4 accent-[#C25A43]"
    />

    <span>Remember me</span>
  </label>

  <button
    type="button"
    disabled={busy}
    onClick={openForgotPassword}
    className="signin-forgot text-[12px] font-semibold text-[#C25A43] hover:underline disabled:opacity-50"
    style={{
      marginLeft: "auto",
      marginTop: 0,
      whiteSpace: "nowrap",
    }}
  >
    Forgot password?
  </button>
</div>
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#789C86]/30 bg-[#789C86]/10 px-4 py-3 text-[12px] leading-6 text-[#43634D]"
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#C25A43] px-5 text-[13px] font-bold text-white transition hover:bg-[#AD4C38] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign In"}

          {!loading && (
            <ArrowRight size={16} aria-hidden="true" />
          )}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#E9DED5]" />
          <span className="text-[11px] text-[#91898D]">
            or
          </span>
          <div className="h-px flex-1 bg-[#E9DED5]" />
        </div>

        <div
          className={
            busy
              ? "pointer-events-none flex justify-center opacity-60"
              : "flex justify-center"
          }
          aria-busy={googleLoading}
        >
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text="continue_with"
            shape="rectangular"
            theme="outline"
            size="large"
            width="320"
            logo_alignment="left"
          />
        </div>

        {googleLoading && (
          <p
            role="status"
            className="mt-2 text-center text-[12px] text-[#777177]"
          >
            Signing in with Google…
          </p>
        )}
      </form>

      {/* REGISTER */}
      <div className="relative z-10 mt-6 flex items-center justify-between gap-4 rounded-xl border border-[#E9DED5] bg-[#FAF6F0] p-4">
        <div className="flex items-center gap-3">
          <UserPlus
            size={20}
            className="shrink-0 text-[#C25A43]"
            aria-hidden="true"
          />

          <div>
            <p className="text-[13px] font-semibold text-[#302536]">
              New to Buildora?
            </p>

            <p className="mt-1 text-[12px] text-[#777177]">
              Create your account.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openRegister}
          disabled={busy}
          className="text-[12px] font-bold text-[#C25A43] disabled:opacity-50"
        >
          Create account
        </button>
      </div>

      <p className="relative z-10 mt-auto pt-6 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#91898D]">
        Buildora
      </p>
    </div>
  );
}

export default SignInForm;