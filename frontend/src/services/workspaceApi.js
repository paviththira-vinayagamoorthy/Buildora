const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/* =========================================================
   TOKEN HELPERS
========================================================= */

export function getAccessToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

export function getRefreshToken() {
  return (
    localStorage.getItem("buildora_refresh_token") ||
    sessionStorage.getItem("buildora_refresh_token")
  );
}

export function clearBuildoraAuth() {
  localStorage.removeItem("buildora_access_token");
  sessionStorage.removeItem("buildora_access_token");

  localStorage.removeItem("buildora_refresh_token");
  sessionStorage.removeItem("buildora_refresh_token");

  localStorage.removeItem("buildora_user");
  sessionStorage.removeItem("buildora_user");

  localStorage.removeItem("buildora_active_organization");
  localStorage.removeItem("buildora_active_project");
}

/* =========================================================
   GENERIC API REQUEST
========================================================= */

async function apiRequest(endpoint, options = {}) {
  const token = getAccessToken();

  // Important for Excel / FormData uploads.
  // Browser must set multipart/form-data automatically.
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isFormData && options.body
      ? {
          "Content-Type": "application/json",
        }
      : {}),
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot connect to the Buildora server. Make sure the backend is running."
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  /* =======================================================
     UNAUTHORIZED
  ======================================================= */

  if (response.status === 401) {
  clearBuildoraAuth();

  if (window.location.pathname !== "/") {
    window.location.replace("/");
  }

  throw new Error(
    "Your session has expired. Please sign in again."
  );
}
  /* =======================================================
     OTHER API ERRORS
  ======================================================= */

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";

    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = data.detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(", ");
    } else if (typeof data?.message === "string") {
      message = data.message;
    }

    throw new Error(message);
  }

  return data;
}

/* =========================================================
   WORKSPACE
========================================================= */

export function getWorkspaceContext() {
  return apiRequest("/workspace/context", {
    method: "GET",
  });
}

export function getOrganizationSubscription(organizationId) {
  return apiRequest(
    `/billing/organizations/${encodeURIComponent(organizationId)}/subscription`,
    { method: "GET" }
  );
}

/* =========================================================
   ORGANIZATIONS
========================================================= */

export function getOrganizations() {
  return apiRequest("/organizations/", {
    method: "GET",
  });
}

export function getOrganization(organizationId) {
  return apiRequest(`/organizations/${organizationId}`, {
    method: "GET",
  });
}

export function getOrganizationMembers(organizationId) {
  return apiRequest(
    `/organizations/${organizationId}/members`,
    {
      method: "GET",
    }
  );
}

export function getMyOrganizationMembership(
  organizationId
) {
  return apiRequest(
    `/organizations/${organizationId}/my-membership`,
    {
      method: "GET",
    }
  );
}

export function createOrganization(name) {
  return apiRequest("/organizations/", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
    }),
  });
}

/* =========================================================
   INVITATIONS
========================================================= */

export function getMyInvitations() {
  return apiRequest("/invitations/mine", {
    method: "GET",
  });
}

export function getOrganizationInvitations(
  organizationId
) {
  return apiRequest(
    `/invitations/organizations/${organizationId}`,
    {
      method: "GET",
    }
  );
}

export function createInvitation(
  organizationId,
  invitationData
) {
  return apiRequest(
    `/invitations/organizations/${organizationId}`,
    {
      method: "POST",
      body: JSON.stringify(invitationData),
    }
  );
}

export function acceptInvitation(invitationId) {
  return apiRequest(
    `/invitations/${invitationId}/accept`,
    {
      method: "POST",
    }
  );
}

export function declineInvitation(invitationId) {
  return apiRequest(
    `/invitations/${invitationId}/decline`,
    {
      method: "POST",
    }
  );
}

/* =========================================================
   PROJECTS
========================================================= */

export function getMyProjects() {
  return apiRequest("/projects/mine", {
    method: "GET",
  });
}

export function getProject(projectId) {
  return apiRequest(`/projects/${projectId}`, {
    method: "GET",
  });
}

export function getOrganizationProjects(
  organizationId
) {
  return apiRequest(
    `/projects/organizations/${organizationId}`,
    {
      method: "GET",
    }
  );
}

export function createProject(
  organizationId,
  projectData
) {
  return apiRequest(
    `/projects/organizations/${organizationId}`,
    {
      method: "POST",
      body: JSON.stringify(projectData),
    }
  );
}

export function getProjectMembers(projectId) {
  return apiRequest(`/projects/${projectId}/members`, {
    method: "GET",
  });
}

export function addProjectMember(
  projectId,
  memberData
) {
  return apiRequest(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(memberData),
  });
}

/* =========================================================
   BOQ
========================================================= */

export function createBOQ(projectId, boqData) {
  return apiRequest(`/boq/projects/${projectId}`, {
    method: "POST",
    body: JSON.stringify(boqData),
  });
}

export function getProjectBOQs(projectId) {
  return apiRequest(`/boq/projects/${projectId}`, {
    method: "GET",
  });
}

export function getBOQ(boqId) {
  return apiRequest(`/boq/${boqId}`, {
    method: "GET",
  });
}

export function createBOQItem(boqId, itemData) {
  return apiRequest(`/boq/${boqId}/items`, {
    method: "POST",
    body: JSON.stringify(itemData),
  });
}

export function updateBOQItem(
  boqId,
  itemId,
  itemData
) {
  return apiRequest(
    `/boq/${boqId}/items/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify(itemData),
    }
  );
}

export function deleteBOQItem(
  boqId,
  itemId
) {
  return apiRequest(
    `/boq/${boqId}/items/${itemId}`,
    {
      method: "DELETE",
    }
  );
}

/* =========================================================
   BOQ EXCEL IMPORT
========================================================= */

export function previewBOQImport(projectId, file, sourceBoqId = null) {
  const formData = new FormData();
  formData.append("file", file);

  const query =
    sourceBoqId == null
      ? ""
      : `?source_boq_id=${encodeURIComponent(sourceBoqId)}`;

  return apiRequest(
    `/boq/projects/${projectId}/import/preview${query}`,
    {
      method: "POST",
      body: formData,
    }
  );
}

export function confirmBOQImport(projectId, importData) {
  return apiRequest(
    `/boq/projects/${projectId}/import/confirm`,
    {
      method: "POST",
      body: JSON.stringify(importData),
    }
  );
}

/* =========================================================
   BOQ PUBLISH & REVISIONS
========================================================= */

export function publishBOQ(boqId) {
  return apiRequest(`/boq/${boqId}/publish`, {
    method: "POST",
  });
}

export function createBOQRevision(boqId, reason) {
  return apiRequest(`/boq/${boqId}/revisions`, {
    method: "POST",
    body: JSON.stringify({
      reason: reason.trim(),
    }),
  });
}

/* =========================================================
   BOQ EXCEL EXPORT
========================================================= */

export async function downloadBOQExcel(boqId) {
  const token = getAccessToken();

  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/boq/${encodeURIComponent(boqId)}/export`,
      {
        method: "GET",
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
      }
    );
  } catch {
    throw new Error(
      "Cannot connect to the Buildora server. Make sure the backend is running."
    );
  }

  if (response.status === 401) {
    clearBuildoraAuth();

    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Unable to download the BOQ. Please try again."
    );
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error("The downloaded Excel file is empty.");
  }

  return blob;
}

/* =========================================================
   MY PROFILE
========================================================= */

export function getMyProfile() {
  return apiRequest("/auth/me", {
    method: "GET",
  });
}

export function updateMyProfile(profileData) {
  return apiRequest("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(profileData),
  });
}

/* =========================================================
   PROJECT DELETE / ARCHIVE
========================================================= */

export function deleteProject(
  projectId,
  confirmationName
) {
  return apiRequest(`/projects/${projectId}`, {
    method: "DELETE",
    body: JSON.stringify({
      confirmation_name: confirmationName,
    }),
  });
}

export function archiveProject(projectId) {
  return apiRequest(
    `/projects/${projectId}/archive`,
    {
      method: "POST",
    }
  );
}

export function saveProfileDetails(formData) {
  return apiRequest("/auth/me/details", {
    method: "POST",
    body: formData,
  });
}

// =====================================================
// VALUATIONS
// =====================================================

export function getValuationBOQs(projectId) {
  return apiRequest(`/boq/projects/${projectId}`);
}

export function getProjectValuations(projectId) {
  return apiRequest(`/valuations/projects/${projectId}`);
}

export function getValuationDetails(valuationId) {
  return apiRequest(`/valuations/${valuationId}`);
}

export function createProjectValuation(projectId, payload) {
  return apiRequest(`/valuations/projects/${projectId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateValuationQuantity(
  valuationId,
  itemId,
  cumulativeQuantity
) {
  return apiRequest(
    `/valuations/${valuationId}/items/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        cumulative_quantity: cumulativeQuantity,
      }),
    }
  );
}

export function publishProjectValuation(valuationId) {
  return apiRequest(`/valuations/${valuationId}/publish`, {
    method: "POST",
  });
}

export function getValuationAccess(projectId) {
  return apiRequest(`/valuations/projects/${projectId}/access`);
}

export async function updateValuationPeriod(
  valuationId,
  payload
) {
  return apiRequest(
    `/valuations/${valuationId}/period`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function getCertificateAccess(projectId) {
  return apiRequest(
    `/certificates/projects/${projectId}/access`
  );
}

export async function getProjectCertificates(projectId) {
  return apiRequest(
    `/certificates/projects/${projectId}`
  );
}

export async function getCertificateDetails(certificateId) {
  return apiRequest(
    `/certificates/${certificateId}`
  );
}

export async function createProjectCertificate(
  projectId,
  payload
) {
  return apiRequest(
    `/certificates/projects/${projectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function updateCertificate(
  certificateId,
  payload
) {
  return apiRequest(
    `/certificates/${certificateId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export async function publishCertificate(certificateId) {
  return apiRequest(
    `/certificates/${certificateId}/publish`,
    {
      method: "POST",
    }
  );
}
export async function getPaymentAccess(projectId) {
  return apiRequest(
    `/payments/projects/${projectId}/access`
  );
}

export async function getProjectPayments(projectId) {
  return apiRequest(
    `/payments/projects/${projectId}`
  );
}

export async function getProjectPaymentSummary(projectId) {
  return apiRequest(
    `/payments/projects/${projectId}/summary`
  );
}

export async function getCertificatePaymentSummary(certificateId) {
  return apiRequest(
    `/payments/certificates/${certificateId}/summary`
  );
}

export async function recordProjectPayment(projectId, payload) {
  return apiRequest(
    `/payments/projects/${projectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getDocumentAccess(projectId) {
  return apiRequest(
    `/documents/projects/${projectId}/access`
  );
}

export async function getProjectDocuments(projectId) {
  return apiRequest(
    `/documents/projects/${projectId}`
  );
}


// Separate request helper for file uploads and downloads.
async function documentFileRequest(path, options = {}) {
  const baseUrl = (
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  const token =
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token");

  if (!token) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let message = "Unable to complete the document request.";

    try {
      const data = await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail
          .map((item) => item.msg)
          .filter(Boolean)
          .join(". ");
      }
    } catch {
      // Keep the fallback message for non-JSON errors.
    }

    if (response.status === 401) {
      message = "Your session has expired. Please sign in again.";
    }

    throw new Error(message);
  }

  return response;
}


export async function uploadProjectDocument(
  projectId,
  { title, category, description, supplierName, invoiceNumber, file }
) {
  const formData = new FormData();

  formData.append("title", title);
  formData.append("category", category);

  if (description?.trim()) {
    formData.append("description", description.trim());
  }

  if (category === "invoice") {
    formData.append("supplier_name", (supplierName ?? "").trim());
    formData.append("invoice_number", (invoiceNumber ?? "").trim());
  }

  formData.append("file", file);

  const response = await documentFileRequest(
    `/documents/projects/${projectId}`,
    {
      method: "POST",
      body: formData,
    }
  );

  return response.json();
}

export async function extractProjectInvoice(projectId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await documentFileRequest(
    `/documents/projects/${projectId}/extract-invoice`,
    {
      method: "POST",
      body: formData,
    }
  );

  return response.json();
}

export async function downloadProjectDocument(
  documentId,
  filename
) {
  const response = await documentFileRequest(
    `/documents/${documentId}/download`
  );

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename || "document";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30000);
  }
}

export async function getSiteUpdateAccess(projectId) {
  return apiRequest(
    `/site-updates/projects/${projectId}/access`
  );
}

export async function getProjectSiteUpdates(projectId) {
  return apiRequest(
    `/site-updates/projects/${projectId}`
  );
}

export async function getSiteUpdateDetails(updateId) {
  return apiRequest(
    `/site-updates/${updateId}`
  );
}

export async function createProjectSiteUpdate(
  projectId,
  payload
) {
  return apiRequest(
    `/site-updates/projects/${projectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function updateProjectSiteUpdate(
  updateId,
  payload
) {
  return apiRequest(
    `/site-updates/${updateId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export async function publishProjectSiteUpdate(updateId) {
  return apiRequest(
    `/site-updates/${updateId}/publish`,
    {
      method: "POST",
    }
  );
}

export async function getMonthlyReportAccess(projectId) {
  return apiRequest(
    `/monthly-reports/projects/${projectId}/access`
  );
}

export async function getProjectMonthlyReports(projectId) {
  return apiRequest(
    `/monthly-reports/projects/${projectId}`
  );
}

export async function getMonthlyReportDetails(reportId) {
  return apiRequest(
    `/monthly-reports/${reportId}`
  );
}

export async function createProjectMonthlyReport(
  projectId,
  payload
) {
  return apiRequest(
    `/monthly-reports/projects/${projectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function updateProjectMonthlyReport(
  reportId,
  payload
) {
  return apiRequest(
    `/monthly-reports/${reportId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export async function publishProjectMonthlyReport(reportId) {
  return apiRequest(
    `/monthly-reports/${reportId}/publish`,
    {
      method: "POST",
    }
  );
}

export async function explainMonthlyReport(reportId) {
  return apiRequest(
    `/monthly-reports/${reportId}/explain`,
    {
      method: "POST",
    }
  );
}

export async function getProjectVariations(projectId) {
  return apiRequest(`/variations/projects/${projectId}`, {
    method: "GET",
  });
}

export async function submitProjectVariation(projectId, { title, reason, costChange }) {
  return apiRequest(`/variations/projects/${projectId}`, {
    method: "POST",
    body: JSON.stringify({
      title,
      reason,
      cost_change: costChange,
    }),
  });
}

export async function decideProjectVariation(
  projectId,
  variationId,
  { status, note }
) {
  return apiRequest(
    `/variations/projects/${projectId}/${variationId}/decision`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }
  );
}

export async function getReportComments(reportId) {
  return apiRequest(
    `/report-comments/reports/${reportId}`
  );
}

export async function createReportComment(reportId, message) {
  return apiRequest(
    `/report-comments/reports/${reportId}`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
      }),
    }
  );
}

export async function getOwnerProjectOverview(projectId) {
  return apiRequest(
    `/owner-overview/projects/${projectId}`
  );
}

export async function getDocumentPreviewBlob(documentId) {
  const response = await documentFileRequest(
    `/documents/${documentId}/download`
  );

  return response.blob();
}

export function updateProjectCover(projectId, coverImage) {
  return apiRequest(`/projects/${projectId}/cover`, {
    method: "PATCH",
    body: JSON.stringify({ cover_image: coverImage }),
  });
}


export function updateProject(projectId, projectData) {
  return apiRequest(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: projectData.name,
      location: projectData.location,
      description: projectData.description,
    }),
  });
}


/* =========================================
   RESTORE ARCHIVED PROJECT
========================================= */

export function restoreProject(projectId) {
  return apiRequest(`/projects/${projectId}/restore`, {
    method: "POST",
  });
}
