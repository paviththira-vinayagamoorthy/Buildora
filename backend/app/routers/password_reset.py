import hashlib
import logging
import secrets

from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.config.settings import settings
from app.database import get_db

from app.models.user import User
from app.models.password_reset_token import PasswordResetToken

from app.schemas.password_reset import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    PasswordResetMessage,
)

from app.services.email_service import (
    EmailDeliveryError,
    EmailNotConfiguredError,
    ensure_email_configured,
    send_email,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Password Reset"],
)

RESET_EXPIRE_MINUTES = 30
RESEND_WAIT_SECONDS = 60
MAX_REQUESTS_PER_HOUR = 5

REQUEST_MESSAGE = (
    "If an active account exists for this email, "
    "a password reset link will be sent. "
    "Check your inbox and spam folder."
)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def build_reset_link(token: str) -> str:
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

    query = urlencode({"token": token})

    return f"{base_url}/reset-password?{query}"


# =========================================================
# REQUEST PASSWORD RESET
# No login required.
# =========================================================

@router.post(
    "/forgot-password",
    response_model=PasswordResetMessage,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    try:
        # Configuration check is independent of account existence.
        ensure_email_configured()

        token = secrets.token_urlsafe(32)
        link = build_reset_link(token)

        user = (
            db.query(User)
            .filter(User.email == str(payload.email))
            .with_for_update()
            .populate_existing()
            .first()
        )

        # Do not reveal whether an account exists.
        if user is None or not user.is_active:
            db.rollback()

            return {"message": REQUEST_MESSAGE}

        now = datetime.utcnow()

        latest_request = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user.id
            )
            .order_by(
                PasswordResetToken.created_at.desc(),
                PasswordResetToken.id.desc(),
            )
            .with_for_update()
            .first()
        )

        if latest_request is not None:
            elapsed = (
                now - latest_request.created_at
            ).total_seconds()

            if elapsed < RESEND_WAIT_SECONDS:
                db.rollback()

                return {"message": REQUEST_MESSAGE}

        requests_this_hour = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.created_at
                >= now - timedelta(hours=1),
            )
            .count()
        )

        if requests_this_hour >= MAX_REQUESTS_PER_HOUR:
            db.rollback()

            return {"message": REQUEST_MESSAGE}

        # A new request invalidates previous unused links.
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.invalidated_at.is_(None),
        ).update(
            {"invalidated_at": now},
            synchronize_session=False,
        )

        reset_request = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            created_at=now,
            expires_at=now + timedelta(
                minutes=RESET_EXPIRE_MINUTES
            ),
        )

        db.add(reset_request)

        destination_email = user.email

        # Save before delivery so the emailed token can be checked.
        db.commit()

        try:
            send_email(
                to_email=destination_email,
                subject="Reset your Buildora password",
                text_body=(
                    "A password reset was requested "
                    "for your Buildora account.\n\n"
                    f"Open this link:\n{link}\n\n"
                    f"This link expires in "
                    f"{RESET_EXPIRE_MINUTES} minutes "
                    "and can only be used once.\n\n"
                    "If you did not request this, "
                    "ignore this email. Your password "
                    "has not been changed."
                ),
            )

        except (
            EmailDeliveryError,
            EmailNotConfiguredError,
        ):
            # Keep the same public response regardless of
            # account existence or individual delivery outcome.
            logger.error(
                "Password reset email delivery was not confirmed."
            )

        return {"message": REQUEST_MESSAGE}

    except EmailNotConfiguredError:
        db.rollback()

        raise HTTPException(
            status_code=503,
            detail=(
                "Password reset email sending "
                "is not configured yet."
            ),
        )

    except Exception:
        db.rollback()

        # Do not log the request body, token or email link.
        logger.error(
            "Password reset request failed."
        )

        # Avoid exposing account existence through error responses.
        return {"message": REQUEST_MESSAGE}


# =========================================================
# RESET PASSWORD
# Valid reset token is required.
# =========================================================

@router.post(
    "/reset-password",
    response_model=PasswordResetMessage,
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    invalid_link = HTTPException(
        status_code=400,
        detail=(
            "This password reset link is invalid, "
            "expired or already used. Request a new link."
        ),
    )

    try:
        supplied_hash = hash_reset_token(
            payload.token
        )

        candidate = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token_hash
                == supplied_hash
            )
            .first()
        )

        if candidate is None:
            raise invalid_link

        # Same lock order as forgot-password:
        # user first, reset token second.
        user = (
            db.query(User)
            .filter(User.id == candidate.user_id)
            .with_for_update()
            .populate_existing()
            .first()
        )

        record = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.id == candidate.id
            )
            .with_for_update()
            .populate_existing()
            .first()
        )

        now = datetime.utcnow()

        if (
            user is None
            or not user.is_active
            or record is None
            or record.used_at is not None
            or record.invalidated_at is not None
            or record.expires_at <= now
        ):
            raise invalid_link

        new_password_hash = hash_password(
            payload.password
        )

        # Recheck expiry after password hashing.
        changed_at = datetime.utcnow()

        if record.expires_at <= changed_at:
            raise invalid_link

        user.hashed_password = new_password_hash
        user.password_changed_at = changed_at

        record.used_at = changed_at

        # Invalidate all other unused reset links.
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != record.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.invalidated_at.is_(None),
        ).update(
            {"invalidated_at": changed_at},
            synchronize_session=False,
        )

        db.commit()

        # Never automatically sign the user in after reset.
        return {
            "message": (
                "Password updated successfully. "
                "Sign in using your new password."
            )
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.error(
            "Password reset could not be completed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to reset your password. "
                "If the connection failed, try signing in "
                "with the new password before requesting "
                "another reset link."
            ),
        )