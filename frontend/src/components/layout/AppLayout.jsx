import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useLocation } from "react-router-dom";

import WorkspaceHeader from "./workspaceHeader";
import WorkspaceSidebar from "./WorkspaceSidebar";

import {
  getWorkspaceContext,
} from "../../services/workspaceApi";

export default function AppLayout({ children }) {
  const location = useLocation();
  const contentRef = useRef(null);

  const [hasProjectAccess, setHasProjectAccess] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkProjectAccess() {
      try {
        const context = await getWorkspaceContext();

        if (!cancelled) {
          setHasProjectAccess(
            Boolean(context?.projects?.length)
          );
        }
      } catch {
        if (!cancelled) {
          setHasProjectAccess(false);
        }
      }
    }

    void checkProjectAccess();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useLayoutEffect(() => {
    contentRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [location.pathname]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#FAF6F0]">
      {/* HEADER */}
      <div className="relative z-40 shrink-0">
        <WorkspaceHeader />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <WorkspaceSidebar
          hasProjectAccess={hasProjectAccess}
        />

        {/* SCROLLABLE CONTENT */}
        <main
          ref={contentRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {children}
        </main>
      </div>
    </div>
  );
}