import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  Eye,
  FileCheck2,
  HardHat,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import heroImage from "../assets/buildora-hero.png";

import Navbar from "../components/Navbar";
import AuthDrawer from "../components/AuthDrawer";
import Footer from "../components/Footer";

import "../styles/Home.css";

function Home() {
  const [drawer, setDrawer] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  const workflowRef = useRef(null);

  // How It Works animation
  useEffect(() => {
    const section = workflowRef.current;

    if (!section) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (
      reducedMotion ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    section.classList.add("flow-animate");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          section.classList.add("flow-visible");

          section
            .querySelector(".home-flow-dot-motion")
            ?.beginElement?.();

          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      section.classList.remove("flow-animate");
    };
  }, []);

  // Lock page scrolling while the authentication drawer is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (drawer) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);


  const openSignIn = () => {
    setDrawer("signin");
    setMobileMenu(false);
  };

  const openRegister = () => {
    setDrawer("register");
    setMobileMenu(false);
  };

  return (
    <main className="buildora-home min-h-screen bg-[#FAF6F0] text-[#25232A]">
      {/* HERO */}
      <section className="buildora-hero relative overflow-hidden bg-[#302536]">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Buildora construction project management"
            className="buildora-hero-image h-full w-full object-cover object-center"
          />

          <div className="buildora-hero-overlay absolute inset-0" />
          <div className="buildora-hero-vignette absolute inset-0" />
        </div>

        <div className="relative z-50">
          <Navbar
            mobileMenu={mobileMenu}
            setMobileMenu={setMobileMenu}
            openSignIn={openSignIn}
            openRegister={openRegister}
          />
        </div>

        <div className="buildora-hero-content relative z-20">
          <div className="buildora-glass-panel">
            <div className="buildora-glass-shine pointer-events-none absolute inset-0" />

            <div className="relative z-10 mx-auto max-w-[720px] text-center">
              <div className="buildora-hero-label flex items-center justify-center gap-4">
                <span className="h-px w-8 bg-[#F2C4AE]/60 sm:w-12" />

                <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[#F2C4AE] sm:text-[10px]">
                  Construction made simple
                </p>

                <span className="h-px w-8 bg-[#F2C4AE]/60 sm:w-12" />
              </div>

              <h1 className="mt-7 font-['Sora'] font-semibold tracking-[-0.055em] text-white">
                <span className="buildora-title-main block text-[48px] leading-[0.95] sm:text-[64px] md:text-[74px] lg:text-[82px]">
                  From BOQ to
                </span>

                <span className="buildora-title-handover relative mt-2 inline-block font-serif text-[55px] font-normal italic leading-[0.95] tracking-[-0.035em] text-[#F2C4AE] sm:text-[72px] md:text-[82px] lg:text-[88px]">
                  Handover.

                  <svg
                    viewBox="0 0 430 20"
                    fill="none"
                    aria-hidden="true"
                    className="absolute -bottom-4 left-1/2 h-[12px] w-[90%] -translate-x-1/2"
                  >
                    <path
                      className="buildora-title-underline"
                      d="M4 13C105 3 320 3 426 11"
                      stroke="#D87963"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>

              <div className="buildora-hero-copy">
                <p className="font-['Sora'] text-[18px] font-semibold leading-7 text-white sm:text-[20px]">
                  Your project details, all in one place.
                </p>

                <div className="buildora-hero-workflow">
                  <div className="hero-workflow-card">
                    <div className="hero-workflow-icon">
                      <FileCheck2 />
                    </div>
                    <span>BOQ</span>
                  </div>

                  <div
                    className="hero-workflow-connector"
                    aria-hidden="true"
                  >
                    <span />
                    <ChevronRight />
                  </div>

                  <div className="hero-workflow-card hero-workflow-card--verified">
                    <div className="hero-workflow-icon">
                      <ShieldCheck />
                    </div>
                    <span>Verified</span>
                  </div>

                  <div
                    className="hero-workflow-connector"
                    aria-hidden="true"
                  >
                    <span />
                    <ChevronRight />
                  </div>

                  <div className="hero-workflow-card">
                    <div className="hero-workflow-icon">
                      <HardHat />
                    </div>
                    <span>Handover</span>
                  </div>
                </div>

                <p className="buildora-hero-description text-[14px] font-normal text-white/80 sm:text-[15px]">
                  Keep your project team and BOQ together. Quantity Surveyors
                  prepare the costs, and Building Owners can see the published
                  details.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 z-30 h-[3px] w-full">
          <div className="buildora-bottom-accent h-full w-full" />
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="home-section relative overflow-hidden bg-[#FFFCF8] py-14 lg:py-16"
      >
        <div className="pointer-events-none absolute -left-20 top-20 h-40 w-40 rotate-45 rounded-[36px] bg-[#F2C4AE]/12" />

        <div className="pointer-events-none absolute -right-20 bottom-10 h-44 w-44 rotate-45 rounded-[40px] border border-[#D87963]/15" />

        <div className="pointer-events-none absolute left-[48%] top-[45%] h-56 w-56 rounded-full bg-[#F2C4AE]/10 blur-[80px]" />

        <div className="home-section-container relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="home-section-heading mx-auto max-w-3xl text-center">
            <h2 className="font-['Sora'] text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#302536] md:text-4xl">
              Less paperwork.
              <span className="ml-2 text-[#C25A43]">
                More organised projects.
              </span>
            </h2>

            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#777177]">
              Keep your team, project costs and important records together.
            </p>
          </div>

          <div className="home-features-content mt-9 grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    01
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#D87963]/10 transition-colors group-hover:bg-[#D87963]/15">
                        <WalletCards className="h-4 w-4 text-[#C25A43]" />
                      </div>

                      <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                        Project Costs
                      </h3>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      See your budget, spending and remaining money.
                    </p>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    02
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#789C86]/10 transition-colors group-hover:bg-[#789C86]/15">
                        <FileCheck2 className="h-4 w-4 text-[#789C86]" />
                      </div>

                      <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                        Project Documents
                      </h3>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      Keep your BOQs, bills and project records organised.
                    </p>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    03
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#D87963]/10 transition-colors group-hover:bg-[#D87963]/15">
                        <BarChart3 className="h-4 w-4 text-[#C25A43]" />
                      </div>

                      <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                        Work Progress
                      </h3>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      Follow the work completed on your building project.
                    </p>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    04
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#789C86]/10 transition-colors group-hover:bg-[#789C86]/15">
                        <Eye className="h-4 w-4 text-[#789C86]" />
                      </div>

                      <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                        Updates for Owners
                      </h3>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      Help Building Owners see what is happening on their
                      project.
                    </p>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    05
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E7A39A]/15 transition-colors group-hover:bg-[#E7A39A]/25">
                        <Sparkles className="h-4 w-4 text-[#C25A43]" />
                      </div>

                      <div>
                        <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                          Read Documents
                        </h3>

                        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#C25A43]">
                          AI Assisted
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      Use AI to help read details from supported documents.
                    </p>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-[20px] border border-transparent p-4 transition-all duration-300 hover:border-[#E9DED5] hover:bg-white hover:shadow-[0_12px_35px_rgba(48,37,54,0.06)]">
                <div className="flex gap-4">
                  <span className="pt-0.5 font-['Sora'] text-xs font-bold text-[#C25A43]">
                    06
                  </span>

                  <div className="border-l border-[#E9DED5] pl-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#789C86]/10 transition-colors group-hover:bg-[#789C86]/15">
                        <Sparkles className="h-4 w-4 text-[#789C86]" />
                      </div>

                      <div>
                        <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                          Simple Explanations
                        </h3>

                        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#789C86]">
                          AI Assisted
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#777177]">
                      Explain checked project details in everyday language.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* DIAMOND VISUAL */}
            <div className="home-feature-visual relative mx-auto h-[315px] w-full max-w-[520px]">
              <div className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E9DED5]/60" />

              <div className="home-main-diamond absolute left-1/2 top-1/2 h-[215px] w-[215px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[36px] bg-[#302536] shadow-[0_28px_65px_rgba(48,37,54,0.2)]">
                <div className="flex h-full -rotate-45 flex-col items-center justify-center text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                    <BarChart3 className="h-5 w-5 text-[#F2C4AE]" />
                  </div>

                  <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Project Progress
                  </p>

                  <p className="mt-1 font-['Sora'] text-[34px] font-semibold leading-none text-white">
                    68%
                  </p>

                  <div className="mt-4 h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[68%] rounded-full bg-[#D87963]" />
                  </div>

                  <div className="mt-4 flex items-center gap-5">
                    <div>
                      <p className="font-['Sora'] text-sm font-semibold text-white">
                        61%
                      </p>
                      <p className="mt-0.5 text-[8px] text-white/40">
                        Budget Used
                      </p>
                    </div>

                    <div className="h-7 w-px bg-white/10" />

                    <div>
                      <p className="font-['Sora'] text-sm font-semibold text-white">
                        ₹3.3M
                      </p>
                      <p className="mt-0.5 text-[8px] text-white/40">
                        Remaining
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-small-diamond absolute left-[4%] top-[4%] flex h-28 w-28 rotate-45 items-center justify-center rounded-[24px] bg-[#F2C4AE] shadow-[0_15px_35px_rgba(48,37,54,0.12)] transition-transform duration-300 hover:scale-105">
                <div className="-rotate-45 text-center">
                  <FileCheck2 className="mx-auto h-5 w-5 text-[#C25A43]" />

                  <p className="mt-2 font-['Sora'] text-xs font-semibold text-[#302536]">
                    Verified
                  </p>

                  <p className="mt-1 text-[8px] text-[#777177]">
                    Documents
                  </p>
                </div>
              </div>

              <div className="home-small-diamond absolute bottom-[3%] right-[3%] flex h-28 w-28 rotate-45 items-center justify-center rounded-[24px] bg-[#789C86] shadow-[0_15px_35px_rgba(48,37,54,0.14)] transition-transform duration-300 hover:scale-105">
                <div className="-rotate-45 text-center">
                  <Eye className="mx-auto h-5 w-5 text-white" />

                  <p className="mt-2 font-['Sora'] text-xs font-semibold text-white">
                    Owner
                  </p>

                  <p className="mt-1 text-[8px] text-white/60">
                    Clear View
                  </p>
                </div>
              </div>

              <div className="home-ai-diamond absolute right-[7%] top-[5%] flex h-[78px] w-[78px] rotate-45 items-center justify-center rounded-[18px] bg-[#E7A39A] shadow-[0_12px_28px_rgba(48,37,54,0.1)]">
                <div className="-rotate-45 text-center">
                  <Sparkles className="mx-auto h-5 w-5 text-[#302536]" />

                  <span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.1em] text-[#302536]/65">
                    AI
                  </span>
                </div>
              </div>

              <div className="absolute bottom-[8%] left-[13%] h-14 w-14 rotate-45 rounded-[15px] border border-[#D87963]/30 bg-white/30" />
            </div>
          </div>

          <div className="home-section-note mt-6 flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#E9DED5] bg-white/70 px-5 py-2.5 text-[10px] font-semibold shadow-[0_8px_25px_rgba(48,37,54,0.04)]">
              <span className="text-[#777177]">Read documents</span>
              <ArrowRight className="h-3 w-3 text-[#D87963]" />

              <span className="text-[#777177]">Calculate costs</span>
              <ArrowRight className="h-3 w-3 text-[#D87963]" />

              <span className="text-[#789C86]">QS reviews</span>
              <ArrowRight className="h-3 w-3 text-[#D87963]" />

              <span className="text-[#302536]">Owner views</span>
            </div>
          </div>
        </div>
      </section>

      {/* SHARED PROJECT INFORMATION */}
      <section
        id="clarity"
        className="home-section relative overflow-hidden bg-[#F8F1EA] py-14 lg:py-16"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-[340px] w-[340px] rounded-full bg-[#F2C4AE]/25 blur-[80px]" />

          <div className="absolute -bottom-32 right-[5%] h-[380px] w-[380px] rounded-full bg-[#789C86]/10 blur-[100px]" />

          <div className="absolute right-[20%] top-[10%] h-[260px] w-[260px] rounded-full border border-[#D87963]/10" />

          <div className="absolute -right-20 top-20 h-[220px] w-[220px] rotate-45 rounded-[55px] border border-[#302536]/5" />

          <div className="absolute left-[7%] top-[24%] h-2.5 w-2.5 rounded-full bg-[#D87963]/50" />

          <div className="absolute bottom-[20%] right-[8%] h-2 w-2 rounded-full bg-[#789C86]/50" />
        </div>

        <div className="home-section-container relative mx-auto max-w-6xl px-6 lg:px-8">
          <div className="home-section-heading mx-auto max-w-3xl text-center">
            <h2 className="font-['Sora'] text-[32px] font-semibold leading-tight tracking-[-0.04em] text-[#302536] md:text-[40px]">
              Everyone works from
              <span className="ml-2 text-[#C25A43]">
                the same project details.
              </span>
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-6 text-[#777177]">
              See BOQ changes, keep earlier versions and share published costs
              with your Building Owner.
            </p>
          </div>

          <div className="home-clarity-content mx-auto mt-12 grid max-w-6xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
            {/* ORBIT */}
            <div className="why-orbit relative mx-auto flex h-[480px] w-full max-w-[500px] items-center justify-center">
              <div className="why-orbit-glow absolute h-[340px] w-[340px] rounded-full bg-white/35 shadow-[0_25px_70px_rgba(48,37,54,0.06)]" />

              <div className="why-orbit-outer absolute h-[322px] w-[322px] rounded-full border border-[#302536]/10" />

              <div className="why-orbit-ring absolute h-[296px] w-[296px] rounded-full border border-dashed border-[#D87963]/45">
                <span className="absolute left-1/2 top-[-5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#D87963] shadow-[0_0_0_5px_rgba(216,121,99,0.12)]" />

                <span className="absolute bottom-[-5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#789C86] shadow-[0_0_0_5px_rgba(120,156,134,0.12)]" />
              </div>

              <div className="why-orbit-inner absolute h-[254px] w-[254px] rounded-full border border-[#D87963]/15" />

              <div className="why-orbit-arc absolute h-[268px] w-[268px] rounded-full border-[10px] border-transparent border-l-[#D87963] border-t-[#D87963]" />

              <div className="absolute h-[220px] w-[220px] rounded-full bg-[#D87963]/10 blur-[35px]" />

              <div className="why-center relative z-20 flex h-[205px] w-[205px] items-center justify-center rounded-full bg-[#302536] shadow-[0_25px_55px_rgba(48,37,54,0.22)]">
                <div className="absolute inset-4 rounded-full border border-white/[0.06]" />

                <div className="absolute inset-7 rounded-full bg-gradient-to-br from-white/[0.06] to-transparent" />

                <div className="relative z-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08]">
                    <HardHat className="h-5 w-5 text-[#F2C4AE]" />
                  </div>

                  <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.24em] text-[#D87963]">
                    Built for clarity
                  </p>

                  <h3 className="mt-2 font-['Sora'] text-[27px] font-semibold leading-[1.12] tracking-[-0.03em] text-white">
                    Why
                    <br />
                    Buildora?
                  </h3>
                </div>
              </div>

              <div className="why-callout why-callout-1 absolute left-0 top-[7%] z-30">
                <div className="why-callout-card">
                  <div className="why-callout-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D87963]/10">
                    <WalletCards className="h-4 w-4 text-[#C25A43]" />
                  </div>

                  <div>
                    <p className="font-['Sora'] text-[11px] font-semibold text-[#302536]">
                      Project Costs
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#777177]">
                      Costs & payments
                    </p>
                  </div>
                </div>

                <span className="why-connector why-connector-1" />
              </div>

              <div className="why-callout why-callout-2 absolute right-0 top-[8%] z-30">
                <div className="why-callout-card">
                  <div className="why-callout-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#789C86]/10">
                    <Eye className="h-4 w-4 text-[#789C86]" />
                  </div>

                  <div>
                    <p className="font-['Sora'] text-[11px] font-semibold text-[#302536]">
                      Owner Updates
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#777177]">
                      Clear project view
                    </p>
                  </div>
                </div>

                <span className="why-connector why-connector-2" />
              </div>

              <div className="why-callout why-callout-3 absolute bottom-[7%] left-0 z-30">
                <div className="why-callout-card">
                  <div className="why-callout-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E7A39A]/20">
                    <FileCheck2 className="h-4 w-4 text-[#C25A43]" />
                  </div>

                  <div>
                    <p className="font-['Sora'] text-[11px] font-semibold text-[#302536]">
                      BOQ Changes
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#777177]">
                      Earlier versions kept
                    </p>
                  </div>
                </div>

                <span className="why-connector why-connector-3" />
              </div>

              <div className="why-callout why-callout-4 absolute bottom-[8%] right-0 z-30">
                <div className="why-callout-card">
                  <div className="why-callout-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#789C86]/10">
                    <ShieldCheck className="h-4 w-4 text-[#789C86]" />
                  </div>

                  <div>
                    <p className="font-['Sora'] text-[11px] font-semibold text-[#302536]">
                      Checked Details
                    </p>
                    <p className="mt-0.5 text-[8px] text-[#777177]">
                      Reviewed by the QS
                    </p>
                  </div>
                </div>

                <span className="why-connector why-connector-4" />
              </div>
            </div>

            {/* BENEFITS */}
            <div className="relative min-w-0">
              <div className="absolute bottom-[34px] left-[38px] top-[34px] hidden w-px bg-gradient-to-b from-[#D87963]/10 via-[#D87963]/35 to-[#789C86]/10 sm:block" />

              <div className="space-y-3">
                <div className="why-benefit-row group relative flex items-center">
                  <div className="mr-3 hidden w-8 text-right sm:block">
                    <span className="font-['Sora'] text-[10px] font-bold text-[#C25A43]">
                      01
                    </span>
                  </div>

                  <div className="why-benefit-icon relative z-10 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border-[6px] border-[#F8F1EA] bg-[#D87963] shadow-[0_10px_24px_rgba(194,90,67,0.22)] transition duration-300 group-hover:scale-105">
                    <WalletCards className="h-[21px] w-[21px] text-white" />
                  </div>

                  <div className="why-benefit-line h-px w-5 shrink-0 bg-[#D87963]/35" />

                  <div className="why-benefit-card relative min-h-[96px] min-w-0 flex-1 overflow-hidden rounded-[22px] border border-white/80 bg-white/75 px-6 py-4 shadow-[0_8px_28px_rgba(48,37,54,0.055)] backdrop-blur-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:shadow-[0_15px_35px_rgba(48,37,54,0.09)]">
                    <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#D87963] opacity-0 transition group-hover:opacity-100" />

                    <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                      Know Your Project Costs
                    </h3>

                    <p className="mt-1 text-[12px] leading-5 text-[#777177]">
                      Keep costs together so your team can see what has changed.
                    </p>
                  </div>
                </div>

                <div className="why-benefit-row group relative flex items-center">
                  <div className="mr-3 hidden w-8 text-right sm:block">
                    <span className="font-['Sora'] text-[10px] font-bold text-[#C25A43]">
                      02
                    </span>
                  </div>

                  <div className="why-benefit-icon relative z-10 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border-[6px] border-[#F8F1EA] bg-[#789C86] shadow-[0_10px_24px_rgba(120,156,134,0.22)] transition duration-300 group-hover:scale-105">
                    <Eye className="h-[21px] w-[21px] text-white" />
                  </div>

                  <div className="why-benefit-line h-px w-5 shrink-0 bg-[#789C86]/35" />

                  <div className="why-benefit-card relative min-h-[96px] min-w-0 flex-1 overflow-hidden rounded-[22px] border border-white/80 bg-white/75 px-6 py-4 shadow-[0_8px_28px_rgba(48,37,54,0.055)] backdrop-blur-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:shadow-[0_15px_35px_rgba(48,37,54,0.09)]">
                    <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#789C86] opacity-0 transition group-hover:opacity-100" />

                    <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                      Keep Owners Informed
                    </h3>

                    <p className="mt-1 text-[12px] leading-5 text-[#777177]">
                      Let Building Owners view shared project details, even
                      when they are away.
                    </p>
                  </div>
                </div>

                <div className="why-benefit-row group relative flex items-center">
                  <div className="mr-3 hidden w-8 text-right sm:block">
                    <span className="font-['Sora'] text-[10px] font-bold text-[#C25A43]">
                      03
                    </span>
                  </div>

                  <div className="why-benefit-icon relative z-10 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border-[6px] border-[#F8F1EA] bg-[#E7A39A] shadow-[0_10px_24px_rgba(231,163,154,0.28)] transition duration-300 group-hover:scale-105">
                    <FileCheck2 className="h-[21px] w-[21px] text-[#302536]" />
                  </div>

                  <div className="why-benefit-line h-px w-5 shrink-0 bg-[#E7A39A]/50" />

                  <div className="why-benefit-card relative min-h-[96px] min-w-0 flex-1 overflow-hidden rounded-[22px] border border-white/80 bg-white/75 px-6 py-4 shadow-[0_8px_28px_rgba(48,37,54,0.055)] backdrop-blur-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:shadow-[0_15px_35px_rgba(48,37,54,0.09)]">
                    <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#E7A39A] opacity-0 transition group-hover:opacity-100" />

                    <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                      Keep Every BOQ Version
                    </h3>

                    <p className="mt-1 text-[12px] leading-5 text-[#777177]">
                      Record why costs changed and keep earlier BOQ versions
                      for reference.
                    </p>
                  </div>
                </div>

                <div className="why-benefit-row group relative flex items-center">
                  <div className="mr-3 hidden w-8 text-right sm:block">
                    <span className="font-['Sora'] text-[10px] font-bold text-[#C25A43]">
                      04
                    </span>
                  </div>

                  <div className="why-benefit-icon relative z-10 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border-[6px] border-[#F8F1EA] bg-[#302536] shadow-[0_10px_24px_rgba(48,37,54,0.2)] transition duration-300 group-hover:scale-105">
                    <ShieldCheck className="h-[21px] w-[21px] text-[#F2C4AE]" />
                  </div>

                  <div className="why-benefit-line h-px w-5 shrink-0 bg-[#302536]/25" />

                  <div className="why-benefit-card relative min-h-[96px] min-w-0 flex-1 overflow-hidden rounded-[22px] border border-white/80 bg-white/75 px-6 py-4 shadow-[0_8px_28px_rgba(48,37,54,0.055)] backdrop-blur-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:shadow-[0_15px_35px_rgba(48,37,54,0.09)]">
                    <div className="absolute bottom-0 left-0 top-0 w-1 bg-[#302536] opacity-0 transition group-hover:opacity-100" />

                    <h3 className="font-['Sora'] text-[15px] font-semibold text-[#302536]">
                      Review Before Sharing
                    </h3>

                    <p className="mt-1 text-[12px] leading-5 text-[#777177]">
                      The Quantity Surveyor checks the details before publishing
                      them for the Building Owner.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="home-section-note mt-8 flex justify-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/80 bg-white/60 px-5 py-2.5 text-[10px] font-semibold text-[#777177] shadow-[0_8px_25px_rgba(48,37,54,0.04)] backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-[#789C86]" />
              <span>Shared details</span>
              <span className="text-[#D87963]">•</span>
              <span>Reviewed by QS</span>
              <span className="text-[#D87963]">•</span>
              <span className="text-[#302536]">Clear for owners</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
<section
  ref={workflowRef}
  id="how-it-works"
  className="home-flow"
  aria-labelledby="home-flow-title"
>
  <div className="home-flow-inner">
    <header className="home-flow-heading">

      <h2 id="home-flow-title">
        Add your documents.
        <span>Review and share the details.</span>
      </h2>

      <p className="home-flow-subtitle">
        Your QS reviews the information before it reaches
        the Building Owner.
      </p>
    </header>

    <div className="home-flow-journey">
      <svg
        className="home-flow-curve"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="home-flow-track"
          d="M150 64 C250 64 350 128 450 128 S650 64 750 64 S950 128 1050 128"
        />

        <path
          className="home-flow-draw"
          pathLength="1"
          d="M150 64 C250 64 350 128 450 128 S650 64 750 64 S950 128 1050 128"
        />

        <circle className="home-flow-dot" r="3.5">
          <animateMotion
            className="home-flow-dot-motion"
            dur="2.4s"
            begin="indefinite"
            fill="freeze"
            path="M150 64 C250 64 350 128 450 128 S650 64 750 64 S950 128 1050 128"
          />
        </circle>
      </svg>

      <ol className="home-flow-list">
        {[
          {
            number: "01",
            Icon: FileCheck2,
            title: "Upload documents",
            text: "Add your project files.",
          },
          {
            number: "02",
            Icon: Sparkles,
            title: "Read the details",
            text: "AI assists with supported documents.",
          },
          {
            number: "03",
            Icon: ShieldCheck,
            title: "QS reviews",
            text: "Your QS checks and corrects the details.",
          },
          {
            number: "04",
            Icon: Eye,
            title: "Owner views",
            text: "View the published project information.",
          },
        ].map(({ number, Icon, title, text }) => (
          <li
            key={number}
            className={`home-flow-step home-flow-step-${number}`}
          >
            <div className="home-flow-node-wrap">
              <span className="home-flow-number">
                {number}
              </span>

              <span className="home-flow-node">
                <Icon
                  size={28}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
            </div>

            <div className="home-flow-copy">
              {number === "03" && (
                <span className="home-flow-reviewed">
                  Human reviewed
                </span>
              )}

              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </div>
</section>
      {/* BUILDING OWNERS */}
      <section
        id="owners"
        className="home-section relative overflow-hidden bg-[#FFFCF8] px-6 py-14 lg:px-12 lg:py-16"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-16 h-44 w-44 rotate-45 rounded-[40px] bg-[#F2C4AE]/15" />

          <div className="absolute -right-16 bottom-16 h-52 w-52 rotate-45 rounded-[45px] bg-[#789C86]/5" />

          <div className="absolute right-[8%] top-[18%] h-16 w-16 rotate-45 rounded-[18px] border border-[#D87963]/15" />

          <div className="absolute bottom-[16%] left-[6%] h-10 w-10 rotate-45 rounded-xl bg-[#E7A39A]/15" />
        </div>

        <div className="relative mx-auto max-w-[1180px]">
          <div className="home-section-heading mx-auto max-w-[800px] text-center">
            <h2 className="font-sora text-[34px] font-bold leading-[1.08] tracking-[-0.045em] text-[#302536] sm:text-[40px] lg:text-[44px]">
              Follow your building project.
              <span className="block text-[#C25A43]">
                From wherever you are.
              </span>
            </h2>

            <p className="mx-auto mt-3 max-w-[690px] text-[13px] leading-6 text-[#777177]">
              View the project costs and published BOQ details shared by your
              Quantity Surveyor.
            </p>
          </div>

          <div className="home-owner-content relative mx-auto mt-10 max-w-[960px]">
            <div className="grid items-center gap-5 lg:grid-cols-[1fr_250px_1fr]">
              <div className="space-y-4">
                <div className="home-owner-card rounded-[22px] border border-[#E9DED5] bg-white p-5 shadow-[0_12px_35px_rgba(48,37,54,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(48,37,54,0.09)]">
                  <div className="flex items-center gap-4">
                    <div className="home-owner-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-[#F2C4AE]">
                      <BarChart3 size={21} className="text-[#C25A43]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="home-owner-stat flex items-center justify-between gap-3">
                        <h3 className="font-sora text-[15px] font-bold text-[#302536]">
                          Project Progress
                        </h3>

                        <span className="font-sora text-[21px] font-bold text-[#C25A43]">
                          68%
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] text-[#777177]">
                        See how much work is complete.
                      </p>

                      <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#E9DED5]">
                        <div className="h-full w-[68%] rounded-full bg-[#D87963]" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="home-owner-card rounded-[22px] border border-[#E9DED5] bg-white p-5 shadow-[0_12px_35px_rgba(48,37,54,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(48,37,54,0.09)]">
                  <div className="flex items-center gap-4">
                    <div className="home-owner-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-[#789C86]/15">
                      <WalletCards size={21} className="text-[#789C86]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="home-owner-stat flex items-center justify-between gap-3">
                        <h3 className="font-sora text-[15px] font-bold text-[#302536]">
                          Project Spending
                        </h3>

                        <span className="font-sora text-[21px] font-bold text-[#789C86]">
                          61%
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] text-[#777177]">
                        See how much of your budget is used.
                      </p>

                      <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#E9DED5]">
                        <div className="h-full w-[61%] rounded-full bg-[#789C86]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-owner-orbit relative mx-auto flex h-[270px] w-[270px] items-center justify-center">
                <div className="home-owner-orbit-outer absolute h-[270px] w-[270px] rounded-full border border-dashed border-[#D87963]/25" />

                <div className="home-owner-orbit-inner absolute h-[238px] w-[238px] rounded-full border border-[#E9DED5]" />

                <div className="absolute left-[3px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[#D87963]" />

                <div className="absolute right-[3px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[#789C86]" />

                <div className="relative z-10 flex h-[205px] w-[205px] flex-col items-center justify-center rounded-full bg-[#302536] text-center shadow-[0_25px_55px_rgba(48,37,54,0.20)]">
                  <div className="absolute inset-4 rounded-full border border-white/[0.06]" />

                  <div className="relative z-10">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.08]">
                      <Eye size={20} className="text-[#F2C4AE]" />
                    </div>

                    <p className="mt-3 text-[8px] font-bold uppercase tracking-[0.2em] text-[#D87963]">
                      Building Owner
                    </p>

                    <h3 className="font-sora mt-2 text-[21px] font-bold leading-tight text-white">
                      One Clear
                      <span className="block text-[#F2C4AE]">
                        Project View
                      </span>
                    </h3>

                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#789C86]/15 px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#A8C7B4]" />

                      <span className="text-[8px] font-semibold text-[#A8C7B4]">
                        Project On Track
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="home-owner-card rounded-[22px] border border-[#E9DED5] bg-white p-5 shadow-[0_12px_35px_rgba(48,37,54,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(48,37,54,0.09)]">
                  <div className="flex items-start gap-4">
                    <div className="home-owner-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-[#789C86]">
                      <ShieldCheck size={21} className="text-white" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-sora text-[15px] font-bold text-[#302536]">
                        Reviewed Updates
                      </h3>

                      <p className="mt-1 text-[11px] leading-5 text-[#777177]">
                        Your QS checks important details before sharing them.
                      </p>

                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#789C86]/10 px-2.5 py-1">
                        <ShieldCheck size={11} className="text-[#789C86]" />

                        <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#789C86]">
                          QS Reviewed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="home-owner-card rounded-[22px] bg-gradient-to-br from-[#F2C4AE] to-[#F5D0BD] p-5 shadow-[0_12px_35px_rgba(48,37,54,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(48,37,54,0.10)]">
                  <div className="flex items-start gap-4">
                    <div className="home-owner-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-white/45">
                      <Sparkles size={21} className="text-[#C25A43]" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-sora text-[15px] font-bold text-[#302536]">
                          Easy to Understand
                        </h3>

                        <span className="rounded-full bg-[#302536]/10 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] text-[#302536]">
                          AI
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] leading-5 text-[#5F555F]">
                        Get simple explanations of reviewed project details.
                      </p>

                      <div className="mt-2 flex items-center gap-1.5 text-[8px] font-bold text-[#C25A43]">
                        <Sparkles size={11} />
                        Made for owners
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="home-section-note mt-7 flex justify-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-[#E9DED5] bg-white px-5 py-2.5 text-[9px] font-semibold text-[#777177] shadow-[0_8px_25px_rgba(48,37,54,0.05)]">
                <span className="text-[#C25A43]">Progress</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#789C86]" />
                <span className="text-[#789C86]">Costs</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#302536]" />
                <span className="text-[#302536]">Reviewed by QS</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#F2C4AE]" />
                <span className="text-[#302536]">Clear for owners</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer
        openSignIn={openSignIn}
        openRegister={openRegister}
      />

      <AuthDrawer
        drawer={drawer}
        setDrawer={setDrawer}
        openSignIn={openSignIn}
        openRegister={openRegister}
      />
    </main>
  );
}

function WorkflowStep({
  number,
  icon,
  title,
  text,
  accent = false,
}) {
  return (
    <article className="home-workflow-step relative text-center">
      <div
        className={`relative z-10 mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-[20px] border-[6px] border-[#FAF6F0] shadow-[0_12px_28px_rgba(48,37,54,0.09)] ${
          accent
            ? "bg-[#C25A43] text-white"
            : "bg-[#302536] text-[#F2C4AE]"
        }`}
      >
        {icon}
      </div>

      <span className="mt-4 block text-[9px] font-bold uppercase tracking-[0.22em] text-[#C25A43]">
        Step {number}
      </span>

      <h3 className="font-sora mt-2 text-[17px] font-bold text-[#302536]">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-[250px] text-[12px] leading-5 text-[#777177]">
        {text}
      </p>
    </article>
  );
}

export default Home;