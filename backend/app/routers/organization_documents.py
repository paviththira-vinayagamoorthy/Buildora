import logging
import os

from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.organization_verification_document import (
    OrganizationVerificationDocument,
)
from app.schemas.organization import (
    OrganizationVerificationDocumentResponse,
)
from app.routers.documents import (
    clean_filename,
    validate_file,
    MAX_FILE_SIZE,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/organization-documents",
    tags=["Company Verification Documents"],
)

BACKEND_DIR = Path(__file__).resolve().parents[2]

UPLOAD_DIR = Path(
    os.getenv(
        "BUILDORA_ORGANIZATION_DOCUMENT_DIR",
        str(
            BACKEND_DIR
            / "private_uploads"
            / "organization_verification"
        ),
    )
).expanduser().resolve()


# =========================================================
# ACCESS CHECKS
# =========================================================

def require_company_document_access(
    db: Session,
    organization_id: int,
    current_user: User,
    allow_platform_admin: bool = True,
):
    if (
        allow_platform_admin
        and current_user.system_role == "platform_admin"
    ):
        return

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
            detail="You cannot access these company documents.",
        )


def private_document_path(storage_key: str) -> Path:
    if (
        not storage_key
        or Path(storage_key).name != storage_key
        or "\\" in storage_key
    ):
        raise HTTPException(
            status_code=404,
            detail="Document file not found.",
        )

    path = (UPLOAD_DIR / storage_key).resolve()

    if path.parent != UPLOAD_DIR:
        raise HTTPException(
            status_code=404,
            detail="Document file not found.",
        )

    return path


# =========================================================
# LIST COMPANY DOCUMENTS
# =========================================================

@router.get(
    "/organizations/{organization_id}",
    response_model=list[
        OrganizationVerificationDocumentResponse
    ],
)
def list_company_verification_documents(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_company_document_access(
        db,
        organization_id,
        current_user,
    )

    if db.get(Organization, organization_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    return (
        db.query(OrganizationVerificationDocument)
        .filter(
            OrganizationVerificationDocument.organization_id
            == organization_id
        )
        .order_by(
            OrganizationVerificationDocument.created_at.desc(),
            OrganizationVerificationDocument.id.desc(),
        )
        .all()
    )


# =========================================================
# UPLOAD COMPANY REGISTRATION DOCUMENT
# =========================================================

@router.post(
    "/organizations/{organization_id}",
    response_model=OrganizationVerificationDocumentResponse,
    status_code=201,
)
def upload_company_verification_document(
    organization_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    saved_path = None
    committed = False

    try:
        # Platform Admin review access does not grant upload access.
        require_company_document_access(
            db,
            organization_id,
            current_user,
            allow_platform_admin=False,
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

        if organization.verification_status not in (
            "unsubmitted",
            "rejected",
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Documents can only be uploaded before "
                    "submission or after rejection."
                ),
            )

        original_filename = clean_filename(file.filename)

        data = file.file.read(MAX_FILE_SIZE + 1)

        if not data:
            raise HTTPException(
                status_code=422,
                detail="The uploaded file is empty.",
            )

        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Maximum file size is 10 MB.",
            )

        content_type, extension = validate_file(
            data,
            original_filename,
        )

        UPLOAD_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )

        storage_key = f"{uuid4().hex}{extension}"
        target_path = private_document_path(storage_key)

        with target_path.open("xb") as destination:
            saved_path = target_path
            destination.write(data)

        document = OrganizationVerificationDocument(
            organization_id=organization.id,
            uploaded_by=current_user.id,
            document_type="company_registration",
            original_filename=original_filename,
            storage_key=storage_key,
            content_type=content_type,
            file_size=len(data),
        )

        db.add(document)

        # A changed submission requires a fresh declaration.
        organization.declaration_accepted_at = None

        db.flush()

        result = (
            OrganizationVerificationDocumentResponse
            .model_validate(document)
        )

        db.commit()
        committed = True

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception(
            "Unable to upload company verification document."
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to upload the company document.",
        )

    finally:
        file.file.close()

        if saved_path is not None and not committed:
            try:
                saved_path.unlink(missing_ok=True)
            except OSError:
                logger.exception(
                    "Unable to remove incomplete company upload."
                )


# =========================================================
# PRIVATE DOWNLOAD
# =========================================================

@router.get("/{document_id}/download")
def download_company_verification_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(
        OrganizationVerificationDocument,
        document_id,
    )

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    require_company_document_access(
        db,
        document.organization_id,
        current_user,
    )

    path = private_document_path(document.storage_key)

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Document file not found.",
        )

    return FileResponse(
        path=path,
        filename=document.original_filename,
        media_type=document.content_type,
        content_disposition_type="attachment",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


# =========================================================
# DELETE COMPANY VERIFICATION DOCUMENT
# =========================================================

@router.delete("/{document_id}", status_code=204)
def delete_company_verification_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock document row to coordinate concurrent changes.
    document = (
        db.query(OrganizationVerificationDocument)
        .filter(
            OrganizationVerificationDocument.id == document_id
        )
        .with_for_update()
        .first()
    )

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    # Only company admins can delete documents.
    require_company_document_access(
        db,
        document.organization_id,
        current_user,
        allow_platform_admin=False,
    )

    # Lock organization row and check current verification status.
    organization = (
        db.query(Organization)
        .filter(
            Organization.id == document.organization_id
        )
        .with_for_update()
        .populate_existing()
        .first()
    )

    if organization is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found.",
        )

    if organization.verification_status not in (
        "unsubmitted",
        "rejected",
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Documents can only be deleted before "
                "submission or after rejection."
            ),
        )

    path = private_document_path(document.storage_key)

    try:
        db.delete(document)

        # Any document change invalidates the previous declaration.
        organization.declaration_accepted_at = None

        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Unable to delete company verification document."
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to delete the company document.",
        )

    # Remove private file after database deletion succeeds.
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception(
            "Document database record deleted, "
            "but private file cleanup failed: %s",
            document_id,
        )
