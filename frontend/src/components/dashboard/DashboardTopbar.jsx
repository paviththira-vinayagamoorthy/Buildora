import {
  Bell,
  ChevronDown,
  Search,
} from "lucide-react";

function getSavedUser() {
  const savedUser =
    localStorage.getItem("buildora_user") ||
    sessionStorage.getItem("buildora_user");

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
}

function DashboardTopbar() {
  const user = getSavedUser();

  const name =
    user?.full_name ||
    user?.name ||
    "Buildora User";

  const email = user?.email || "";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-[#E9DED5] bg-[#FFFCF8]/90 px-5 backdrop-blur-xl lg:px-8">
      {/* LEFT */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#A49B9F]">
          Buildora Workspace
        </p>

        <p className="font-sora mt-0.5 text-[13px] font-bold text-[#302536]">
          Project Dashboard
        </p>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2.5">
        {/* SEARCH */}
        <button
          type="button"
          className="hidden h-9 w-9 items-center justify-center rounded-xl border border-[#E9DED5] bg-white text-[#777177] transition hover:border-[#D87963]/30 hover:text-[#C25A43] sm:flex"
          aria-label="Search"
        >
          <Search size={15} />
        </button>

        {/* NOTIFICATIONS */}
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#E9DED5] bg-white text-[#777177] transition hover:border-[#D87963]/30 hover:text-[#C25A43]"
          aria-label="Notifications"
        >
          <Bell size={15} />

          <span className="absolute right-[8px] top-[7px] h-1.5 w-1.5 rounded-full bg-[#C25A43]" />
        </button>

        {/* PROFILE */}
        <button
          type="button"
          className="ml-1 flex items-center gap-2.5 rounded-[13px] border border-[#E9DED5] bg-white py-1.5 pl-1.5 pr-2.5 transition hover:border-[#D8CBC2]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#302536] text-[9px] font-bold text-[#F2C4AE]">
            {initials || "BU"}
          </div>

          <div className="hidden max-w-[150px] text-left sm:block">
            <p className="truncate text-[9px] font-bold text-[#302536]">
              {name}
            </p>

            <p className="mt-0.5 truncate text-[7px] text-[#91898E]">
              {email || "Buildora account"}
            </p>
          </div>

          <ChevronDown
            size={13}
            className="hidden text-[#9C9298] sm:block"
          />
        </button>
      </div>
    </header>
  );
}

export default DashboardTopbar;