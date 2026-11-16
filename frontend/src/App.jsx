import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ProjectWorkspace from "./pages/ProjectWorkspace";

import ProjectsPage from "./pages/ProjectsPage";
import BOQPage from "./pages/BOQPage";
import ComingSoon from "./pages/ComingSoon";
import ValuationsPage from "./pages/ValuationsPage";
import CertificatesPage from "./pages/CertificatesPage";
import PaymentsPage from "./pages/PaymentsPage";
import DocumentsPage from "./pages/DocumentsPage";
import SiteUpdatesPage from "./pages/SiteUpdatesPage";
import MonthlyReportsPage from "./pages/MonthlyReportsPage";
import ProjectOverviewPage from "./pages/ProjectOverviewPage";
import BillingPage from "./pages/BillingPage";

import AppLayout from "./components/layout/AppLayout";
import ProfileDrawer from "./components/ProfileDrawer";
import AcceptInvitationPage from "./pages/AcceptInvitationPage";
import InvitationAuthPage from "./pages/InvitationAuthPage";
import VerifyCompanyEmailPage from "./pages/VerifyCompanyEmailPage";
import CompanyVerificationPage from "./pages/CompanyVerificationPage";
import PlatformAdminPage from "./pages/PlatformAdminPage";
import PasswordResetEntry from "./pages/PasswordResetEntry";

/* =========================================================
   TOKEN
========================================================= */

function getAccessToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

/* =========================================================
   PROTECTED ROUTE
========================================================= */

function ProtectedRoute({ children }) {
  const token = getAccessToken();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/* =========================================================
   APP
========================================================= */

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* =================================================
            PUBLIC
        ================================================= */}

        <Route
          path="/"
          element={<Home />}
        />

        <Route
  path="/invitation-auth"
  element={<InvitationAuthPage />}
/>

<Route
  path="/reset-password"
  element={<PasswordResetEntry />}
/>

<Route
  path="/verify-company-email"
  element={<VerifyCompanyEmailPage />}
/>

<Route
  path="/organizations/:organizationId/verification"
  element={
    <ProtectedRoute>
      <CompanyVerificationPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/platform-admin"
  element={
    <ProtectedRoute>
      <PlatformAdminPage />
    </ProtectedRoute>
  }
/>

        <Route
  path="/accept-invitation"
  element={<AcceptInvitationPage />}
/>


        {/* =================================================
            DASHBOARD
        ================================================= */}

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
  path="/billing"
  element={
    <ProtectedRoute>
      <BillingPage />
    </ProtectedRoute>
  }
/>


        {/* =================================================
            PROJECTS LIST
        ================================================= */}

        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProjectsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* MY PROFILE */}
<Route
  path="/profile"
  element={<Navigate to="/dashboard" replace />}
/>


        {/* =================================================
            PROJECT WORKSPACE
        ================================================= */}

        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectWorkspace />
            </ProtectedRoute>
          }
        />


        {/* =================================================
            BOQ
        ================================================= */}

        <Route
          path="/boq"
          element={
            <ProtectedRoute>
              <AppLayout>
                <BOQPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =================================================
            VALUATIONS
        ================================================= */}

        <Route
          path="/valuations"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ValuationsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =================================================
            CERTIFICATES
        ================================================= */}

        <Route
  path="/certificates"
  element={
    <ProtectedRoute>
      <AppLayout>
        <CertificatesPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>

        {/* =================================================
            PAYMENTS
        ================================================= */}

        <Route
  path="/payments"
  element={
    <ProtectedRoute>
      <AppLayout>
        <PaymentsPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>


        {/* =================================================
            DOCUMENTS
        ================================================= */}

        <Route
  path="/documents"
  element={
    <ProtectedRoute>
      <AppLayout>
        <DocumentsPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>


        {/* =================================================
            UNKNOWN URL
        ================================================= */}

        <Route
          path="*"
          element={
            <Navigate
              to={
                getAccessToken()
                  ? "/dashboard"
                  : "/"
              }
              replace
            />
          }
        />

        <Route
  path="/site-updates"
  element={
    <ProtectedRoute>
      <AppLayout>
        <SiteUpdatesPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/monthly-reports"
  element={
    <ProtectedRoute>
      <AppLayout>
        <MonthlyReportsPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/project-overview"
  element={
    <ProtectedRoute>
      <AppLayout>
        <ProjectOverviewPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>

      </Routes>

            <ProfileDrawer />

    </BrowserRouter>
  );
}

export default App;