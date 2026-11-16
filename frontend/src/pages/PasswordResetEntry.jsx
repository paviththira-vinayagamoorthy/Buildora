import { useState } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import AuthDrawer from "../components/AuthDrawer";

export default function PasswordResetEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [drawer, setDrawer] = useState("reset");
  const [resetToken, setResetToken] = useState(
    () => params.get("token") || ""
  );

  function changeDrawer(value) {
    if (value === null) {
      navigate("/", { replace: true });
      return;
    }

    if (value !== "reset") {
      setResetToken("");

      // Remove the reset secret when leaving the reset form.
      navigate("/reset-password", {
        replace: true,
      });
    }

    setDrawer(value);
  }

  return (
    <div className="min-h-[100dvh] bg-[#F3EEE7]">
      <AuthDrawer
        drawer={drawer}
        setDrawer={changeDrawer}
        resetToken={resetToken}
        openSignIn={() => changeDrawer("signin")}
        openRegister={() => changeDrawer("register")}
      />
    </div>
  );
}