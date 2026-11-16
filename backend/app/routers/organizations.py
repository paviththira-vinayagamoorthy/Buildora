from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember

from app.schemas.organization import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationMemberResponse,
    OrganizationDetailsUpdate,
    OrganizationDetailsResponse,
    OrganizationVerificationSubmit,
)
from datetime import datetime

from pydantic import ValidationError

from app.models.organization_email_verification import (
    OrganizationEmailVerification,
)
from app.models.organization_verification_document import (
    OrganizationVerificationDocument,
)
from app.routers.organization_documents import (
    private_document_path,
)

router = APIRouter(
    prefix="/organizations",
    tags=["Organizations"],
)


# =========================================================
# HELPER - GET MEMBERSHIP
# =========================================================
def get_membership(
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


# =========================================================
# CREATE ORGANIZATION
# =========================================================
@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_organization(
    organization_data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = organization_data.name.strip()

    if len(name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name is required.",
        )

    organization = Organization(
        name=name,
        created_by=current_user.id,
    )

    try:
        db.add(organization)

        # Get organization ID before creating membership
        db.flush()

        admin_member = OrganizationMember(
            organization_id=organization.id,
            user_id=current_user.id,
            member_role="organization_admin",
        )

        db.add(admin_member)

        db.commit()
        db.refresh(organization)

        return organization

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create organization.",
        )


# =========================================================
# GET MY ORGANIZATIONS
# =========================================================
@router.get(
    "/",
    response_model=list[OrganizationResponse],
)
def get_my_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organizations = (
        db.query(Organization)
        .join(
            OrganizationMember,
            OrganizationMember.organization_id == Organization.id,
        )
        .filter(
            OrganizationMember.user_id == current_user.id
        )
        .order_by(Organization.created_at.desc())
        .all()
    )

    return organizations


# =========================================================
# GET ONE ORGANIZATION
# =========================================================
@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
)
def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = get_membership(
        db,
        organization_id,
        current_user.id,
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization.",
        )

    organization = (
        db.query(Organization)
        .filter(Organization.id == organization_id)
        .first()
    )

    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    return organization


# =========================================================
# GET ORGANIZATION MEMBERS
# =========================================================
@router.get(
    "/{organization_id}/members",
    response_model=list[OrganizationMemberResponse],
)
def get_organization_members(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_membership = get_membership(
        db,
        organization_id,
        current_user.id,
    )

    if not current_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization.",
        )

    members = (
        db.query(
            OrganizationMember,
            User,
        )
        .join(
            User,
            User.id == OrganizationMember.user_id,
        )
        .filter(
            OrganizationMember.organization_id
            == organization_id
        )
        .order_by(OrganizationMember.joined_at.asc())
        .all()
    )

    return [
        {
            "id": membership.id,
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "member_role": membership.member_role,
            "joined_at": membership.joined_at,
        }
        for membership, user in members
    ]


# =========================================================
# GET MY ROLE IN ORGANIZATION
# =========================================================
@router.get("/{organization_id}/my-membership")
def get_my_membership(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = get_membership(
        db,
        organization_id,
        current_user.id,
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this organization.",
        )

    return {
        "organization_id": organization_id,
        "user_id": current_user.id,
        "member_role": membership.member_role,
        "joined_at": membership.joined_at,
    }

    # =========================================================
# HELPER - REQUIRE COMPANY ADMIN
# =========================================================

def require_company_admin(
    db: Session,
    organization_id: int,
    current_user: User,
):
    membership = get_membership(
        db,
        organization_id,
        current_user.id,
    )

    if (
        membership is None
        or membership.member_role != "organization_admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization Admin access required.",
        )

    return membership


# =========================================================
# GET COMPANY VERIFICATION DETAILS
# =========================================================

@router.get(
    "/{organization_id}/verification-details",
    response_model=OrganizationDetailsResponse,
)
def get_organization_verification_details(
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    return organization


# =========================================================
# SAVE COMPANY VERIFICATION DETAILS
# Does not submit or approve the company.
# =========================================================

@router.patch(
    "/{organization_id}/verification-details",
    response_model=OrganizationDetailsResponse,
)
def update_organization_verification_details(
    organization_id: int,
    payload: OrganizationDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_company_admin(
        db,
        organization_id,
        current_user,
    )

    try:
        organization = (
            db.query(Organization)
            .filter(
                Organization.id == organization_id
            )
            .with_for_update()
            .populate_existing()
            .first()
        )

        if organization is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        if organization.verification_status == "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Your company is under review. "
                    "Verification details cannot be changed "
                    "while the review is pending."
                ),
            )

        if organization.verification_status == "approved":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Approved verification details cannot "
                    "be changed through this form."
                ),
            )

        if organization.verification_status not in (
            "unsubmitted",
            "rejected",
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Company verification status is invalid.",
            )

                    # Changing the email invalidates all previous links
        # and previously completed email verification.
        if organization.company_email != str(payload.company_email):
            db.query(OrganizationEmailVerification).filter(
                OrganizationEmailVerification.organization_id
                == organization_id,
                OrganizationEmailVerification.invalidated_at.is_(None),
            ).update(
                {"invalidated_at": datetime.utcnow()},
                synchronize_session=False,
            )

        organization.name = payload.name
        organization.registration_number = (
            payload.registration_number
        )
        organization.company_email = str(
            payload.company_email
        )
        organization.company_phone = payload.company_phone
        organization.address = payload.address

        organization.contact_person_name = (
            payload.contact_person_name
        )
        organization.contact_person_position = (
            payload.contact_person_position
        )

        # A declaration must be accepted again on submission.
        organization.declaration_accepted_at = None

        # Keep a rejected status/reason visible until resubmission.
        # Review history will be recorded separately.
        db.flush()

        result = OrganizationDetailsResponse.model_validate(
            organization
        )

        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save company verification details.",
        )

        # =========================================================
# SUBMIT COMPANY FOR PLATFORM ADMIN REVIEW
# =========================================================

@router.post(
    "/{organization_id}/submit-verification",
    response_model=OrganizationDetailsResponse,
)
def submit_organization_verification(
    organization_id: int,
    payload: OrganizationVerificationSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_company_admin(
        db,
        organization_id,
        current_user,
    )

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

        if organization.verification_status not in {
            "unsubmitted",
            "rejected",
        }:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Only an unsubmitted or rejected company "
                    "can be submitted for review."
                ),
            )

        # Validate all required saved company details.
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
                status_code=422,
                detail=(
                    "Complete and save all required "
                    "company details before submission."
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

        if verified_email is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Verify your current company email "
                    "before submitting for review."
                ),
            )

        registration_document = (
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

        if registration_document is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Upload your company registration "
                    "certificate before submission."
                ),
            )

        document_path = private_document_path(
            registration_document.storage_key
        )

        if not document_path.is_file():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Your registration document file is unavailable. "
                    "Upload the document again before submission."
                ),
            )

        # Schema requires declaration_accepted=True.
        now = datetime.utcnow()

        organization.declaration_accepted_at = now
        organization.submitted_at = now
        organization.verification_status = "pending"

        # Previous decisions remain in the review history table.
        organization.reviewed_by = None
        organization.reviewed_at = None
        organization.review_reason = None

        db.flush()

        result = OrganizationDetailsResponse.model_validate(
            organization
        )

        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to submit your company for review.",
        )