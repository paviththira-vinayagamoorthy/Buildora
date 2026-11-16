import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  Bell,
  ChevronDown,
  LogOut,
  Mail,
  UserRound,
} from "lucide-react";

import {
  clearBuildoraAuth,
} from "../../services/workspaceApi";

import logo from "../../assets/buildora-logo.png";

function getSavedUser() {
  const rawUser =
    localStorage.getItem("buildora_user") ||
    sessionStorage.getItem("buildora_user");

  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

function getInitials(name = "") {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "U";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function WorkspaceHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState(getSavedUser);

  const accountRef = useRef(null);
  const triggerRef = useRef(null);

  const accountPanelId = useId();

  const fullName = String(
    user?.full_name ||
      user?.name ||
      user?.username ||
      "Buildora User"
  ).trim();

  const initials = getInitials(fullName);

  useEffect(() => {
    function refreshUser() {
      setUser(getSavedUser());
    }

    window.addEventListener(
      "buildora-profile-updated",
      refreshUser
    );

    window.addEventListener("storage", refreshUser);

    return () => {
      window.removeEventListener(
        "buildora-profile-updated",
        refreshUser
      );

      window.removeEventListener("storage", refreshUser);
    };
  }, []);

  useEffect(() => {
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accountOpen) return;

    function handleOutsideClick(event) {
      if (!accountRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAccountOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener(
      "pointerdown",
      handleOutsideClick
    );

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsideClick
      );

      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountOpen]);

  function handleProfile() {
  setAccountOpen(false);
  window.dispatchEvent(new Event("buildora-open-profile"));
}

  function handleSignOut() {
    clearBuildoraAuth();

    sessionStorage.removeItem("buildora_active_organization");
    sessionStorage.removeItem("buildora_active_project");

    setAccountOpen(false);
    navigate("/", { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 flex h-[82px] w-full shrink-0 items-center justify-between gap-3 border-b border-[#E9DED5] bg-[#FFFCF8] px-4 sm:px-8 lg:px-12">
      {/* ORIGINAL LOGO */}
      <div className="flex min-w-0 items-center">
        <img
          src={logo}
          alt="Buildora"
          className="h-[46px] w-auto max-w-[140px] object-contain sm:h-[52px] sm:max-w-[180px]"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#E9DED5] bg-white text-[#302536] transition-colors hover:bg-[#F8F2ED] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A75B42]"
        >
          <Bell size={18} aria-hidden="true" />

          <span
            aria-hidden="true"
            className="absolute right-[9px] top-[8px] h-[6px] w-[6px] rounded-full bg-[#D87963]"
          />
        </button>

        <div
          ref={accountRef}
          className="relative"
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setAccountOpen(false);
            }
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            title={fullName}
            aria-label={`Account options for ${fullName}`}
            aria-expanded={accountOpen}
            aria-controls={accountPanelId}
            onClick={() => {
              setAccountOpen((previous) => !previous);
            }}
            className="flex items-center gap-2 rounded-full border border-[#E9DED5] bg-white py-2 pl-2 pr-3 transition-colors hover:bg-[#F8F2ED] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A75B42] sm:gap-3 sm:pr-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#302536] text-[11px] font-bold text-white">
              {user?.photo_data ? (
  <img
    src={user.photo_data}
    alt=""
    className="h-full w-full rounded-full object-cover"
  />
) : (
  initials
)}
            </span>

            <span className="hidden text-left sm:block">
              <span className="block max-w-[220px] truncate text-[11px] font-bold uppercase text-[#302536]">
                {fullName}
              </span>

              <span className="mt-[2px] block text-[8px] font-semibold uppercase tracking-[0.16em] text-[#6F6373]">
                My Account
              </span>
            </span>

            <ChevronDown
              size={15}
              aria-hidden="true"
              className={`text-[#777177] transition-transform duration-150 motion-reduce:transition-none ${
                accountOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {accountOpen && (
            <div
              id={accountPanelId}
              role="region"
              aria-label="My account"
              className="absolute right-0 top-full z-50 mt-3 w-[290px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-[#E9DED5] bg-[#FFFCF8] shadow-[0_16px_48px_rgba(48,37,54,0.14)]"
            >
              <div className="border-b border-[#E9DED5] p-5">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-[#A75B42]">
                  Signed in as
                </p>

                <p className="mb-0 mt-2 break-words text-sm font-bold text-[#302536]">
                  {fullName}
                </p>

                {user?.email && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-[#6F6373]">
                    <Mail
                      size={14}
                      aria-hidden="true"
                      className="mt-[2px] shrink-0"
                    />

                    <span className="break-all">{user.email}</span>
                  </div>
                )}
              </div>

              <div className="p-2">
                <button
                  type="button"
                  onClick={handleProfile}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[#58415E] transition-colors hover:bg-[#F1E9F3] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#A75B42]"
                >
                  <UserRound size={17} aria-hidden="true" />
                  My profile
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[#B44335] transition-colors hover:bg-[#FFF0EA] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#A75B42]"
                >
                  <LogOut size={17} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}