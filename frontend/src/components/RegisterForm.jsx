import { useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  User,
} from "lucide-react";

import authBuilding from "../assets/buildora-auth-building.png";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function RegisterForm({ openSignIn }) {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const fullName = formData.full_name.trim();
    const email = formData.email.trim();
    const phone = formData.phone.trim();
    const password = formData.password;
    const confirmPassword = formData.confirm_password;

    if (
      !fullName ||
      !email ||
      !phone ||
      !password ||
      !confirmPassword
    ) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the Terms and Privacy Policy.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            full_name: fullName,
            email,
            phone,
            password,
          }),
        }
      );

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        let message =
          "Unable to create your account. Please try again.";

        if (typeof data?.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((item) => item.msg)
            .join(", ");
        }

        throw new Error(message);
      }

      setSuccess(
  "Account created successfully. Sign in using this email to continue."
);

      setFormData({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        confirm_password: "",
      });

      setAcceptedTerms(false);
      setShowPassword(false);
      setShowConfirmPassword(false);

      setTimeout(() => {
        openSignIn();
      }, 1000);
    } catch (err) {
      console.error("Registration error:", err);

      setError(
        err.message ||
          "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-[47px] w-full rounded-[13px] border border-[#DED3CB] bg-white/90 pl-11 pr-4 text-[10px] font-normal text-[#302536] outline-none transition duration-200 placeholder:text-[10px] placeholder:font-normal placeholder:text-[#B0A8AC] hover:border-[#CDBDB4] focus:border-[#D87963] focus:bg-white focus:ring-4 focus:ring-[#D87963]/10";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-8 pb-5 pt-5 sm:px-9">
      {/* BUILDING */}
      <div className="pointer-events-none absolute -right-8 -top-5 z-0 h-[210px] w-[255px] overflow-hidden">
        <img
          src={authBuilding}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain object-right-top opacity-50"
        />
      </div>

      {/* INTRO */}
      <section className="relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C25A43]">
          Get started
        </p>

        <h1 className="font-sora mt-2 text-[30px] font-bold leading-[1.08] tracking-[-0.04em] text-[#302536]">
          Create your
          <br />
          Buildora account.
        </h1>

        <p className="mt-2 max-w-[310px] text-[10px] leading-[16px] text-[#777177]">
          Start managing your construction projects with one
          clear workspace.
        </p>
      </section>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 mt-4"
      >
        {/* FULL NAME */}
        <div>
          <label
            htmlFor="register-full-name"
            className="mb-1.5 block text-[9px] font-semibold text-[#302536]"
          >
            Full name
          </label>

          <div className="group relative">
            <User
              size={15}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors group-focus-within:text-[#C25A43]"
            />

            <input
              id="register-full-name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              value={formData.full_name}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
        </div>

        {/* EMAIL */}
        <div className="mt-2.5">
          <label
            htmlFor="register-email"
            className="mb-1.5 block text-[9px] font-semibold text-[#302536]"
          >
            Email address
          </label>

          <div className="group relative">
            <Mail
              size={15}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors group-focus-within:text-[#C25A43]"
            />

            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
        </div>

        {/* PHONE */}
        <div className="mt-2.5">
          <label
            htmlFor="register-phone"
            className="mb-1.5 block text-[9px] font-semibold text-[#302536]"
          >
            Phone number
          </label>

          <div className="group relative">
            <Phone
              size={15}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors group-focus-within:text-[#C25A43]"
            />

            <input
              id="register-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+94 77 123 4567"
              value={formData.phone}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>
        </div>

        {/* PASSWORDS */}
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-[9px] font-semibold text-[#302536]"
            >
              Password
            </label>

            <div className="group relative">
              <LockKeyhole
                size={14}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors group-focus-within:text-[#C25A43]"
              />

              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                className="h-[47px] w-full rounded-[13px] border border-[#DED3CB] bg-white/90 pl-10 pr-9 text-[10px] font-normal text-[#302536] outline-none transition duration-200 placeholder:text-[10px] placeholder:font-normal placeholder:text-[#B0A8AC] hover:border-[#CDBDB4] focus:border-[#D87963] focus:bg-white focus:ring-4 focus:ring-[#D87963]/10"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors hover:text-[#302536]"
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword ? (
                  <EyeOff size={14} />
                ) : (
                  <Eye size={14} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="register-confirm-password"
              className="mb-1.5 block text-[9px] font-semibold text-[#302536]"
            >
              Confirm password
            </label>

            <div className="group relative">
              <LockKeyhole
                size={14}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors group-focus-within:text-[#C25A43]"
              />

              <input
                id="register-confirm-password"
                name="confirm_password"
                type={
                  showConfirmPassword ? "text" : "password"
                }
                autoComplete="new-password"
                placeholder="Repeat password"
                value={formData.confirm_password}
                onChange={handleChange}
                required
                minLength={8}
                className="h-[47px] w-full rounded-[13px] border border-[#DED3CB] bg-white/90 pl-10 pr-9 text-[10px] font-normal text-[#302536] outline-none transition duration-200 placeholder:text-[10px] placeholder:font-normal placeholder:text-[#B0A8AC] hover:border-[#CDBDB4] focus:border-[#D87963] focus:bg-white focus:ring-4 focus:ring-[#D87963]/10"
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword(
                    (current) => !current
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9397] transition-colors hover:text-[#302536]"
                aria-label={
                  showConfirmPassword
                    ? "Hide confirm password"
                    : "Show confirm password"
                }
              >
                {showConfirmPassword ? (
                  <EyeOff size={14} />
                ) : (
                  <Eye size={14} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* TERMS */}
<div className="mt-4 flex items-start gap-2.5">
  <input
    id="register-terms"
    type="checkbox"
    checked={acceptedTerms}
    onChange={(event) =>
      setAcceptedTerms(event.target.checked)
    }
    required
    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#C25A43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C25A43]"
  />

  <div className="text-[12px] leading-5 text-[#777177]">
    <label
      htmlFor="register-terms"
      className="cursor-pointer"
    >
      I agree to the{" "}
    </label>

    <a
      href="/terms"
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#C25A43] underline underline-offset-2 hover:text-[#A94835]"
    >
      Terms
    </a>

    {" and "}

    <a
      href="/privacy"
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#C25A43] underline underline-offset-2 hover:text-[#A94835]"
    >
      Privacy Policy
    </a>

    .
  </div>
</div>

{error && (
  <div
    role="alert"
    className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-5 text-red-700"
  >
    {error}
  </div>
)}

{success && (
  <div
    role="status"
    className="mt-3 rounded-xl border border-[#789C86]/30 bg-[#789C86]/10 px-4 py-3 text-[12px] leading-5 text-[#43634D]"
  >
    {success}
  </div>
)}

        {/* CREATE ACCOUNT */}
        <button
          type="submit"
          disabled={loading}
          className="group mt-3.5 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[13px] bg-[#C25A43] text-[11px] font-bold text-white shadow-[0_12px_28px_rgba(194,90,67,0.20)] transition duration-300 hover:-translate-y-[1px] hover:bg-[#AD4C38] hover:shadow-[0_16px_34px_rgba(194,90,67,0.27)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create Account"}

          {!loading && (
            <ArrowRight
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          )}
        </button>
      </form>

      {/* SIGN IN */}
      <div className="relative z-10 mt-3.5 flex items-center justify-center gap-1.5 border-t border-[#E9DED5] pt-3.5">
        <span className="text-[9px] text-[#777177]">
          Already have a Buildora account?
        </span>

        <button
          type="button"
          onClick={openSignIn}
          className="group flex items-center gap-1 text-[9px] font-bold text-[#C25A43] transition-colors hover:text-[#9F4432]"
        >
          Sign In

          <ArrowRight
            size={11}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </div>
    </div>
  );
}

export default RegisterForm;