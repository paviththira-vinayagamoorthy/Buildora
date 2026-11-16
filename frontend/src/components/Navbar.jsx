import { Menu, X } from "lucide-react";
import logo from "../assets/buildora-logo.png";

function Navbar({
  mobileMenu,
  setMobileMenu,
  openSignIn,
  openRegister,
}) {
  const closeMobileMenu = () => {
    setMobileMenu(false);
  };

  const handleSignIn = () => {
    closeMobileMenu();
    openSignIn();
  };

  const handleRegister = () => {
    closeMobileMenu();
    openRegister();
  };

  return (
    <header className="relative z-30 w-full">
      {/* =====================================================
          DESKTOP / MAIN NAVBAR
      ===================================================== */}

      <nav className="flex w-full items-center justify-between border-b border-white/20 bg-[#FAF6F0]/80 px-6 py-2 shadow-[0_8px_30px_rgba(48,37,54,0.10)] backdrop-blur-xl sm:px-8 lg:px-12 xl:px-16">
        {/* LOGO */}
        <a
          href="#"
          onClick={closeMobileMenu}
          className="flex shrink-0 items-center"
          aria-label="Buildora Home"
        >
          <img
            src={logo}
            alt="Buildora"
            className="h-[44px] w-auto object-contain sm:h-[48px]"
          />
        </a>

        {/* DESKTOP NAVIGATION LINKS */}
        <div className="hidden items-center gap-6 xl:gap-8 lg:flex">
          <a
            href="#features"
            className="whitespace-nowrap text-[13px] font-semibold text-[#302536] transition hover:text-[#C25A43] xl:text-sm"
          >
            Features
          </a>

          <a
            href="#clarity"
            className="whitespace-nowrap text-[13px] font-semibold text-[#302536] transition hover:text-[#C25A43] xl:text-sm"
          >
            Why Buildora
          </a>

          <a
            href="#how-it-works"
            className="whitespace-nowrap text-[13px] font-semibold text-[#302536] transition hover:text-[#C25A43] xl:text-sm"
          >
            How It Works
          </a>

          <a
            href="#owners"
            className="whitespace-nowrap text-[13px] font-semibold text-[#302536] transition hover:text-[#C25A43] xl:text-sm"
          >
            For Building Owners
          </a>
        </div>

        {/* DESKTOP AUTH BUTTONS */}
        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={openSignIn}
            className="whitespace-nowrap rounded-xl border border-[#C25A43]/70 bg-white/20 px-5 py-2.5 text-[13px] font-semibold text-[#302536] transition hover:border-[#C25A43] hover:bg-[#FAF6F0]/70 xl:px-7 xl:text-sm"
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={openRegister}
            className="whitespace-nowrap rounded-xl bg-[#C25A43] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_25px_rgba(194,90,67,0.25)] transition hover:-translate-y-0.5 hover:bg-[#A94835] xl:px-7 xl:text-sm"
          >
            Get Started
          </button>
        </div>

        {/* MOBILE MENU BUTTON */}
        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="rounded-xl border border-[#302536]/10 bg-white/40 p-2.5 text-[#302536] transition hover:bg-white/70 lg:hidden"
          aria-label="Toggle navigation"
          aria-expanded={mobileMenu}
        >
          {mobileMenu ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>

      {/* =====================================================
          MOBILE NAVIGATION
      ===================================================== */}

            <div
        className={`absolute left-4 right-4 top-full mt-2 overflow-hidden rounded-2xl border border-white/30 bg-[#FAF6F0]/95 shadow-[0_20px_50px_rgba(48,37,54,0.18)] backdrop-blur-2xl transition-all duration-300 lg:hidden ${
          mobileMenu
            ? "visible pointer-events-auto translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-3 opacity-0"
        }`}
      >

        <div className="p-4">
          {/* MOBILE LINKS */}
          <div className="flex flex-col gap-1">
            <a
              href="#features"
              onClick={closeMobileMenu}
              className="rounded-xl px-4 py-3 text-[13px] font-semibold text-[#302536] transition hover:bg-[#E9DED5]/70"
            >
              Features
            </a>

            <a
              href="#clarity"
              onClick={closeMobileMenu}
              className="rounded-xl px-4 py-3 text-[13px] font-semibold text-[#302536] transition hover:bg-[#E9DED5]/70"
            >
              Why Buildora
            </a>

            <a
              href="#how-it-works"
              onClick={closeMobileMenu}
              className="rounded-xl px-4 py-3 text-[13px] font-semibold text-[#302536] transition hover:bg-[#E9DED5]/70"
            >
              How It Works
            </a>

            <a
              href="#owners"
              onClick={closeMobileMenu}
              className="rounded-xl px-4 py-3 text-[13px] font-semibold text-[#302536] transition hover:bg-[#E9DED5]/70"
            >
              For Building Owners
            </a>
          </div>

          {/* DIVIDER */}
          <div className="my-3 h-px bg-[#E9DED5]" />

          {/* MOBILE AUTH BUTTONS */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              className="rounded-xl border border-[#C25A43] px-4 py-3 text-[12px] font-semibold text-[#302536] transition hover:bg-[#F8E6DD]"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={handleRegister}
              className="rounded-xl bg-[#C25A43] px-4 py-3 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(194,90,67,0.20)] transition hover:bg-[#A94835]"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;