from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy.orm import Session

from app.auth.dependencies import require_platform_admin
from app.database import get_db
from app.models.organization import Organization
from app.models.organization_verification_review import (
    OrganizationVerificationReview,
)
from app.schemas.organization import (
    OrganizationResponse,
    OrganizationDetailsResponse,
    OrganizationReview,
    OrganizationDetailsUpdate,
    OrganizationVerificationReviewResponse,
)
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, StrictBool, ValidationError

from app.models.user import User
from app.models.organization_member import OrganizationMember
from app.models.organization_email_verification import (
    OrganizationEmailVerification,
)
from app.models.organization_verification_document import (
    OrganizationVerificationDocument,
)
from app.routers.organization_documents import (
    private_document_path,
)

from app.models.project_member import ProjectMember

from sqlalchemy import case, func, or_

from decimal import Decimal
from pydantic import Field
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.models.subscription_plan import SubscriptionPlan
from app.models.organization_subscription import OrganizationSubscription

from app.models.project import Project

router = APIRouter(
    prefix="/platform-admin",
    tags=["Platform Admin"],
    dependencies=[Depends(require_platform_admin)],
)


# =========================================================
# LIST COMPANIES
# =========================================================

@router.get(
    "/organizations",
    response_model=list[OrganizationResponse],
)
def list_companies(
    verification_status: Literal[
        "unsubmitted",
        "pending",
        "approved",
        "rejected",
    ] | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Organization)

    if verification_status is not None:
        query = query.filter(
            Organization.verification_status
            == verification_status
        )

    return (
        query
        .order_by(
            Organization.created_at.desc(),
            Organization.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

@router.get("/organizations/queue")
def list_verification_queue(
    verification_status: Literal[
        "all", "unsubmitted", "pending", "approved", "rejected"
    ] = "pending",
    search: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Organization, User.email.label("creator_email"))
        .outerjoin(User, User.id == Organization.created_by)
    )

    if verification_status != "all":
        query = query.filter(
            Organization.verification_status == verification_status
        )

    term = search.strip()
    if term:
        query = query.filter(
            or_(
                Organization.name.icontains(term, autoescape=True),
                Organization.company_email.icontains(term, autoescape=True),
                User.email.icontains(term, autoescape=True),
                Organization.address.icontains(term, autoescape=True),
                Organization.registration_number.icontains(term, autoescape=True),
            )
        )

    total = query.count()
    rows = (
        query.order_by(Organization.created_at.desc(), Organization.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    company_ids = [company.id for company, _ in rows]
    document_counts = {}

    if company_ids:
        documents = OrganizationVerificationDocument
        document_counts = dict(
            db.query(documents.organization_id, func.count(documents.id))
            .filter(documents.organization_id.in_(company_ids))
            .group_by(documents.organization_id)
            .all()
        )

    return {
        "total": total,
        "items": [
            {
                "id": company.id,
                "name": company.name,
                "verification_status": company.verification_status,
                "created_at": company.created_at,
                "company_email": company.company_email,
                "creator_email": creator_email,
                "address": company.address,
                "registration_number": company.registration_number,
                "document_count": document_counts.get(company.id, 0),
            }
            for company, creator_email in rows
        ],
    }

@router.get("/users")
def list_platform_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    user_filter: Literal["all", "active", "inactive", "platform_admin"] = Query(
        default="all",
    ),
    db: Session = Depends(get_db),
):
    query = db.query(User)

    if user_filter == "active":
        query = query.filter(User.is_active.is_(True))
    elif user_filter == "inactive":
        query = query.filter(User.is_active.is_(False))
    elif user_filter == "platform_admin":
        query = query.filter(User.system_role == "platform_admin")

    users = (
        query.order_by(User.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not users:
        return []

    user_ids = [user.id for user in users]
    roles_by_user = {user_id: set() for user_id in user_ids}

    organization_roles = (
        db.query(OrganizationMember.user_id, OrganizationMember.member_role)
        .filter(OrganizationMember.user_id.in_(user_ids))
        .all()
    )

    project_roles = (
        db.query(ProjectMember.user_id, ProjectMember.project_role)
        .filter(ProjectMember.user_id.in_(user_ids))
        .all()
    )

    for user_id, role in organization_roles + project_roles:
        if role:
            roles_by_user[user_id].add(role)

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "system_role": user.system_role,
            "is_active": user.is_active,
            "membership_roles": sorted(roles_by_user[user.id]),
        }
        for user in users
    ]

class PlatformUserStatusUpdate(BaseModel):
    is_active: StrictBool


@router.patch("/users/{user_id}/status")
def update_platform_user_status(
    user_id: int,
    payload: PlatformUserStatusUpdate,
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.system_role == "platform_admin":
        raise HTTPException(
            status_code=403,
            detail="Platform Admin accounts cannot be changed here.",
        )

    user.is_active = payload.is_active
    db.commit()

    return {
        "id": user_id,
        "is_active": payload.is_active,
    }
# =========================================================
# COMPANY DETAILS
# =========================================================

@router.get(
    "/organizations/{organization_id}",
    response_model=OrganizationDetailsResponse,
)
def get_company_details(
    organization_id: int,
    db: Session = Depends(get_db),
):
    organization = db.get(
        Organization,
        organization_id,
    )

    if organization is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    return organization


# =========================================================
# COMPANY REVIEW HISTORY
# =========================================================

@router.get(
    "/organizations/{organization_id}/reviews",
    response_model=list[
        OrganizationVerificationReviewResponse
    ],
)
def get_company_review_history(
    organization_id: int,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if db.get(Organization, organization_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    return (
        db.query(OrganizationVerificationReview)
        .filter(
            OrganizationVerificationReview.organization_id
            == organization_id
        )
        .order_by(
            OrganizationVerificationReview.reviewed_at.desc(),
            OrganizationVerificationReview.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    # =========================================================
# APPROVE / REJECT COMPANY VERIFICATION
# =========================================================

@router.post(
    "/organizations/{organization_id}/review",
    response_model=OrganizationDetailsResponse,
)
def review_company_verification(
    organization_id: int,
    payload: OrganizationReview,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_platform_admin),
):
    try:
        organization = (
            db.query(Organization)
            .filter(Organization.id == organization_id)
            .with_for_update()
            .populate_existing()
            .first()
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found.",
            )

        if organization.verification_status != "pending":
            raise HTTPException(
                status_code=409,
                detail="Only pending companies can be reviewed.",
            )

        if (
            organization.submitted_at is None
            or organization.declaration_accepted_at is None
        ):
            raise HTTPException(
                status_code=409,
                detail="The company submission is incomplete.",
            )

        # Avoid reviewing a company the admin belongs to.
        own_membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.organization_id
                == organization_id,
                OrganizationMember.user_id == current_admin.id,
            )
            .first()
        )

        if (
            organization.created_by == current_admin.id
            or own_membership is not None
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "You cannot review your own organization "
                    "or an organization you belong to."
                ),
            )

        if payload.decision == "approved":
            # Recheck required details before approval.
            try:
                OrganizationDetailsUpdate.model_validate(
                    {
                        "name": organization.name,
                        "registration_number": (
                            organization.registration_number
                        ),
                        "company_email": organization.company_email,
                        "company_phone": organization.company_phone,
                        "address": organization.address,
                        "contact_person_name": (
                            organization.contact_person_name
                        ),
                        "contact_person_position": (
                            organization.contact_person_position
                        ),
                    }
                )
            except ValidationError:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Required company details are incomplete. "
                        "Reject with a reason so the company "
                        "can correct and resubmit."
                    ),
                )

            verified_email = (
                db.query(OrganizationEmailVerification)
                .filter(
                    OrganizationEmailVerification.organization_id
                    == organization_id,
                    OrganizationEmailVerification.email
                    == organization.company_email,
                    OrganizationEmailVerification.consumed_at.is_not(None),
                    OrganizationEmailVerification.invalidated_at.is_(None),
                )
                .with_for_update()
                .first()
            )

            if (
                verified_email is None
                or verified_email.email != organization.company_email
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "The current company email "
                        "has not been verified."
                    ),
                )

            document = (
                db.query(OrganizationVerificationDocument)
                .filter(
                    OrganizationVerificationDocument.organization_id
                    == organization_id,
                    OrganizationVerificationDocument.document_type
                    == "company_registration",
                )
                .order_by(
                    OrganizationVerificationDocument.created_at.desc(),
                    OrganizationVerificationDocument.id.desc(),
                )
                .with_for_update()
                .first()
            )

            if document is None:
                raise HTTPException(
                    status_code=409,
                    detail="Company registration document is missing.",
                )

            if not private_document_path(
                document.storage_key
            ).is_file():
                raise HTTPException(
                    status_code=409,
                    detail="Company registration file is unavailable.",
                )

        now = datetime.utcnow()

        review = OrganizationVerificationReview(
            organization_id=organization.id,
            reviewed_by=current_admin.id,
            decision=payload.decision,
            reason=payload.reason,
            submitted_at=organization.submitted_at,
            reviewed_at=now,
        )

        db.add(review)

        organization.verification_status = payload.decision
        organization.reviewed_by = current_admin.id
        organization.reviewed_at = now
        organization.review_reason = payload.reason

        db.flush()

        result = OrganizationDetailsResponse.model_validate(
            organization
        )

        # Decision and history are saved in one transaction.
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to save the company review.",
        )

class SubscriptionPlanInput(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"\S")
    description: str | None = Field(default=None, max_length=500)
    price: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    billing_interval: Literal["monthly", "yearly"] | None = None
    project_limit: int | None = Field(default=None, ge=1, le=4_294_967_295)
    features: list[str] = Field(default_factory=list)
    is_published: bool = False


def subscription_plan_data(plan: SubscriptionPlan):
    return {
        "code": plan.code,
        "name": plan.name,
        "description": plan.description,
        "price": str(plan.price) if plan.price is not None else None,
        "currency": plan.currency,
        "billing_interval": plan.billing_interval,
        "project_limit": plan.project_limit,
        "features": plan.features,
        "is_published": plan.is_published,
    }


@router.get("/subscription-plans")
def list_subscription_plans(db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.name).all()
    return [subscription_plan_data(plan) for plan in plans]


@router.put("/subscription-plans/{code}")
def save_subscription_plan(
    code: str,
    payload: SubscriptionPlanInput,
    db: Session = Depends(get_db),
):
    import re

    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,49}", code):
        raise HTTPException(status_code=422, detail="Invalid plan code.")

    if payload.is_published:
        if payload.price is None:
            raise HTTPException(
                status_code=422, detail="Set a price before publishing."
            )

        if payload.price > 0 and (
            payload.currency is None or payload.billing_interval is None
        ):
            raise HTTPException(
                status_code=422,
                detail="Set a currency and billing period for a paid plan.",
            )

    values = payload.model_dump()
    values["name"] = payload.name.strip()
    values["features"] = [
        feature.strip() for feature in payload.features if feature.strip()
    ]

    statement = mysql_insert(SubscriptionPlan).values(code=code, **values)
    db.execute(statement.on_duplicate_key_update(**values))
    db.commit()

    return subscription_plan_data(db.get(SubscriptionPlan, code))

@router.get("/organization-subscriptions")
def list_organization_subscriptions(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Organization.id,
            Organization.name,
            OrganizationSubscription.plan_code,
            OrganizationSubscription.status,
            SubscriptionPlan.name.label("plan_name"),
        )
        .outerjoin(
            OrganizationSubscription,
            OrganizationSubscription.organization_id == Organization.id,
        )
        .outerjoin(
            SubscriptionPlan,
            SubscriptionPlan.code == OrganizationSubscription.plan_code,
        )
        .order_by(Organization.name, Organization.id)
        .all()
    )

    return [
        {
            "organization_id": organization_id,
            "organization_name": organization_name,
            "plan": plan_name or plan_code,
            "status": subscription_status or "setup_pending",
        }
        for organization_id, organization_name, plan_code, subscription_status,
        plan_name in rows
    ]    
@router.get("/reports/weekly-signups")
def get_weekly_signups(db: Session = Depends(get_db)):
    colombo = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(colombo)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    this_monday = today - timedelta(days=today.weekday())
    first_monday = this_monday - timedelta(weeks=7)

    weeks = [first_monday + timedelta(weeks=index) for index in range(8)]
    utc_starts = [
        week.astimezone(timezone.utc).replace(tzinfo=None)
        for week in weeks
    ]
    utc_now = now.astimezone(timezone.utc).replace(tzinfo=None)

    counts = db.query(
        *[
            func.count(case(
                (
                    (User.created_at >= start)
                    & (User.created_at < end),
                    1,
                )
            ))
            for start, end in zip(utc_starts, utc_starts[1:] + [utc_now])
        ]
    ).filter(
        User.created_at >= utc_starts[0],
        User.created_at < utc_now,
    ).one()

    return [
        {"week_start": week.date().isoformat(), "count": count}
        for week, count in zip(weeks, counts)
    ]


# =========================================================
# PLATFORM ADMIN — DASHBOARD SUMMARY
# =========================================================

@router.get("/reports/dashboard-summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar() or 0

    active_users = (
        db.query(func.count(User.id))
        .filter(User.is_active.is_(True))
        .scalar() or 0
    )

    total_organizations = (
        db.query(func.count(Organization.id)).scalar() or 0
    )

    approved_organizations = (
        db.query(func.count(Organization.id))
        .filter(Organization.verification_status == "approved")
        .scalar() or 0
    )

    pending_organizations = (
        db.query(func.count(Organization.id))
        .filter(Organization.verification_status == "pending")
        .scalar() or 0
    )

    verification_status_rows = (
         db.query(
         Organization.verification_status,
         func.count(Organization.id),
    )
    .group_by(Organization.verification_status)
    .all()
)

    verification_by_status = {
     (status or "unknown"): count
    for status, count in verification_status_rows
}

    total_projects = db.query(func.count(Project.id)).scalar() or 0

    active_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == "active")
        .scalar() or 0
    )

    archived_projects = (
        db.query(func.count(Project.id))
        .filter(Project.status == "archived")
        .scalar() or 0
    )

    total_subscriptions = (
        db.query(func.count(OrganizationSubscription.organization_id))
        .scalar() or 0
    )

    subscription_status_rows = (
        db.query(
            OrganizationSubscription.status,
            func.count(OrganizationSubscription.organization_id),
        )
        .group_by(OrganizationSubscription.status)
        .all()
    )

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users,
        },
        "organizations": {
           "total": total_organizations,
           "approved": approved_organizations,
           "pending": pending_organizations,
           "by_status": verification_by_status,
        },  
      "projects": {
            "total": total_projects,
            "active": active_projects,
            "archived": archived_projects,
        },
        "subscriptions": {
            "total": total_subscriptions,
            "by_status": {
                status: count
                for status, count in subscription_status_rows
            },
        },
    }
