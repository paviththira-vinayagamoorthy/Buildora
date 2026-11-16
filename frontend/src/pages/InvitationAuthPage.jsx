import { useState } from "react";
import { useNavigate } from "react-router-dom";

import AuthDrawer from "../components/AuthDrawer";

export default function InvitationAuthPage() {
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState("signin");

  function closeAuthentication(value) {
    if (value !== null) {
      setDrawer(value);
      return;
    }

    const savedPath = sessionStorage.getItem(
      "buildora_invitation_return"
    );

    if (savedPath) {
      try {
        const destination = new URL(
          savedPath,
          window.location.origin
        );

        const invitationId =
          destination.searchParams.get("invitation") || "";

        const token =
          destination.searchParams.get("token") || "";

        if (
          destination.origin === window.location.origin &&
          destination.pathname === "/accept-invitation" &&
          /^[1-9]\d*$/.test(invitationId) &&
          /^[A-Za-z0-9_-]{40,200}$/.test(token)
        ) {
          const query = new URLSearchParams({
            invitation: invitationId,
            token,
          });

          navigate(
            `/accept-invitation?${query.toString()}`,
            { replace: true }
          );

          return;
        }
      } catch {
        // Ignore an invalid return destination.
      }
    }

    navigate("/", { replace: true });
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#F3EEE7]"
    >
      <AuthDrawer
        drawer={drawer}
        setDrawer={closeAuthentication}
        openSignIn={() => setDrawer("signin")}
        openRegister={() => setDrawer("register")}
      />
    </div>
  );
}