const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function getAccessToken() {
  return (
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token")
  );
}

async function request(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    throw new Error(
      "Your session expired. Please sign in again."
    );
  }

  const headers = new Headers(options.headers);

  headers.set(
    "Authorization",
    `Bearer ${token}`
  );

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
      cache: "no-store",
    }
  );

  if (response.status === 401) {
  window.dispatchEvent(new Event("buildora:admin-session-expired"));

  const error = new Error("Your session expired. Please sign in again.");
  error.status = 401;
  throw error;
}
  if (!response.ok) {
    const data = await response.json().catch(() => null);

    let message =
      "Unable to complete the admin request.";

    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = data.detail
        .map((item) => item?.msg)
        .filter(Boolean)
        .join(", ");
    }

    const error = new Error(message);
    error.status = response.status;

    throw error;
  }

  return response;
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  return response.json();
}

function positiveId(value) {
  const id = String(value);

  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error("Invalid record ID.");
  }

  return id;
}


/* =========================================================
   CURRENT ACCOUNT
========================================================= */

export function getPlatformAdminAccount(options = {}) {
  return requestJson("/auth/me", {
    signal: options.signal,
  });
}

export function updatePlatformAdminProfile(fullName, photoData) {
  return requestJson("/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: fullName,
      photo_data: photoData,
    }),
  });
}

/* =========================================================
   COMPANY LIST
========================================================= */

export function getAdminCompanies({
  status = "all",
  offset = 0,
  limit = 25,
  signal,
} = {}) {
  const allowedStatuses = [
    "all",
    "unsubmitted",
    "pending",
    "approved",
    "rejected",
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid company status.");
  }

  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error("Invalid company list pagination.");
  }

  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  if (status !== "all") {
    query.set("verification_status", status);
  }

  return requestJson(
    `/platform-admin/organizations?${query.toString()}`,
    { signal }
  );
}


/* =========================================================
   COMPANY DETAILS
========================================================= */

export function getAdminCompanyDetails(
  organizationId,
  options = {}
) {
  const id = positiveId(organizationId);

  return requestJson(
    `/platform-admin/organizations/${id}`,
    { signal: options.signal }
  );
}


/* =========================================================
   VERIFICATION DOCUMENTS
========================================================= */

export function getAdminCompanyDocuments(
  organizationId,
  options = {}
) {
  const id = positiveId(organizationId);

  return requestJson(
    `/organization-documents/organizations/${id}`,
    { signal: options.signal }
  );
}

export async function downloadCompanyVerificationDocument(
  documentId,
  filename
) {
  const id = positiveId(documentId);

  const response = await request(
    `/organization-documents/${id}/download`
  );

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename || "company-document";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    30000
  );
}


/* =========================================================
   REVIEW HISTORY
========================================================= */

export function getAdminCompanyReviews(
  organizationId,
  {
    offset = 0,
    limit = 25,
    signal,
  } = {}
) {
  const id = positiveId(organizationId);

  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error("Invalid review pagination.");
  }

  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  return requestJson(
    `/platform-admin/organizations/${id}/reviews?${query.toString()}`,
    { signal }
  );
}


/* =========================================================
   APPROVE / REJECT
========================================================= */

export function reviewAdminCompany(
  organizationId,
  {
    decision,
    reason,
  }
) {
  const id = positiveId(organizationId);

  if (!["approved", "rejected"].includes(decision)) {
    throw new Error("Select approve or reject.");
  }

  const cleanReason = String(reason || "").trim();

  if (
    cleanReason.length < 5 ||
    cleanReason.length > 2000
  ) {
    throw new Error(
      "Enter a review reason containing 5 to 2000 characters."
    );
  }

  return requestJson(
    `/platform-admin/organizations/${id}/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision,
        reason: cleanReason,
      }),
    }
  );
}

export function getAdminVerificationQueue({
  status,
  search,
  offset,
  limit,
  signal,
}) {
  const params = new URLSearchParams({
    verification_status: status,
    search,
    offset: String(offset),
    limit: String(limit),
  });

  return requestJson(`/platform-admin/organizations/queue?${params}`, {
    signal,
  });
}

export function getAdminSubscriptionPlans({ signal } = {}) {
  return requestJson("/platform-admin/subscription-plans", { signal });
}

export function saveAdminSubscriptionPlan(code, plan) {
  return requestJson(
    `/platform-admin/subscription-plans/${encodeURIComponent(code)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan),
    }
  );
}

export function getAdminOrganizationSubscriptions({ signal } = {}) {
  return requestJson("/platform-admin/organization-subscriptions", { signal });
}

export function getAdminWeeklySignups({ signal } = {}) {
  return requestJson("/platform-admin/reports/weekly-signups", { signal });
}

export function getAdminDashboardSummary(options = {}) {
  return requestJson("/platform-admin/reports/dashboard-summary", {
    signal: options.signal,
  });
}