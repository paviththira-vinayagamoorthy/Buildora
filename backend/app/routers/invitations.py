import hashlib
import hmac
import logging
import secrets

from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config.settings import settings
from app.database import get_db

from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User

from app.schemas.invitation import (
    InvitationCreate,
    InvitationResponse,
    InvitationTokenRequest,
)

from app.services.email_service import (
    EmailDeliveryError,
    EmailNotConfiguredError,
    ensure_email_configured,
    send_email,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/invitations",
    tags=["Invitations"],
)

ALLOWED_ORGANIZATION_ROLES = {"qs", "staff"}
ALLOWED_PROJECT_ROLES = {"qs", "building_owner"}

INVITATION_EXPIRE_HOURS = 48
RESEND_WAIT_SECONDS = 60


# =========================================================
# MEMBERSHIP HELPERS
# =========================================================

def get_organization_membership(
    db: Session,
    organization_id: int,
    user_id: int,
):
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )


def get_project_membership(
    db: Session,
    project_id: int,
    user_id: int,
):
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )


def require_organization_admin(
    db: Session,
    organization_id: int,
    user_id: int,
):
    membership = get_organization_membership(
        db,
        organization_id,
        user_id,
    )

    if (
        membership is None
        or membership.member_role != "organization_admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Organization Admins can manage invitations.",
        )

    return membership


def lock_organization(
    db: Session,
    organization_id: int,
):
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

    return organization


def require_approved_company(organization: Organization):
    if organization.verification_status != "approved":
        raise HTTPException(
            status_code=403,
            detail="Company approval is required for invitations.",
        )


def lock_invitation(
    db: Session,
    invitation_id: int,
):
    candidate = db.get(Invitation, invitation_id)

    if candidate is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    # Use company -> invitation -> project lock order.
    organization = lock_organization(
        db,
        candidate.organization_id,
    )

    invitation = (
        db.query(Invitation)
        .filter(Invitation.id == invitation_id)
        .with_for_update()
        .populate_existing()
        .first()
    )

    if invitation is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    return organization, invitation


def get_valid_project(
    db: Session,
    organization_id: int,
    project_id: int,
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .with_for_update()
        .populate_existing()
        .first()
    )

    if (
        project is None
        or project.organization_id != organization_id
    ):
        raise HTTPException(
            status_code=409,
            detail="The invitation project is unavailable.",
        )

    if project.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Invitations require an active project.",
        )

    return project


# =========================================================
# TOKEN / EMAIL HELPERS
# =========================================================

def token_hash(value: str) -> str:
    return hashlib.sha256(
        value.encode("utf-8")
    ).hexdigest()


def build_invitation_link(
    invitation_id: int,
    token: str,
) -> str:
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

    query = urlencode(
        {
            "invitation": invitation_id,
            "token": token,
        }
    )

    return f"{base_url}/accept-invitation?{query}"


def prepare_invitation_token(
    invitation: Invitation,
) -> str:
    now = datetime.utcnow()
    token = secrets.token_urlsafe(32)

    invitation.token_hash = token_hash(token)
    invitation.expires_at = now + timedelta(
        hours=INVITATION_EXPIRE_HOURS
    )
    invitation.last_send_attempt_at = now
    invitation.sent_at = None

    return token


def require_pending(invitation: Invitation):
    if (
        invitation.status != "pending"
        or invitation.revoked_at is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="This invitation has already been processed or cancelled.",
        )


def require_valid_token(
    invitation: Invitation,
    supplied_token: str,
):
    require_pending(invitation)

    if (
        invitation.token_hash is None
        or not hmac.compare_digest(
            invitation.token_hash,
            token_hash(supplied_token),
        )
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid invitation link. "
                "Ask the Company Admin to resend it."
            ),
        )

    if (
        invitation.expires_at is None
        or invitation.expires_at <= datetime.utcnow()
    ):
        raise HTTPException(
            status_code=409,
            detail="This invitation has expired. Request a new link.",
        )


def require_invited_email(
    invitation: Invitation,
    current_user: User,
):
    if (
        invitation.email.strip().lower()
        != current_user.email.strip().lower()
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Sign in using the email address "
                "that received this invitation."
            ),
        )


def deliver_invitation(
    db: Session,
    invitation_id: int,
    expected_hash: str,
    email: str,
    link: str,
    organization_name: str,
    project_name: str | None,
    role: str,
):
    destination = (
        f"project: {project_name}"
        if project_name
        else f"organization: {organization_name}"
    )

    send_email(
        to_email=email,
        subject="You have been invited to Buildora",
        text_body=(
            f"{organization_name} has invited you to "
            f"join {destination}.\n\n"
            f"Role: {role}\n\n"
            f"Open your invitation:\n{link}\n\n"
            f"This link expires in {INVITATION_EXPIRE_HOURS} hours.\n"
            "Register or sign in using the email address "
            "that received this invitation.\n\n"
            "You will only join after accepting the invitation."
        ),
    )

    # Do not overwrite a newer resend's delivery status.
    db.query(Invitation).filter(
        Invitation.id == invitation_id,
        Invitation.token_hash == expected_hash,
        Invitation.status == "pending",
        Invitation.revoked_at.is_(None),
    ).update(
        {"sent_at": datetime.utcnow()},
        synchronize_session=False,
    )

    db.commit()


def raise_email_unavailable():
    raise HTTPException(
        status_code=503,
        detail="Email sending is not configured yet.",
    )


def raise_delivery_uncertain():
    raise HTTPException(
        status_code=503,
        detail=(
            "The invitation was saved, but email delivery "
            "could not be confirmed. Check the invitation list "
            "and resend after one minute if necessary."
        ),
    )


# =========================================================
# CREATE INVITATION AND SEND EMAIL
# =========================================================

@router.post(
    "/organizations/{organization_id}",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    organization_id: int,
    invitation_data: InvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        require_organization_admin(
            db,
            organization_id,
            current_user.id,
        )

        organization = lock_organization(
            db,
            organization_id,
        )
        require_approved_company(organization)

        ensure_email_configured()

        email = str(invitation_data.email).strip().lower()

        if email == current_user.email.strip().lower():
            raise HTTPException(
                status_code=422,
                detail="You cannot invite yourself.",
            )

        project = None
        project_role = invitation_data.project_role

        if invitation_data.project_id is not None:
            project = get_valid_project(
                db,
                organization_id,
                invitation_data.project_id,
            )

            if project_role not in ALLOWED_PROJECT_ROLES:
                raise HTTPException(
                    status_code=422,
                    detail="Select QS or Building Owner.",
                )

            member_role = (
                "qs" if project_role == "qs" else "staff"
            )

        else:
            member_role = invitation_data.member_role
            project_role = None

            if member_role not in ALLOWED_ORGANIZATION_ROLES:
                raise HTTPException(
                    status_code=422,
                    detail="Organization role must be qs or staff.",
                )

        invited_user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

        if invited_user is not None:
            if project is None:
                existing_member = get_organization_membership(
                    db,
                    organization_id,
                    invited_user.id,
                )
            else:
                existing_member = get_project_membership(
                    db,
                    project.id,
                    invited_user.id,
                )

            if existing_member is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This user is already a member.",
                )

        duplicate_query = db.query(Invitation).filter(
            Invitation.organization_id == organization_id,
            Invitation.email == email,
            Invitation.status == "pending",
            Invitation.revoked_at.is_(None),
        )

        if project is None:
            duplicate_query = duplicate_query.filter(
                Invitation.project_id.is_(None)
            )
        else:
            duplicate_query = duplicate_query.filter(
                Invitation.project_id == project.id
            )

        if duplicate_query.with_for_update().first() is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "A pending invitation already exists. "
                    "Resend it, or revoke it before creating another."
                ),
            )

        invitation = Invitation(
            organization_id=organization_id,
            invited_by=current_user.id,
            email=email,
            member_role=member_role,
            status="pending",
            project_id=project.id if project else None,
            project_role=project_role,
        )

        token = prepare_invitation_token(invitation)

        db.add(invitation)
        db.flush()

        invitation_id = invitation.id
        expected_hash = invitation.token_hash

        link = build_invitation_link(
            invitation_id,
            token,
        )

        organization_name = organization.name
        project_name = project.name if project else None
        role = project_role or member_role

        # Persist before sending. A delivery failure can be retried
        # through resend without creating another invitation.
        result = InvitationResponse.model_validate(invitation)
        db.commit()

        deliver_invitation(
            db,
            invitation_id,
            expected_hash,
            email,
            link,
            organization_name,
            project_name,
            role,
        )

        db.refresh(invitation)

        return InvitationResponse.model_validate(invitation)

    except HTTPException:
        db.rollback()
        raise

    except EmailNotConfiguredError:
        db.rollback()
        raise_email_unavailable()

    except EmailDeliveryError:
        db.rollback()
        raise_delivery_uncertain()

    except Exception:
        db.rollback()
        logger.error("Invitation creation failed.")

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to complete the invitation request. "
                "Check the invitation list before retrying."
            ),
        )


# =========================================================
# COMPANY ADMIN INVITATION LIST
# =========================================================

@router.get(
    "/organizations/{organization_id}",
    response_model=list[InvitationResponse],
)
def get_organization_invitations(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_organization_admin(
        db,
        organization_id,
        current_user.id,
    )

    return (
        db.query(Invitation)
        .filter(
            Invitation.organization_id == organization_id
        )
        .order_by(
            Invitation.created_at.desc(),
            Invitation.id.desc(),
        )
        .all()
    )


# =========================================================
# MY PENDING, UNEXPIRED INVITATIONS
# =========================================================

@router.get(
    "/mine",
    response_model=list[InvitationResponse],
)
def get_my_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Invitation)
        .join(
            Organization,
            Organization.id == Invitation.organization_id,
        )
        .filter(
            Invitation.email == current_user.email.strip().lower(),
            Invitation.status == "pending",
            Invitation.revoked_at.is_(None),
            Invitation.token_hash.is_not(None),
            Invitation.expires_at > datetime.utcnow(),
            Organization.verification_status == "approved",
        )
        .order_by(
            Invitation.created_at.desc(),
            Invitation.id.desc(),
        )
        .all()
    )


# =========================================================
# RESEND - ROTATE TOKEN AND EXPIRY
# Also supports old pending invitations without tokens.
# =========================================================

@router.post(
    "/{invitation_id}/resend",
    response_model=InvitationResponse,
)
def resend_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        organization, invitation = lock_invitation(
            db,
            invitation_id,
        )

        require_organization_admin(
            db,
            organization.id,
            current_user.id,
        )
        require_approved_company(organization)
        require_pending(invitation)
        ensure_email_configured()

        now = datetime.utcnow()

        if invitation.last_send_attempt_at is not None:
            elapsed = (
                now - invitation.last_send_attempt_at
            ).total_seconds()

            if elapsed < RESEND_WAIT_SECONDS:
                raise HTTPException(
                    status_code=429,
                    detail="Wait one minute before resending.",
                    headers={
                        "Retry-After": str(
                            max(
                                1,
                                int(RESEND_WAIT_SECONDS - elapsed) + 1,
                            )
                        )
                    },
                )

        project = None

        if invitation.project_id is not None:
            project = get_valid_project(
                db,
                organization.id,
                invitation.project_id,
            )

            if invitation.project_role not in ALLOWED_PROJECT_ROLES:
                raise HTTPException(
                    status_code=409,
                    detail="Invalid invitation role. Revoke and recreate it.",
                )

            expected_role = (
                "qs"
                if invitation.project_role == "qs"
                else "staff"
            )

            if invitation.member_role != expected_role:
                raise HTTPException(
                    status_code=409,
                    detail="Invalid membership role. Revoke and recreate it.",
                )

        elif (
            invitation.member_role not in ALLOWED_ORGANIZATION_ROLES
            or invitation.project_role is not None
        ):
            raise HTTPException(
                status_code=409,
                detail="Invalid organization invitation.",
            )

        token = prepare_invitation_token(invitation)

        link = build_invitation_link(
            invitation.id,
            token,
        )

        expected_hash = invitation.token_hash
        email = invitation.email
        organization_name = organization.name
        project_name = project.name if project else None
        role = invitation.project_role or invitation.member_role

        db.commit()

        deliver_invitation(
            db,
            invitation_id,
            expected_hash,
            email,
            link,
            organization_name,
            project_name,
            role,
        )

        db.refresh(invitation)

        return InvitationResponse.model_validate(invitation)

    except HTTPException:
        db.rollback()
        raise

    except EmailNotConfiguredError:
        db.rollback()
        raise_email_unavailable()

    except EmailDeliveryError:
        db.rollback()
        raise_delivery_uncertain()

    except Exception:
        db.rollback()
        logger.error("Invitation resend failed.")

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to complete resend. "
                "Check your inbox and invitation list."
            ),
        )


# =========================================================
# ACCEPT INVITATION
# =========================================================

@router.post(
    "/{invitation_id}/accept",
    response_model=InvitationResponse,
)
def accept_invitation(
    invitation_id: int,
    payload: InvitationTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        organization, invitation = lock_invitation(
            db,
            invitation_id,
        )

        require_invited_email(invitation, current_user)
        require_valid_token(invitation, payload.token)
        require_approved_company(organization)

        project = None

        if invitation.project_id is not None:
            project = get_valid_project(
                db,
                organization.id,
                invitation.project_id,
            )

            if invitation.project_role not in ALLOWED_PROJECT_ROLES:
                raise HTTPException(
                    status_code=409,
                    detail="The project invitation role is invalid.",
                )

            expected_role = (
                "qs"
                if invitation.project_role == "qs"
                else "staff"
            )

            if invitation.member_role != expected_role:
                raise HTTPException(
                    status_code=409,
                    detail="The invitation membership role is invalid.",
                )

            if get_project_membership(
                db,
                project.id,
                current_user.id,
            ) is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "You already belong to this project. "
                        "This invitation cannot change your role."
                    ),
                )

        elif (
            invitation.member_role not in ALLOWED_ORGANIZATION_ROLES
            or invitation.project_role is not None
        ):
            raise HTTPException(
                status_code=409,
                detail="The organization invitation is invalid.",
            )

        membership = get_organization_membership(
            db,
            organization.id,
            current_user.id,
        )

        if membership is None:
            db.add(
                OrganizationMember(
                    organization_id=organization.id,
                    user_id=current_user.id,
                    member_role=invitation.member_role,
                )
            )

        elif (
            invitation.member_role == "qs"
            and membership.member_role == "staff"
        ):
            membership.member_role = "qs"

        elif (
            invitation.member_role == "qs"
            and membership.member_role
            not in {"qs", "organization_admin"}
        ):
            raise HTTPException(
                status_code=409,
                detail="Existing organization role conflicts with this invite.",
            )

        if project is not None:
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=current_user.id,
                    project_role=invitation.project_role,
                )
            )

        invitation.status = "accepted"
        invitation.accepted_at = datetime.utcnow()

        db.flush()

        result = InvitationResponse.model_validate(invitation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Membership changed while accepting. "
                "Refresh and check your project access."
            ),
        )

    except Exception:
        db.rollback()
        logger.error("Invitation acceptance failed.")

        raise HTTPException(
            status_code=500,
            detail="Unable to accept the invitation.",
        )


# =========================================================
# DECLINE INVITATION
# =========================================================

@router.post(
    "/{invitation_id}/decline",
    response_model=InvitationResponse,
)
def decline_invitation(
    invitation_id: int,
    payload: InvitationTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        _, invitation = lock_invitation(
            db,
            invitation_id,
        )

        require_invited_email(invitation, current_user)
        require_valid_token(invitation, payload.token)

        invitation.status = "declined"

        db.flush()
        result = InvitationResponse.model_validate(invitation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to decline the invitation.",
        )


# =========================================================
# COMPANY ADMIN REVOKE
# =========================================================

@router.post(
    "/{invitation_id}/revoke",
    response_model=InvitationResponse,
)
def revoke_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        organization, invitation = lock_invitation(
            db,
            invitation_id,
        )

        require_organization_admin(
            db,
            organization.id,
            current_user.id,
        )
        require_pending(invitation)

        if invitation.project_id is not None:
            get_valid_project(
                db,
                organization.id,
                invitation.project_id,
            )

        invitation.status = "revoked"
        invitation.revoked_at = datetime.utcnow()
        invitation.token_hash = None

        db.flush()
        result = InvitationResponse.model_validate(invitation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to revoke the invitation.",
        )