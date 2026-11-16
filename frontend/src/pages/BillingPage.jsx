
import { useEffect, useState } from "react";
import "../styles/BillingPage.css";

const API_URL = "http://127.0.0.1:8000";

const PLAN_DETAILS = {
  free_trial: {
    label: "Free Trial",
    price: 0,
    period: "30 days",
    projects: "3 active projects",
    description: "Explore Buildora free for 30 days.",
  },
  subscription_1: {
    label: "Subscription 1",
    price: 12900,
    period: "6 months",
    projects: "1 active project",
    description: "One-time payment. No automatic renewal.",
  },
  subscription_2: {
    label: "Subscription 2",
    price: 3900,
    period: "month",
    projects: "3 active projects",
    description: "Monthly recurring subscription.",
  },
  subscription_3: {
    label: "Subscription 3",
    price: 8900,
    period: "month",
    projects: "10 active projects",
    description: "Monthly recurring subscription.",
  },
  subscription_4: {
    label: "Subscription 4",
    price: 19900,
    period: "month",
    projects: "Unlimited active projects*",
    description: "For larger construction organizations.",
  },
};

const formatPrice = (value) =>
  `Rs. ${Number(value).toLocaleString("en-LK")}`;

function BillingPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const token =
    localStorage.getItem("buildora_access_token") ||
    sessionStorage.getItem("buildora_access_token");

  const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Request failed."
      );
    }

    return data;
  };

  const loadSubscription = async (id) => {
    if (!id) return;

    setLoading(true);
    setError("");

    try {
      const data = await request(
        `/billing/organizations/${id}/subscription`
      );
      setSubscription(data);
    } catch (err) {
      setError(err.message);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedId = localStorage.getItem(
      "buildora_organization_id"
    );

    if (savedId) {
      setOrganizationId(savedId);
      loadSubscription(savedId);
    }
  }, []);

  const handleLoad = () => {
    if (!organizationId || Number(organizationId) < 1) {
      setError("Enter a valid organization ID.");
      return;
    }

    localStorage.setItem(
      "buildora_organization_id",
      organizationId
    );

    loadSubscription(organizationId);
  };

  const startTrial = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await request(
        `/billing/organizations/${organizationId}/start-trial`,
        { method: "POST" }
      );

      setMessage("Your 30-day free trial has started.");
      await loadSubscription(organizationId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkout = async (planCode) => {
    setLoading(true);
    setError("");

    try {
      const data = await request(
        `/billing/organizations/${organizationId}/checkout/${planCode}`,
        { method: "POST" }
      );

      if (!data.checkout_url) {
        throw new Error("Checkout URL was not returned.");
      }

      window.location.assign(data.checkout_url);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const checkoutStatus = new URLSearchParams(
    window.location.search
  ).get("checkout");

  return (
    <main className="bd-billing">
      <div className="bd-billing-header">
        <span className="bd-eyebrow">
          BUILDORA BILLING
        </span>
        <h1>Choose your subscription</h1>
        <p>
          Simple plans for construction project management.
          All prices are in Sri Lankan Rupees.
        </p>
      </div>

      <section className="bd-org-section">
        <label htmlFor="organizationId">
          Organization ID
        </label>

        <div className="bd-org-input">
          <input
            id="organizationId"
            type="number"
            min="1"
            value={organizationId}
            onChange={(e) =>
              setOrganizationId(e.target.value)
            }
            placeholder="Enter organization ID"
          />

          <button
            onClick={handleLoad}
            disabled={loading}
          >
            Load subscription
          </button>
        </div>
      </section>

      {checkoutStatus === "success" && (
        <p className="bd-notice">
          Checkout completed. Waiting for Stripe
          payment confirmation. Refresh your
          subscription status shortly.
        </p>
      )}

      {checkoutStatus === "cancel" && (
        <p className="bd-notice">
          Checkout cancelled. No plan change confirmed.
        </p>
      )}

      {error && (
        <p className="bd-error">{error}</p>
      )}

      {message && (
        <p className="bd-notice">{message}</p>
      )}

      {subscription && (
        <div className="bd-current-plan">
          <strong>Current plan:</strong>{" "}
          {subscription.plan || "Not selected"}
          <span>
            Status: {subscription.status}
          </span>
          {subscription.current_period_end && (
            <span>
              Valid until:{" "}
              {new Date(
                subscription.current_period_end
              ).toLocaleDateString("en-LK")}
            </span>
          )}
        </div>
      )}

      <div className="bd-plans">
        {Object.entries(PLAN_DETAILS).map(
          ([code, plan]) => (
            <article className="bd-plan" key={code}>
              <h2>{plan.label}</h2>

              <div className="bd-price">
                {formatPrice(plan.price)}
                <span> / {plan.period}</span>
              </div>

              <p>{plan.description}</p>

              <div className="bd-project-limit">
                {plan.projects}
              </div>

              <button
                disabled={
                  loading ||
                  !subscription ||
                  subscription.plan === code
                }
                onClick={() =>
                  code === "free_trial"
                    ? startTrial()
                    : checkout(code)
                }
              >
                {subscription?.plan === code
                  ? "Current plan"
                  : code === "free_trial"
                  ? "Start free trial"
                  : "Choose plan"}
              </button>
            </article>
          )
        )}
      </div>

      <p className="bd-footnote">
        *Unlimited projects are subject to fair-use limits.
        After subscription expiry, existing projects remain
        available in read-only mode.
      </p>
    </main>
  );
}

export default BillingPage;
