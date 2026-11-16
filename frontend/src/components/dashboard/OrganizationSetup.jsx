import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Building2,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const STATUS_LABELS = {
  unsubmitted: "Verification required",
  pending: "Under review",
  approved: "Approved",
  rejected: "Changes required",
};

function getAccessToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) => item?.msg)
              .filter(Boolean)
              .join(", ")
          : "Unable to complete the request."
    );
  }

  return data;
}

function rememberOrganization(organization) {
  const storage = localStorage.getItem(
    "buildora_access_token"
  )
    ? localStorage
    : sessionStorage;

  localStorage.removeItem("buildora_active_organization");
  sessionStorage.removeItem("buildora_active_organization");

  localStorage.removeItem("buildora_active_project");
  sessionStorage.removeItem("buildora_active_project");

  storage.setItem(
    "buildora_active_organization",
    JSON.stringify(organization)
  );
}

function OrganizationSetup({ onOrganizationSelected }) {
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [organizationName, setOrganizationName] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const actionRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrganizations() {
      setLoading(true);
      setError("");

      try {
        const data = await apiRequest(
          "/organizations/",
          {
            signal: controller.signal,
          }
        );

        if (controller.signal.aborted) return;

        if (!Array.isArray(data)) {
          throw new Error(
            "The company list could not be loaded."
          );
        }

        setOrganizations(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err.message ||
              "Unable to load your companies."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadOrganizations();

    return () => controller.abort();
  }, []);

  async function handleCreateOrganization(event) {
    event.preventDefault();

    if (actionRef.current) return;

    const name = organizationName
      .trim()
      .replace(/\s+/g, " ");

    if (name.length < 2 || name.length > 150) {
      setError(
        "Enter a company name containing 2 to 150 characters."
      );
      return;
    }

    actionRef.current = true;

    setBusy("create");
    setError("");
    setSuccess("");

    try {
      const organization = await apiRequest(
        "/organizations/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        }
      );

      if (
        !organization ||
        !Number.isInteger(organization.id) ||
        organization.id <= 0
      ) {
        throw new Error(
          "The creation response could not be confirmed. Refresh the company list before trying again."
        );
      }

      setOrganizations((current) => [
        organization,
        ...current.filter(
          (item) => item.id !== organization.id
        ),
      ]);

      setOrganizationName("");
      rememberOrganization(organization);

      // Creating an organization does not approve it.
      navigate(
        `/organizations/${organization.id}/verification`
      );
    } catch (err) {
      setError(
        err.message ||
          "Unable to create your company. Check the company list before retrying."
      );
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  }

  async function handleOpenOrganization(organization) {
    if (actionRef.current) return;

    actionRef.current = true;

    setBusy(`open-${organization.id}`);
    setError("");
    setSuccess("");

    try {
      // Read current company status instead of trusting
      // an old value stored in the browser.
      const [currentOrganization, membership] =
        await Promise.all([
          apiRequest(
            `/organizations/${organization.id}`
          ),
          apiRequest(
            `/organizations/${organization.id}/my-membership`
          ),
        ]);

      rememberOrganization(currentOrganization);

      setOrganizations((current) =>
        current.map((item) =>
          item.id === currentOrganization.id
            ? currentOrganization
            : item
        )
      );

      if (
        membership.member_role === "organization_admin" &&
        currentOrganization.verification_status !== "approved"
      ) {
        navigate(
          `/organizations/${currentOrganization.id}/verification`
        );

        return;
      }

      // Existing QS/Owner access is handled by the
      // existing dashboard and backend permissions.
      if (onOrganizationSelected) {
        onOrganizationSelected(currentOrganization);
      } else {
        setSuccess(
          `${currentOrganization.name} selected.`
        );
      }
    } catch (err) {
      setError(
        err.message ||
          "Unable to open your company workspace."
      );
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center gap-3 text-[#352A3D]"
        role="status"
      >
        <Loader2
          size={20}
          className="animate-spin"
          aria-hidden="true"
        />
        <span>Loading your companies…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] pb-10">
      <header className="mb-7">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#AC523E]">
          Company workspace
        </p>

        <h1 className="mt-2 text-[30px] font-bold leading-tight text-[#352A3D] sm:text-[36px]">
          Set up your construction company
        </h1>

        <p className="mt-3 max-w-[680px] text-[14px] leading-7 text-[#6D646C]">
          Create your company profile, complete verification
          and submit it for Platform Admin review. After
          approval, create projects and invite your QS and
          Building Owners.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-[#E4B5AB] bg-[#FFF0EB] px-4 py-3 text-[14px] leading-6 text-[#8C3327]"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-[#BDCDBF] bg-[#EDF3ED] px-4 py-3 text-[14px] leading-6 text-[#3D6046]"
        >
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CREATE COMPANY */}
        <section className="rounded-2xl border border-[#E3D6CA] bg-[#FFFCF8] p-6 sm:p-8">
          <Building2
            size={26}
            className="text-[#AC523E]"
            aria-hidden="true"
          />

          <h2 className="mt-4 text-[22px] font-bold text-[#352A3D]">
            Register your company
          </h2>

          <p className="mt-2 text-[14px] leading-7 text-[#6D646C]">
            Start with the registered company name.
            The next page will collect the remaining
            details and registration document.
          </p>

          <form
            onSubmit={handleCreateOrganization}
            className="mt-6"
          >
            <label
              htmlFor="organization-name"
              className="mb-2 block text-[14px] font-semibold text-[#352A3D]"
            >
              Registered company name
            </label>

            <input
              id="organization-name"
              type="text"
              autoComplete="organization"
              value={organizationName}
              onChange={(event) => {
                setOrganizationName(event.target.value);
                setError("");
              }}
              placeholder="e.g. ABC Construction"
              minLength={2}
              maxLength={150}
              required
              disabled={Boolean(busy)}
              className="h-[48px] w-full rounded-lg border border-[#D9C8BA] bg-white px-4 text-[14px] text-[#352A3D] outline-none focus:border-[#AC523E] focus:ring-2 focus:ring-[#AC523E]/15 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={Boolean(busy)}
              className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#352A3D] px-5 py-3 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "create" ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Creating…
                </>
              ) : (
                <>
                  <Plus size={17} aria-hidden="true" />
                  Continue to company details
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-3 border-t border-[#E8DED4] pt-5">
            <ShieldCheck
              size={19}
              className="mt-1 shrink-0 text-[#AC523E]"
              aria-hidden="true"
            />

            <p className="text-[13px] leading-6 text-[#6D646C]">
              Creating a company profile does not approve
              it. Company details, email verification and
              the registration document must be reviewed
              before new projects can be created.
            </p>
          </div>
        </section>

        {/* EXISTING COMPANIES */}
        <section className="rounded-2xl border border-[#E3D6CA] bg-[#FFFCF8] p-6 sm:p-8">
          <h2 className="text-[22px] font-bold text-[#352A3D]">
            Your companies
          </h2>

          <p className="mt-2 text-[14px] leading-7 text-[#6D646C]">
            Continue an existing application or open
            your company workspace.
          </p>

          {organizations.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#D9C8BA] px-5 py-10 text-center">
              <Building2
                size={28}
                className="mx-auto text-[#AC523E]"
                aria-hidden="true"
              />

              <h3 className="mt-4 text-[16px] font-semibold text-[#352A3D]">
                No companies linked yet
              </h3>

              <p className="mt-2 text-[14px] leading-6 text-[#6D646C]">
                Register your company, or accept an
                invitation sent to your email.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    handleOpenOrganization(organization)
                  }
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-[#E3D6CA] bg-white p-4 text-left transition hover:border-[#AC523E] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="break-words text-[15px] font-semibold text-[#352A3D]">
                      {organization.name}
                    </p>

                    <p className="mt-1 text-[13px] text-[#6D646C]">
                      {STATUS_LABELS[
                        organization.verification_status
                      ] || "Status unavailable"}
                    </p>
                  </div>

                  {busy === `open-${organization.id}` ? (
                    <Loader2
                      size={18}
                      className="shrink-0 animate-spin text-[#AC523E]"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight
                      size={18}
                      className="shrink-0 text-[#AC523E]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default OrganizationSetup;