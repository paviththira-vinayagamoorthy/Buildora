import { useState } from "react";
import { X } from "lucide-react";

import logo from "../assets/buildora-logo.png";

import SignInForm from "./SignInForm";
import RegisterForm from "./RegisterForm";
import PasswordRecoveryForm from "./PasswordRecoveryForm";

function AuthDrawer({
  drawer,
  setDrawer,
  openSignIn,
  openRegister,
  resetToken = "",
  onPasswordReset,
}) {
  const [resetMessage, setResetMessage] = useState("");
  

  function closeDrawer() {
    setDrawer(null);
  }

  function showSignIn() {
    if (openSignIn) {
      openSignIn();
    } else {
      setDrawer("signin");
    }
  }

  function showRegister() {
    setResetMessage("");

    if (openRegister) {
      openRegister();
    } else {
      setDrawer("register");
    }
  }

  function showForgotPassword() {
    setResetMessage("");
    setDrawer("forgot");
  }

  function handleResetComplete(message) {
    setResetMessage(message);
    onPasswordReset?.();
    showSignIn();
  }

  return (
    <>
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-[#302536]/70 backdrop-blur-[5px] transition-opacity duration-300 ${
          drawer
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer ? true : undefined}
        aria-label="Buildora account"
        aria-hidden={!drawer}
        inert={!drawer}
        className={`fixed right-0 top-0 z-50 h-[100dvh] w-full overflow-hidden bg-[#FFFCF8] shadow-[-30px_0_90px_rgba(48,37,54,0.28)] transition-transform duration-500 ease-out sm:w-[500px] sm:max-w-full ${
          drawer ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="relative flex h-full min-h-0 flex-col">
          <header className="flex h-[82px] shrink-0 items-center justify-between px-8 sm:px-9">
            <img
              src={logo}
              alt="Buildora"
              className="h-[42px] w-auto object-contain"
            />

            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close authentication panel"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E7DDD5] bg-white text-[#302536]"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </header>

          <div className="mx-9 h-[2px] w-8 shrink-0 rounded-full bg-[#D87963]" />

          {drawer === "signin" && resetMessage && (
            <div
              role="status"
              className="mx-8 mt-4 rounded-xl border border-[#BDCDBF] bg-[#EDF3ED] p-4 text-[13px] leading-6 text-[#3D6046]"
            >
              {resetMessage}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {drawer === "signin" && (
              <SignInForm
                openRegister={showRegister}
                openForgotPassword={showForgotPassword}
              />
            )}

            {drawer === "register" && (
              <RegisterForm openSignIn={showSignIn} />
            )}

            {drawer === "forgot" && (
              <PasswordRecoveryForm
                key="forgot"
                mode="forgot"
                onBackToSignIn={showSignIn}
              />
            )}

            {drawer === "reset" && (
              <PasswordRecoveryForm
                key={`reset-${resetToken}`}
                mode="reset"
                token={resetToken}
                onBackToSignIn={showSignIn}
                onResetComplete={handleResetComplete}
                onRequestNewLink={showForgotPassword}
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default AuthDrawer;