import logo from "../assets/buildora-logo.png";

function Footer() {
  return (
    <footer className="border-t border-[#D87963]/40 bg-[#302536] px-6 py-6 lg:px-12">
      <div className="mx-auto grid max-w-[1380px] grid-cols-1 items-center gap-5 text-center md:grid-cols-[auto_1fr_auto] md:gap-8 md:text-left">
        <div className="mx-auto rounded-lg bg-[#FFFCF8] px-2 py-1 md:mx-0">
          <img
            src={logo}
            alt="Buildora"
            className="h-10 w-auto object-contain"
          />
        </div>

        <p className="m-0 text-[13px] leading-6 text-white/75 md:border-l md:border-white/15 md:pl-8">
          Clear project information.
          <span className="block font-medium text-white/95 lg:inline">
            {" "}Connected teams. Confident decisions.
          </span>
        </p>

        <p className="m-0 text-[11px] leading-5 text-white/75 md:text-right">
          © {new Date().getFullYear()} Buildora.
          <span className="block">
            All rights reserved.
          </span>
        </p>
      </div>
    </footer>
  );
}

export default Footer;