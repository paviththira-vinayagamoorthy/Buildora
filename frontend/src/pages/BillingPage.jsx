
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getWorkspaceContext,
  getOrganizationSubscription,
  getAccessToken,
} from "../services/workspaceApi";
import "../styles/BillingPage.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const PLANS = [
  {
    code: "free_trial",
    name: "Free Trial",
    price: 0,
    period: "30 days",
    projects: "3 active projects",
    description: "Explore Buildora before choosing a plan.",
    tag: "GET STARTED",
    features: [
      "30 days free access",
      "3 active projects",
      "Explore project management",
      "No payment required",
    ],
  },
  {
    code: "subscription_1",
    name: "Starter",
    price: 12900,
    period: "6 months",
    projects: "1 active project",
    description: "Perfect for a single construction project.",
    tag: "ONE-TIME PAYMENT",
    features: [
      "1 active project",
      "6 months access",
      "One-time payment",
      "No automatic renewal",
    ],
  },
  {
    code: "subscription_2",
    name: "Professional",
    price: 3900,
    period: "month",
    projects: "3 active projects",
    description: "Ideal for growing construction teams.",
    tag: "MOST POPULAR",
    features: [
      "3 active projects",
      "Monthly subscription",
      "Project management",
      "Team collaboration",
    ],
  },
  {
    code: "subscription_3",
    name: "Business",
    price: 8900,
    period: "month",
    projects: "10 active projects",
    description: "Manage more projects with confidence.",
    tag: "GROWING TEAMS",
    features: [
      "10 active projects",
      "Monthly subscription",
      "Project management",
      "Team collaboration",
    ],
  },
  {
    code: "subscription_4",
    name: "Enterprise",
    price: 19900,
    period: "month",
    projects: "Unlimited active projects*",
    description: "Built for larger construction organizations.",
    tag: "MAXIMUM CAPACITY",
    features: [
      "Unlimited active projects*",
      "Monthly subscription",
      "Project management",
      "Team collaboration",
    ],
  },
];

const formatPrice = (price) =>
  price === 0
    ? "FREE"
    : `Rs. ${Number(price).toLocaleString("en-LK")}`;

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-LK");
};

function getPosition(index, activeIndex) {
  const difference =
    (index - activeIndex + PLANS.length) % PLANS.length;

  if (difference === 0) return "center";
  if (difference === 1) return "right-one";
  if (difference === 2) return "right-two";
  if (difference === 4) return "left-one";
  return "left-two";
}

function BillingPage() {
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState("");
  const [subscription, setSubscription] = useState(null);

  const [activeIndex, setActiveIndex] = useState(2);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activated, setActivated] = useState(false);

  const touchStartX = useRef(null);
  const verifiedSession = useRef(null);

  const request = useCallback(async (path, options = {}) => {
    const token = getAccessToken();

    if (!token) {
      throw new Error(
        "Your login session has expired. Please sign in again."
      );
    }

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
      if (response.status === 401) {
        throw new Error(
          "Your login session has expired. Please sign in again."
        );
      }

      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Request failed. Please try again."
      );
    }

    return data;
  }, []);

  const loadSubscription = useCallback(async (id) => {
    const data = await getOrganizationSubscription(id);
    setSubscription(data);
    return data;
  }, []);

  // Read organization IDs from the authenticated backend.
  useEffect(() => {
    let cancelled = false;

    async function loadOrganizations() {
      setLoading(true);

      try {
        const context = await getWorkspaceContext();
        if (cancelled) return;

        const adminOrganizations = (
          context.organizations || []
        ).filter(
          (org) => org.member_role === "organization_admin"
        );

        setOrganizations(adminOrganizations);

        if (adminOrganizations.length === 0) {
          setError(
            "No organization admin access found for this account."
          );
          setLoading(false);
          return;
        }

        const savedId = localStorage.getItem(
          "buildora_active_organization"
        );

        // Support either a plain ID or a stored JSON object.
        let preferredId = "";

        if (savedId) {
          try {
            const parsed = JSON.parse(savedId);
            preferredId = String(
              typeof parsed === "object" && parsed !== null
                ? parsed.id || parsed.organization_id || ""
                : parsed
            );
          } catch {
            preferredId = String(savedId);
          }
        }

        const selected =
          adminOrganizations.find(
            (org) => String(org.id) === preferredId
          ) || adminOrganizations[0];

        setOrganizationId(String(selected.id));
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadOrganizations();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected organization's subscription.
  // After Stripe redirects back, verify the Checkout Session.
  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;

    async function initializeBilling() {
      setLoading(true);
      setError("");
      setSubscription(null);
      setActivated(false);

      const params = new URLSearchParams(
        window.location.search
      );

      const checkoutStatus = params.get("checkout");
      const sessionId = params.get("session_id");

      const cleanCheckoutUrl = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        url.searchParams.delete("session_id");

        window.history.replaceState(
          {},
          "",
          url.pathname + url.search + url.hash
        );
      };

      try {
        if (checkoutStatus === "success") {
          if (!sessionId) {
            throw new Error(
              "Stripe Checkout session ID is missing."
            );
          }

          // Avoid duplicate verification on React re-renders.
          if (verifiedSession.current !== sessionId) {
            verifiedSession.current = sessionId;
            setVerifying(true);

            try {
              await request(
                `/billing/organizations/${Number(
                  organizationId
                )}/verify-checkout?session_id=${encodeURIComponent(
                  sessionId
                )}`,
                { method: "POST" }
              );
            } catch (err) {
              verifiedSession.current = null;
              throw err;
            }
          }

          if (cancelled) return;

          const updated = await loadSubscription(
            organizationId
          );

          if (cancelled) return;

          if (updated?.status === "active") {
            setActivated(true);
            setMessage("");
            cleanCheckoutUrl();
          } else {
            setMessage(
              "Payment verification completed. Subscription status: " +
                (updated?.status || "unknown") +
                "."
            );
          }
        } else {
          await loadSubscription(organizationId);

          if (cancelled) return;

          if (checkoutStatus === "cancel") {
            setMessage(
              "Checkout cancelled. No payment was confirmed."
            );
            cleanCheckoutUrl();
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);

          try {
            await loadSubscription(organizationId);
          } catch {
            // Preserve the original error.
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setVerifying(false);
        }
      }
    }

    initializeBilling();

    return () => {
      cancelled = true;
    };
  }, [organizationId, request, loadSubscription]);

  const startTrial = async () => {
    if (!organizationId || !subscription) return;

    setLoading(true);
    setError("");
    setMessage("");
    setActivated(false);

    try {
      await request(
        `/billing/organizations/${organizationId}/start-trial`,
        { method: "POST" }
      );

      await loadSubscription(organizationId);
      setMessage("Your 30-day free trial has started!");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkout = async (planCode) => {
    if (!organizationId || !subscription) return;

    setLoading(true);
    setError("");
    setMessage("");
    setActivated(false);

    try {
      const result = await request(
        `/billing/organizations/${organizationId}/checkout/${planCode}`,
        { method: "POST" }
      );

      if (!result.checkout_url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      // Stripe success redirects to the Billing page.
      // Remember the verified organization for that return.
      localStorage.setItem(
        "buildora_active_organization",
        String(organizationId)
      );

      window.location.assign(result.checkout_url);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const moveCarousel = (direction) => {
    setActiveIndex(
      (current) =>
        (current + direction + PLANS.length) % PLANS.length
    );
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;

    const difference =
      touchStartX.current -
      event.changedTouches[0].clientX;

    if (Math.abs(difference) > 45) {
      moveCarousel(difference > 0 ? 1 : -1);
    }

    touchStartX.current = null;
  };

  const currentPlan = PLANS.find(
    (plan) => plan.code === subscription?.plan
  );

  const isCurrentPlan = (code) =>
    subscription?.plan === code &&
    ["active", "trialing", "canceling"].includes(
      subscription?.status
    );

  return (
    <main className="bd-billing">
      <div className="bd-billing-content">
        <div style={{ marginBottom: "12px" }}>
  <button
    type="button"
    onClick={() => window.location.assign("/dashboard")}
    style={{
      background: "#4b3345",
      color: "#ffffff",
      border: "1px solid #705466",
      borderRadius: "8px",
      padding: "7px 13px",
      fontSize: "12px",
      fontWeight: 600,
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(0,0,0,0.10)",
    }}
  >
    ← Dashboard
  </button>
</div>
        <header className="bd-billing-header">
          <span className="bd-eyebrow">
            BUILDORA SUBSCRIPTIONS
          </span>

          <h1>
            Build smarter.
            <span> Grow stronger.</span>
          </h1>

          <p>
            Simple, flexible subscription plans for modern
            construction project management.
          </p>
        </header>

        {organizations.length > 1 && (
          <div className="bd-organization-picker">
            <label htmlFor="bd-organization">
              Choose organization
            </label>

            <select
              id="bd-organization"
              value={organizationId}
              disabled={loading || verifying}
              onChange={(event) => {
                setMessage("");
                setError("");
                setOrganizationId(event.target.value);
              }}
            >
              {organizations.map((org) => (
                <option key={org.id} value={String(org.id)}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {subscription && (
          <div className="bd-plan-summary">
            <span>
              Current plan:{" "}
              <strong>
                {currentPlan?.name || "Not selected"}
              </strong>
            </span>

            <span>
              Status:{" "}
              <strong>
                {subscription.status?.replaceAll("_", " ") ||
                  "Unknown"}
              </strong>
            </span>

            {(subscription.current_period_end ||
              subscription.trial_ends_at) && (
              <span>
                Valid until:{" "}
                <strong>
                  {formatDate(
                    subscription.current_period_end ||
                      subscription.trial_ends_at
                  )}
                </strong>
              </span>
            )}
          </div>
        )}

        {verifying && (
          <div className="bd-message bd-verifying" role="status">
            <span className="bd-spinner" />
            Verifying your Stripe payment...
          </div>
        )}

        {activated && (
          <div className="bd-message bd-activated" role="status">
            <span className="bd-success-icon">✓</span>
            <div>
              <strong>Subscription Activated!</strong>
              <p>
                Payment confirmed. Your Buildora plan is active.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bd-message bd-error" role="alert">
            {error}
          </div>
        )}

        {message && !activated && (
          <div className="bd-message bd-notice" role="status">
            {message}
          </div>
        )}


<section className="bd-pricing-section">

<div className="bd-grid-heading">
  <h2>Choose your plan</h2>
  <p>Simple pricing for every stage of your construction business.</p>
</div>

  <div className="bd-pricing-grid">
    {PLANS.map((plan) => {
      const isCurrent = isCurrentPlan(plan.code);
      const isPopular = plan.code === "subscription_2";

      return (
        <article
          key={plan.code}
          className={`bd-grid-card ${
            isPopular ? "bd-grid-card-featured" : ""
          }`}
        >
          <div className="bd-grid-card-top">
            <span className="bd-grid-tag">{plan.tag}</span>

            {isCurrent && (
              <span className="bd-grid-current">
                CURRENT PLAN
              </span>
            )}
          </div>

          <h3>{plan.name}</h3>

          <div className="bd-grid-price">
            <strong>{formatPrice(plan.price)}</strong>
            <span> / {plan.period}</span>
          </div>

{plan.code === "subscription_1" && (
  <p className="bd-starter-note">
    One-time payment · Equivalent to Rs. 2,150/month
  </p>
)}

          <p className="bd-grid-description">
            {plan.description}
          </p>

          <button
            type="button"
            className="bd-grid-button"
            disabled={
              loading ||
              verifying ||
              !subscription ||
              isCurrent
            }
            onClick={() => {
              if (plan.code === "free_trial") {
                startTrial();
              } else {
                checkout(plan.code);
              }
            }}
          >
            {loading || verifying
              ? "Please wait..."
              : isCurrent
              ? "Current plan"
              : plan.code === "free_trial"
              ? "Start free trial"
              : "Choose plan"}
          </button>

          <div className="bd-grid-divider" />

          <div className="bd-grid-projects">
            <span>✓</span>
            {plan.projects}
          </div>

          <ul className="bd-grid-features">
            
{plan.features
  .filter(
    (feature) =>
      feature.toLowerCase() !==
      plan.projects.toLowerCase()
  )
  .map((feature) => (

              <li key={feature}>
                <span>✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </article>
      );
    })}
  </div>
</section>

        <footer className="bd-billing-footer">
          <div className="bd-footer-features">
            <span>✓ Secure Stripe checkout</span>
            <span>✓ Transparent pricing</span>
            <span>✓ Built for construction teams</span>
          </div>

          <p>
            All prices are in Sri Lankan Rupees (LKR).
            *Unlimited projects are subject to fair-use limits.
            After subscription expiry, existing projects
            remain available in read-only mode.
          </p>
        </footer>
      </div>
    </main>
  );
}

export default BillingPage;
