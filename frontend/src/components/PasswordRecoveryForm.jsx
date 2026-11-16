import { useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export default function PasswordRecoveryForm({
  mode,
  token = "",
  onBackToSignIn,
  onResetComplete,
  onRequestNewLink,
}) {
  const isReset = mode === "reset";

  const validToken =
    /^[A-Za-z0-9_-]{40,200}$/.test(token);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (actionRef.current) return;

    setError("");
    setSuccess("");

    if (isReset) {
      if (!validToken) {
        setError("This reset link is invalid. Request a new link.");
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

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    } else if (!email.trim()) {
      setError("Enter your account email address.");
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
                  confirm_password: confirmPassword,
                }
              : {
                  email: email.trim(),
                }
          ),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let message = isReset
          ? "Unable to reset your password."
          : "Unable to request a reset email.";

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
          "The server response could not be confirmed. Please check before retrying."
        );
      }

      if (isReset) {
        // The previous browser session is no longer current.
        // Preserve an invitation return destination, if present.
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

        setPassword("");
        setConfirmPassword("");

        onResetComplete?.(data.message);
      } else {
        setSuccess(data.message);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete the request."
      );
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  const inputClass =
    "min-h-[50px] w-full rounded-xl border border-[#DED3CB] bg-white pl-11 pr-12 text-[14px] text-[#302536] outline-none focus:border-[#C25A43] focus:ring-4 focus:ring-[#C25A43]/10 disabled:opacity-60";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto px-8 pb-6 pt-5 sm:px-9">
      <button
        type="button"
        onClick={onBackToSignIn}
        disabled={busy}
        className="mb-5 flex shrink-0 w-fit items-center gap-2 text-[13px] font-semibold text-[#805140] disabled:opacity-50"
      >
        <ArrowLeft size={16} />
        Back to sign in
      </button>

      <h1 className="m-0 text-[28px] font-bold leading-tight text-[#302536]">
        {isReset
          ? "Set a new password"
          : "Forgot your password?"}
      </h1>

      <p className="mt-3 text-[14px] leading-7 text-[#777177]">
        {isReset
          ? "Choose a new password for your Buildora account. After saving, sign in again."
          : "Enter your Buildora account email. We will send a password reset link if an active account exists."}
      </p>

      {isReset && !validToken ? (
        <div className="mt-6">
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] leading-6 text-red-700"
          >
            This reset link is incomplete or invalid.
            Request a new link to continue.
          </p>

          <button
            type="button"
            onClick={onRequestNewLink}
            className="mt-5 min-h-[46px] rounded-lg bg-[#C25A43] px-5 text-[14px] font-semibold text-white"
          >
            Request a new link
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-7"
        >
          <fieldset disabled={busy}>
            {!isReset ? (
              <label className="block text-[13px] font-semibold text-[#302536]">
                Email address

                <div className="relative mt-2">
                  <Mail
                    size={17}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91898D]"
                  />

                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={255}
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                </div>
              </label>
            ) : (
              <>
                <label className="block text-[13px] font-semibold text-[#302536]">
                  New password

                  <div className="relative mt-2">
                    <LockKeyhole
                      size={17}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91898D]"
                    />

                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      className={inputClass}
                      placeholder="At least 8 characters"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      aria-label={
                        showPassword
                          ? "Hide passwords"
                          : "Show passwords"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#777177]"
                    >
                      {showPassword ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>
                </label>

                <label className="mt-5 block text-[13px] font-semibold text-[#302536]">
                  Confirm new password

                  <div className="relative mt-2">
                    <LockKeyhole
                      size={17}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91898D]"
                    />

                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      className={inputClass}
                      placeholder="Repeat the new password"
                    />
                  </div>
                </label>
              </>
            )}

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] leading-6 text-red-700"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-[#BDCDBF] bg-[#EDF3ED] p-4 text-[13px] leading-6 text-[#3D6046]"
              >
                {success}
              </div>
            )}

            <button
              type="submit"
              className="mt-6 flex min-h-[50px] w-full items-center justify-center rounded-xl bg-[#C25A43] px-5 text-[14px] font-bold text-white hover:bg-[#AD4C38] disabled:opacity-60"
            >
              {busy
                ? isReset
                  ? "Updating password…"
                  : "Requesting link…"
                : isReset
                  ? "Save new password"
                  : "Send reset link"}
            </button>

            {!isReset && success && (
              <p className="mt-4 text-[12px] leading-6 text-[#777177]">
                Check your inbox and spam folder.
                Wait at least one minute before requesting another link.
              </p>
            )}

            {isReset && error && (
              <button
                type="button"
                onClick={onRequestNewLink}
                className="mt-4 text-[13px] font-semibold text-[#805140] underline"
              >
                Request a new reset link
              </button>
            )}
          </fieldset>
        </form>
      )}
    </div>
  );
}