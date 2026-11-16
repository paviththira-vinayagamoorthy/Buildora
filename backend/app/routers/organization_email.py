import hashlib
import logging
import secrets

from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config.settings import settings
from app.database import get_db

from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.organization_email_verification import (
    OrganizationEmailVerification,
)

from app.schemas.organization import (
    OrganizationEmailVerify,
    OrganizationEmailVerificationResult,
)

from app.services.email_service import (
    EmailDeliveryError,
    EmailNotConfiguredError,
    ensure_email_configured,
    send_email,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/organization-email",
    tags=["Company Email Verification"],
)

RESEND_WAIT_SECONDS = 60


def hash_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def require_company_admin(
    db: Session,
    organization_id: int,
    current_user: User,
):
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id
            == organization_id,
            OrganizationMember.user_id == current_user.id,
        )
        .first()
    )

    if (
        membership is None
        or membership.member_role != "organization_admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Organization Admin access required.",
        )


def verification_link(token: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    parsed = urlsplit(base_url)

    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise EmailNotConfiguredError(
            "Frontend URL is invalid."
        )

    if (
        parsed.scheme != "https"
        and parsed.hostname not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }
    ):
        raise EmailNotConfiguredError(
            "Production frontend must use HTTPS."
        )

    return (
        f"{base_url}/verify-company-email?"
        f"{urlencode({'token': token})}"
    )


# =========================================================
# SEND / RESEND COMPANY EMAIL VERIFICATION
# =========================================================

@router.post(
    "/organizations/{organization_id}/send",
    response_model=OrganizationEmailVerificationResult,
)
def send_company_email_verification(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        require_company_admin(
            db,
            organization_id,
            current_user,
        )

        # Do not create tokens when email is not configured.
        ensure_email_configured()

        token = secrets.token_urlsafe(32)
        link = verification_link(token)

        expiry_minutes = (
            settings.COMPANY_EMAIL_TOKEN_EXPIRE_MINUTES
        )

        if not 1 <= expiry_minutes <= 60:
            raise EmailNotConfiguredError(
                "Verification expiry configuration is invalid."
            )

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

        if organization.verification_status not in {
            "unsubmitted",
            "rejected",
        }:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Email verification can only be requested "
                    "before submission or after rejection."
                ),
            )

        if not organization.company_email:
            raise HTTPException(
                status_code=422,
                detail="Save your company email address first.",
            )

        now = datetime.utcnow()

        latest_request = (
            db.query(OrganizationEmailVerification)
            .filter(
                OrganizationEmailVerification.organization_id
                == organization_id
            )
            .order_by(
                OrganizationEmailVerification.created_at.desc(),
                OrganizationEmailVerification.id.desc(),
            )
            .with_for_update()
            .first()
        )

        if latest_request is not None:
            elapsed = (
                now - latest_request.created_at
            ).total_seconds()

            if elapsed < RESEND_WAIT_SECONDS:
                retry_after = max(
                    1,
                    int(RESEND_WAIT_SECONDS - elapsed) + 1,
                )

                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Please wait before requesting "
                        "another verification email."
                    ),
                    headers={
                        "Retry-After": str(retry_after),
                    },
                )

        db.query(OrganizationEmailVerification).filter(
            OrganizationEmailVerification.organization_id
            == organization_id,
            OrganizationEmailVerification.invalidated_at.is_(None),
        ).update(
            {"invalidated_at": now},
            synchronize_session=False,
        )

        record = OrganizationEmailVerification(
            organization_id=organization_id,
            requested_by=current_user.id,
            email=organization.company_email,
            token_hash=hash_token(token),
            created_at=now,
            expires_at=now + timedelta(
                minutes=expiry_minutes
            ),
        )

        db.add(record)
        db.flush()

        # Persist the request before sending the link.
        record_id = record.id
        destination_email = record.email

        db.commit()

        send_email(
            to_email=destination_email,
            subject="Verify your Buildora company email",
            text_body=(
                "Verify the company email address for "
                "your Buildora organization.\n\n"
                f"{link}\n\n"
                f"This link expires in {expiry_minutes} minutes "
                "and can only be used once.\n\n"
                "Email verification does not mean that "
                "your company has been approved.\n\n"
                "If you did not request this, "
                "do not use the link."
            ),
        )

        # The SMTP server accepted the email.
        record = db.get(
            OrganizationEmailVerification,
            record_id,
        )
        record.sent_at = datetime.utcnow()
        db.commit()

        return {
            "message": (
                "Verification email sent. "
                "Check your company email inbox and spam folder."
            )
        }

    except HTTPException:
        db.rollback()
        raise

    except EmailNotConfiguredError:
        db.rollback()

        raise HTTPException(
            status_code=503,
            detail="Email sending is not configured yet.",
        )

    except EmailDeliveryError:
        db.rollback()

        # Preserve the token if delivery outcome is uncertain.
        # A retry creates a new link and invalidates the old one.
        raise HTTPException(
            status_code=503,
            detail=(
                "Email delivery could not be confirmed. "
                "Check your inbox. If necessary, request "
                "a new link after one minute."
            ),
        )

    except Exception:
        db.rollback()
        logger.error(
            "Company email verification request failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to complete the verification email request. "
                "Check your inbox before requesting another link."
            ),
        )


# =========================================================
# VERIFY LINK TOKEN
# Email link possession is checked here.
# This does not approve the company or create membership.
# =========================================================

@router.post(
    "/verify",
    response_model=OrganizationEmailVerificationResult,
)
def verify_company_email(
    payload: OrganizationEmailVerify,
    db: Session = Depends(get_db),
):
    invalid_link = HTTPException(
        status_code=400,
        detail=(
            "This verification link is invalid, expired "
            "or already used. Request a new link."
        ),
    )

    try:
        token_hash = hash_token(payload.token)

        candidate = (
            db.query(OrganizationEmailVerification)
            .filter(
                OrganizationEmailVerification.token_hash
                == token_hash
            )
            .first()
        )

        if candidate is None:
            raise invalid_link

        # Use the same lock order as send/resend.
        organization = (
            db.query(Organization)
            .filter(
                Organization.id == candidate.organization_id
            )
            .with_for_update()
            .populate_existing()
            .first()
        )

        record = (
            db.query(OrganizationEmailVerification)
            .filter(
                OrganizationEmailVerification.id
                == candidate.id
            )
            .with_for_update()
            .populate_existing()
            .first()
        )

        now = datetime.utcnow()

        if (
            organization is None
            or record is None
            or record.invalidated_at is not None
            or record.consumed_at is not None
            or record.expires_at <= now
            or record.email != organization.company_email
            or organization.verification_status not in {
                "unsubmitted",
                "rejected",
            }
        ):
            raise invalid_link

        record.consumed_at = now

        db.commit()

        return {
            "message": (
                "Company email verified successfully. "
                "Company approval still requires Platform Admin review."
            )
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.error(
            "Company email token verification failed."
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to verify the company email.",
        )

        # =========================================================
# CURRENT COMPANY EMAIL VERIFICATION STATUS
# =========================================================

@router.get(
    "/organizations/{organization_id}/status",
)
def get_company_email_verification_status(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_company_admin(
        db,
        organization_id,
        current_user,
    )

    organization = db.get(
        Organization,
        organization_id,
    )

    if organization is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    verified_at = None

    if organization.company_email:
        records = (
            db.query(OrganizationEmailVerification)
            .filter(
                OrganizationEmailVerification.organization_id
                == organization_id,
                OrganizationEmailVerification.email
                == organization.company_email,
                OrganizationEmailVerification.consumed_at.is_not(None),
                OrganizationEmailVerification.invalidated_at.is_(None),
            )
            .order_by(
                OrganizationEmailVerification.consumed_at.desc(),
                OrganizationEmailVerification.id.desc(),
            )
            .all()
        )

        # Exact comparison also protects against
        # case-insensitive database matching.
        for record in records:
            if record.email == organization.company_email:
                verified_at = record.consumed_at
                break

    return {
        "organization_id": organization.id,
        "company_email": organization.company_email,
        "verified": verified_at is not None,
        "verified_at": verified_at,
    }