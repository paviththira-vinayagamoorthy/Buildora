import {
  Bell,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  RefreshCcw,
  WalletCards,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import logo from "../../assets/buildora-logo.png";

const menuItems = [
  {
    name: "Overview",
    icon: LayoutDashboard,
  },
  {
    name: "Projects",
    icon: FolderKanban,
  },
  {
    name: "Documents",
    icon: FileText,
  },
  {
    name: "Expenses",
    icon: ReceiptText,
  },
  {
    name: "Payments",
    icon: WalletCards,
  },
  {
    name: "Variations",
    icon: RefreshCcw,
  },
  {
    name: "Notifications",
    icon: Bell,
  },
];

function DashboardSidebar({
  activePage,
  setActivePage,
}) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("buildora_access_token");
    localStorage.removeItem("buildora_user");

    sessionStorage.removeItem("buildora_access_token");
    sessionStorage.removeItem("buildora_user");

    navigate("/");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col bg-[#302536] lg:flex">
      {/* LOGO */}
      <div className="flex h-[78px] items-center border-b border-white/[0.07] px-6">
        <img
          src={logo}
          alt="Buildora"
          className="h-10 w-auto object-contain"
        />
      </div>

      {/* WORKSPACE */}
      <div className="px-4 pt-5">
        <div className="rounded-[15px] border border-white/[0.08] bg-white/[0.05] px-4 py-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/35">
            Workspace
          </p>

          <p className="mt-1 truncate text-[11px] font-semibold text-white/85">
            Buildora
          </p>

          <p className="mt-0.5 text-[8px] text-white/35">
            No project selected
          </p>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="mt-5 flex-1 space-y-1 px-3">
        <p className="mb-2 px-3 text-[8px] font-bold uppercase tracking-[0.17em] text-white/25">
          Navigation
        </p>

        {menuItems.map((item) => {
          const Icon = item.icon;

          const active =
            activePage === item.name;

          return (
            <button
              key={item.name}
              type="button"
              onClick={() =>
                setActivePage(item.name)
              }
              className={`flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-left transition ${
                active
                  ? "bg-[#C25A43] text-white shadow-[0_8px_20px_rgba(194,90,67,0.18)]"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon size={16} />

              <span className="text-[10px] font-semibold">
                {item.name}
              </span>
            </button>
          );
        })}
      </nav>

      {/* BOTTOM */}
      <div className="border-t border-white/[0.07] p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut size={16} />

          <span className="text-[10px] font-semibold">
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  );
}

export default DashboardSidebar;