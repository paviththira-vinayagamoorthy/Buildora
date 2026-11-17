
import os
from datetime import datetime, timedelta, timezone

import stripe
from dateutil.relativedelta import relativedelta
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config.settings import settings
from app.database import get_db
from app.models.organization_member import OrganizationMember
from app.models.organization_subscription import OrganizationSubscription

router = APIRouter(prefix="/billing", tags=["Billing"])


# ============================================================
# BUILDORA SUBSCRIPTION PLANS
# ============================================================

PLANS = {
    "free_trial": {
        "name": "Free Trial",
        "price": 0,
        "months": 0,
        "project_limit": 3,
        "mode": "trial",
    },
    "subscription_1": {
        "name": "Subscription 1",
        "price": 12900,
        "months": 6,
        "project_limit": 1,
        "mode": "payment",
    },
    "subscription_2": {
        "name": "Subscription 2",
        "price": 3900,
        "months": 1,
        "project_limit": 3,
        "mode": "subscription",
    },
    "subscription_3": {
        "name": "Subscription 3",
        "price": 8900,
        "months": 1,
        "project_limit": 10,
        "mode": "subscription",
    },
    "subscription_4": {
        "name": "Subscription 4",
        "price": 19900,
        "months": 1,
        "project_limit": None,
        "mode": "subscription",
    },
}


# ============================================================
# HELPERS
# ============================================================

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def from_timestamp(value):
    if value is None:
        return None

    return datetime.fromtimestamp(
        int(value),
        timezone.utc,
    ).replace(tzinfo=None)


def stripe_config():
    key = settings.stripe_secret_key

    if hasattr(key, "get_secret_value"):
        key = key.get_secret_value()

    if not key or not key.startswith("sk_test_"):
        raise HTTPException(
            status_code=503,
            detail="Stripe sandbox key is not configured.",
        )

    stripe.api_key = key


def get_webhook_secret():
    secret = settings.stripe_webhook_secret

    if hasattr(secret, "get_secret_value"):
        secret = secret.get_secret_value()

    return secret


def require_admin(db, organization_id, user_id):
    membership = db.scalar(
        select(OrganizationMember.id).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.member_role == "organization_admin",
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=403,
            detail="Organization Admin required.",
        )


def subscription_state(sub):
    if sub is None:
        return "setup_pending"

    now = utcnow()

    if sub.status == "trialing":
        if sub.trial_ends_at and sub.trial_ends_at > now:
            return "trialing"
        return "expired"

    if sub.status == "active":
        if sub.current_period_end and sub.current_period_end > now:
            return "active"
        return "expired"

    if sub.status == "canceling":
        if sub.current_period_end and sub.current_period_end > now:
            return "canceling"
        return "expired"

    if sub.status in (
        "past_due",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
    ):
        return sub.status

    return sub.status or "setup_pending"


def can_write(sub):
    return subscription_state(sub) in (
        "active",
        "trialing",
        "canceling",
    )


def get_project_limit(sub):
    if not can_write(sub):
        return 0

    plan = PLANS.get(sub.plan_code)

    if plan is None:
        return 0

    return plan["project_limit"]


def get_or_create_subscription(db, organization_id):
    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    if sub is None:
        sub = OrganizationSubscription(
            organization_id=organization_id,
            plan_code="free_trial",
            status="setup_pending",
        )
        db.add(sub)
        db.flush()

    return sub


def get_subscription_period(stripe_sub):
    start = stripe_sub.get("current_period_start")
    end = stripe_sub.get("current_period_end")

    # Some Stripe API versions expose billing periods
    # on subscription items.
    items = (stripe_sub.get("items") or {}).get("data") or []

    if items:
        item = items[0]

        start = (
            item.get("current_period_start")
            or start
        )

        end = (
            item.get("current_period_end")
            or end
        )

    return from_timestamp(start), from_timestamp(end)


def find_subscription_by_stripe_id(db, stripe_id):
    if not stripe_id:
        return None

    return db.scalar(
        select(OrganizationSubscription).where(
            OrganizationSubscription.stripe_subscription_id
            == stripe_id
        )
    )


def sync_stripe_subscription(db, stripe_sub):
    stripe_sub = stripe_sub.to_dict()
    stripe_id = stripe_sub.get("id")

    if not stripe_id:
        raise ValueError("Missing Stripe subscription ID.")

    metadata = stripe_sub.get("metadata") or {}
    org_id_str = metadata.get("organization_id")
    plan_code = metadata.get("plan_code")

    existing = find_subscription_by_stripe_id(
        db,
        stripe_id,
    )

    if existing:
        sub = existing

        if org_id_str and int(org_id_str) != sub.organization_id:
            raise ValueError("Organization mismatch.")

        if not plan_code:
            plan_code = sub.plan_code

    else:
        if not org_id_str:
            raise ValueError(
                "Subscription organization metadata missing."
            )

        organization_id = int(org_id_str)

        sub = get_or_create_subscription(
            db,
            organization_id,
        )

        if (
            sub.stripe_subscription_id
            and sub.stripe_subscription_id != stripe_id
        ):
            raise ValueError(
                "Another Stripe subscription is already linked."
            )

    if (
        plan_code not in PLANS
        or PLANS[plan_code]["mode"] != "subscription"
    ):
        raise ValueError("Invalid recurring plan.")

    stripe_status = stripe_sub.get("status") or "incomplete"

    start, end = get_subscription_period(stripe_sub)

    sub.plan_code = plan_code
    sub.stripe_subscription_id = stripe_id
    sub.stripe_customer_id = stripe_sub.get("customer")

    if stripe_status == "canceled":
        sub.status = "expired"

    elif (
        stripe_status == "active"
        and stripe_sub.get("cancel_at_period_end")
    ):
        sub.status = "canceling"

    else:
        sub.status = stripe_status

    if start:
        sub.current_period_start = start

    if end:
        sub.current_period_end = end

    return sub


def retrieve_and_sync_subscription(db, stripe_id):
    stripe_config()

    stripe_sub = stripe.Subscription.retrieve(
        stripe_id,
        expand=["items"],
    )

    return sync_stripe_subscription(
        db,
        stripe_sub,
    )


def process_checkout_completed(db, checkout):
    if checkout.get("payment_status") != "paid":
        return

    metadata = checkout.get("metadata") or {}

    org_id_str = metadata.get("organization_id")
    plan_code = metadata.get("plan_code")

    if not org_id_str or plan_code not in PLANS:
        raise ValueError("Invalid checkout metadata.")

    if plan_code == "free_trial":
        raise ValueError("Trial cannot use Stripe Checkout.")

    organization_id = int(org_id_str)

    sub = get_or_create_subscription(
        db,
        organization_id,
    )

    customer_id = checkout.get("customer")
    checkout_id = checkout.get("id")

    if PLANS[plan_code]["mode"] == "payment":
        # Prevent an older completed checkout from replacing
        # a different active paid subscription.
        if (
            sub.stripe_subscription_id
            and subscription_state(sub) in (
                "active",
                "canceling",
                "past_due",
            )
        ):
            raise ValueError(
                "An existing recurring subscription is linked."
            )

        if sub.stripe_checkout_session_id == checkout_id:
            return

        now = utcnow()

        sub.plan_code = plan_code
        sub.status = "active"
        sub.current_period_start = now
        sub.current_period_end = (
            now + relativedelta(months=6)
        )
        sub.stripe_customer_id = customer_id
        sub.stripe_checkout_session_id = checkout_id
        sub.stripe_subscription_id = None

    else:
        stripe_id = checkout.get("subscription")

        if not stripe_id:
            raise ValueError(
                "Recurring checkout has no subscription."
            )

        if (
            sub.stripe_subscription_id
            and sub.stripe_subscription_id != stripe_id
        ):
            raise ValueError(
                "Stripe subscription mismatch."
            )

        # Fetch current state rather than trusting webhook
        # delivery order.
        synced = retrieve_and_sync_subscription(
            db,
            stripe_id,
        )

        if synced.organization_id != organization_id:
            raise ValueError("Organization mismatch.")

        synced.stripe_checkout_session_id = checkout_id


def process_invoice_event(db, invoice):
    stripe_id = invoice.get("subscription")

    # Newer invoice formats may expose the subscription
    # under parent.subscription_details.
    if not stripe_id:
        parent = invoice.get("parent") or {}
        details = parent.get("subscription_details") or {}
        stripe_id = details.get("subscription")

    if isinstance(stripe_id, dict):
        stripe_id = stripe_id.get("id")

    if not stripe_id:
        return

    # Synchronize the actual current subscription state.
    # This also handles delayed or out-of-order invoice events.
    retrieve_and_sync_subscription(
        db,
        stripe_id,
    )


# ============================================================
# GET PLANS
# ============================================================

@router.get("/plans")
def get_plans():
    return [
        {
            "code": code,
            **details,
            "currency": "LKR",
        }
        for code, details in PLANS.items()
    ]


# ============================================================
# GET ORGANIZATION SUBSCRIPTION
# ============================================================

@router.get(
    "/organizations/{organization_id}/subscription"
)
def get_subscription(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(
        db,
        organization_id,
        current_user.id,
    )

    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    return {
        "organization_id": organization_id,
        "plan": sub.plan_code if sub else None,
        "status": subscription_state(sub),
        "project_limit": get_project_limit(sub),
        "trial_ends_at": (
            sub.trial_ends_at.isoformat()
            if sub and sub.trial_ends_at
            else None
        ),
        "current_period_end": (
            sub.current_period_end.isoformat()
            if sub and sub.current_period_end
            else None
        ),
        "available_plans": get_plans(),
    }


# ============================================================
# START 30-DAY FREE TRIAL
# ============================================================

@router.post(
    "/organizations/{organization_id}/start-trial"
)
def start_trial(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(
        db,
        organization_id,
        current_user.id,
    )

    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    if sub is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This organization has already used "
                "or configured a subscription."
            ),
        )

    now = utcnow()

    sub = OrganizationSubscription(
        organization_id=organization_id,
        plan_code="free_trial",
        status="trialing",
        trial_started_at=now,
        trial_ends_at=now + timedelta(days=30),
    )

    db.add(sub)
    db.commit()

    return {
        "message": "30-day free trial started.",
        "status": "trialing",
        "trial_ends_at": sub.trial_ends_at.isoformat(),
    }


# ============================================================
# CREATE STRIPE CHECKOUT
# ============================================================

@router.post(
    "/organizations/{organization_id}/checkout/{plan_code}"
)
def create_checkout(
    organization_id: int,
    plan_code: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(
        db,
        organization_id,
        current_user.id,
    )

    plan = PLANS.get(plan_code)

    if not plan or plan_code == "free_trial":
        raise HTTPException(
            status_code=400,
            detail="Invalid paid subscription plan.",
        )

    stripe_config()

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173",
    ).rstrip("/")

    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    if sub and sub.stripe_subscription_id:
        if subscription_state(sub) in (
            "active",
            "past_due",
            "canceling",
            "unpaid",
            "incomplete",
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Manage your existing recurring "
                    "subscription before buying another."
                ),
            )

    customer_id = (
        sub.stripe_customer_id
        if sub
        else None
    )

    price_data = {
        "currency": "lkr",
        "unit_amount": int(plan["price"] * 100),
        "product_data": {
            "name": f"Buildora {plan['name']}",
        },
    }

    if plan["mode"] == "subscription":
        price_data["recurring"] = {
            "interval": "month",
        }

    params = {
        "mode": plan["mode"],
        "line_items": [
            {
                "price_data": price_data,
                "quantity": 1,
            }
        ],
        "success_url": (
            f"{frontend_url}/billing"
            "?checkout=success"
            "&session_id={CHECKOUT_SESSION_ID}"
        ),
        "cancel_url": (
            f"{frontend_url}/billing"
            "?checkout=cancel"
        ),
        "client_reference_id": str(organization_id),
        "metadata": {
            "organization_id": str(organization_id),
            "plan_code": plan_code,
        },
    }

    if customer_id:
        params["customer"] = customer_id

    if plan["mode"] == "subscription":
        params["subscription_data"] = {
            "metadata": {
                "organization_id": str(organization_id),
                "plan_code": plan_code,
            }
        }

    try:
        checkout = stripe.checkout.Session.create(
            **params
        )

    except stripe.error.StripeError as exc:
        print(
            "Stripe checkout error:",
            str(exc),
        )

        raise HTTPException(
            status_code=502,
            detail="Unable to create Stripe Checkout.",
        )

    return {
        "checkout_url": checkout.url,
        "session_id": checkout.id,
    }


# ============================================================
# STRIPE WEBHOOK
# ============================================================

# ============================================================
# VERIFY STRIPE CHECKOUT AFTER FRONTEND REDIRECT
# ============================================================

@router.post(
    "/organizations/{organization_id}/verify-checkout"
)
def verify_checkout(
    organization_id: int,
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(db, organization_id, current_user.id)
    stripe_config()

    if not session_id.startswith("cs_"):
        raise HTTPException(
            status_code=400,
            detail="Invalid Checkout session ID.",
        )

    try:
        checkout = stripe.checkout.Session.retrieve(session_id)
        checkout = checkout.to_dict()
    except stripe.error.StripeError:
        raise HTTPException(
            status_code=400,
            detail="Unable to verify Stripe Checkout session.",
        )

    metadata = checkout.get("metadata") or {}

    if (
        checkout.get("client_reference_id") != str(organization_id)
        or metadata.get("organization_id") != str(organization_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Checkout does not belong to this organization.",
        )

    plan_code = metadata.get("plan_code")
    plan = PLANS.get(plan_code)

    if not plan or plan_code == "free_trial":
        raise HTTPException(
            status_code=400,
            detail="Invalid Checkout plan.",
        )

    if checkout.get("mode") != plan["mode"]:
        raise HTTPException(
            status_code=400,
            detail="Checkout mode does not match plan.",
        )

    if (
        checkout.get("status") != "complete"
        or checkout.get("payment_status") != "paid"
    ):
        return {
            "verified": False,
            "status": checkout.get("status"),
            "payment_status": checkout.get("payment_status"),
            "message": "Payment is not confirmed yet.",
        }

    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    if (
        sub
        and sub.stripe_checkout_session_id
        and sub.stripe_checkout_session_id != session_id
        and subscription_state(sub) in ("active", "canceling")
    ):
        raise HTTPException(
            status_code=409,
            detail="Another paid checkout is already active.",
        )

    try:
        process_checkout_completed(db, checkout)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        )
    except Exception:
        db.rollback()

        import traceback
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Subscription verification failed.",
        )

    sub = db.get(
        OrganizationSubscription,
        organization_id,
    )

    return {
        "verified": True,
        "organization_id": organization_id,
        "plan": sub.plan_code if sub else None,
        "status": subscription_state(sub),
        "payment_status": checkout.get("payment_status"),
    }

@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    secret = get_webhook_secret()

    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Stripe webhook is not configured.",
        )

    payload = await request.body()

    signature = request.headers.get(
        "stripe-signature",
        "",
    )

    try:
        event = stripe.Webhook.construct_event(
            payload,
            signature,
            secret,
        )

    except (
        ValueError,
        stripe.error.SignatureVerificationError,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid Stripe webhook signature.",
        )

    event_id = event["id"]
    event_type = event["type"]
    obj = event["data"]["object"].to_dict()

    already_processed = db.execute(
        text(
            "SELECT event_id "
            "FROM stripe_webhook_events "
            "WHERE event_id = :event_id"
        ),
        {"event_id": event_id},
    ).first()

    if already_processed:
        return {
            "received": True,
            "duplicate": True,
        }

    try:
        if event_type == "checkout.session.completed":
            process_checkout_completed(
                db,
                obj,
            )

        elif event_type in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        ):
            stripe_id = obj.get("id")

            if stripe_id:
                if event_type == "customer.subscription.deleted":
                    sub = find_subscription_by_stripe_id(
                        db,
                        stripe_id,
                    )

                    if sub is not None:
                        sub.status = "expired"
                        sub.current_period_end = utcnow()

                else:
                    retrieve_and_sync_subscription(
                        db,
                        stripe_id,
                    )
                    
        elif event_type in (
            "invoice.paid",
            "invoice.payment_failed",
        ):
            process_invoice_event(
                db,
                obj,
            )

        db.execute(
            text(
                "INSERT INTO stripe_webhook_events "
                "(event_id, processed_at) "
                "VALUES (:event_id, :processed_at)"
            ),
            {
                "event_id": event_id,
                "processed_at": utcnow(),
            },
        )

        db.commit()

    except IntegrityError:
        db.rollback()

        # A concurrent delivery may already have
        # recorded the same event.
        duplicate = db.execute(
            text(
                "SELECT event_id "
                "FROM stripe_webhook_events "
                "WHERE event_id = :event_id"
            ),
            {"event_id": event_id},
        ).first()

        if duplicate:
            return {
                "received": True,
                "duplicate": True,
            }

        raise HTTPException(
            status_code=500,
            detail="Webhook database error.",
        )

    except Exception as exc:
        db.rollback()

        print(
            "Stripe webhook processing error:",
            str(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Webhook processing failed. "
                "Stripe may retry."
            ),
        )

    return {
        "received": True,
        "event_type": event_type,
    }
