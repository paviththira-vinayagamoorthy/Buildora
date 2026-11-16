import { useLocation, useNavigate } from "react-router-dom";

import {
  Building2,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  UserRound
} from "lucide-react";

import sidebarBuilding from "../../assets/sidebar-building.png";

const items = [
  {
    name: "Dashboard",
    hash: "",
    Icon: LayoutDashboard,
  },
  {
    name: "Projects",
    hash: "#projects",
    Icon: FolderKanban,
  },
  {
    name: "Companies",
    hash: "#companies",
    Icon: Building2,
  },
];

export default function WorkspaceSidebar({
  hasProjectAccess = true,
  user,
  canManageBilling = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  function openSection(hash) {
    if (
      location.pathname === "/dashboard" &&
      location.hash === hash
    ) {
      if (hash) {
        document.getElementById(hash.slice(1))?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        document.getElementById("dashboard-top")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      return;
    }

    navigate({
      pathname: "/dashboard",
      hash,
    });
  }

  return (
    <aside
      className="buildora-sidebar flex h-full shrink-0 flex-col"
      style={{
        width: 280,
        flexBasis: 280,
        backgroundColor: "#352A3D",
        backgroundImage: `linear-gradient(to bottom, #352A3D 0%, transparent 65%, #352A3D 100%), url("${sidebarBuilding}")`,
        backgroundPosition: "center bottom",
        backgroundSize: "100% 200px",
        backgroundRepeat: "no-repeat",
        color: "#FFF8F1",
      }}
    >
      <nav
        aria-label="Workspace navigation"
        className="min-h-0 flex-1 px-5 py-7"
      >
        {hasProjectAccess && (
  <p className="mb-4 px-3 text-xs leading-relaxed text-white/70">
    Open a project to manage its BOQ, payments, documents and progress reports.
  </p>
)}
<div className="space-y-2">
  {items.map(({ name, hash, Icon }) => {
    const active =
      location.pathname === "/dashboard" &&
      location.hash === hash;

    return (
      <button
        key={name}
        type="button"
        onClick={() => openSection(hash)}
        aria-current={active ? "location" : undefined}
        className={`relative flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EDA38E] ${
          active
            ? "bg-[#534359] text-white"
            : "text-white/80 hover:bg-[#493B50] hover:text-white"
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute left-0 h-6 w-[3px] rounded-r-full bg-[#EDA38E]"
          />
        )}

        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        <span>{name}</span>
      </button>
    );
  })}
</div>

{canManageBilling && (
  <div className="mt-7 border-t border-white/15 pt-5">
    <p className="mb-3 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
      Subscriptions
    </p>

    <button
      type="button"
      onClick={() => navigate("/billing")}
      aria-current={
        location.pathname === "/billing" ? "page" : undefined
      }
      className={`relative flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 text-left text-[15px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EDA38E] ${
        location.pathname === "/billing"
          ? "bg-[#534359] text-white"
          : "text-white/80 hover:bg-[#493B50] hover:text-white"
      }`}
    >
      {location.pathname === "/billing" && (
        <span
          aria-hidden="true"
          className="absolute left-0 h-6 w-[3px] rounded-r-full bg-[#EDA38E]"
        />
      )}

      <CreditCard size={19} strokeWidth={1.8} aria-hidden="true" />
      <span>Upgrade plan</span>
    </button>
  </div>
)}
      </nav>

      <footer className="shrink-0 border-t border-white/15 px-8 py-6">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-white/75">
          BUILDORA
        </p>

        <p className="mt-2 text-[12px] text-white/60">
          Build with clarity.
        </p>
      </footer>
    </aside>
  );
}