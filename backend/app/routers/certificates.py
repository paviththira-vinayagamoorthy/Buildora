import logging
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.certificate import Certificate
from app.models.valuation import Valuation
from app.routers.boq import (
    get_access_role,
    get_project_or_404,
)
from app.schemas.certificate import (
    CertificateCreate,
    CertificateResponse,
    CertificateUpdate,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/certificates",
    tags=["Certificates"],
)

CENT = Decimal("0.01")
MAX_MONEY = Decimal("9999999999999.99")


def money(value):
    return Decimal(str(value)).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def require_qs(db, project, current_user):
    role = get_access_role(db, project, current_user)

    if role != "qs":
        raise HTTPException(
            status_code=403,
            detail="Only the assigned QS can manage certificates.",
        )



def lock_project(db, project):
    # Lock the project before changing certificates.
    project_model = type(project)

    locked_project = db.execute(
        select(project_model)
        .where(project_model.id == project.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one()

    if locked_project.status != "active":
        raise HTTPException(
            status_code=409,
            detail=(
                "Archived projects are read-only. "
                "Restore the project to modify certificates."
            ),
        )


def get_certificate_or_404(db, certificate_id):
    certificate = db.scalar(
        select(Certificate)
        .where(Certificate.id == certificate_id)
        .execution_options(populate_existing=True)
    )

    if certificate is None:
        raise HTTPException(
            status_code=404,
            detail="Certificate not found.",
        )

    return certificate


def require_draft(certificate):
    if certificate.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Published certificates cannot be changed.",
        )


def apply_deductions(certificate, payload):
    work_value = money(certificate.work_value)

    if work_value <= 0 or work_value > MAX_MONEY:
        raise HTTPException(
            status_code=409,
            detail="The valuation must have a valid positive work value.",
        )

    retention_percentage = money(
        payload.retention_percentage
    )
    other_deductions = money(payload.other_deductions)

    retention_amount = money(
        work_value
        * retention_percentage
        / Decimal("100")
    )

    net_payable = money(
        work_value - retention_amount - other_deductions
    )

    if net_payable < 0:
        raise HTTPException(
            status_code=422,
            detail="Total deductions cannot exceed the work value.",
        )

    certificate.retention_percentage = retention_percentage
    certificate.retention_amount = retention_amount
    certificate.other_deductions = other_deductions
    certificate.deduction_reason = (
        payload.deduction_reason or None
    )
    certificate.net_payable = net_payable
    certificate.notes = payload.notes or None
    certificate.updated_at = datetime.utcnow()


def save_certificate(db, certificate):
    # Validate the response before committing the transaction.
    db.flush()

    result = CertificateResponse.model_validate(
        certificate
    )

    db.commit()
    return result


@router.get("/projects/{project_id}/access")
def get_certificate_access(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    return {
        "role": role,
        "can_manage": role == "qs" and project.status == "active",
    }


@router.get(
    "/projects/{project_id}",
    response_model=list[CertificateResponse],
)
def list_project_certificates(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    query = (
        select(Certificate)
        .where(Certificate.project_id == project_id)
        .order_by(Certificate.certificate_no.desc())
    )

    if role == "building_owner":
        query = query.where(
            Certificate.status == "published"
        )

    return db.scalars(query).all()


@router.get(
    "/{certificate_id}",
    response_model=CertificateResponse,
)
def get_certificate(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    certificate = get_certificate_or_404(
        db,
        certificate_id,
    )

    project = get_project_or_404(
        db,
        certificate.project_id,
    )
    role = get_access_role(db, project, current_user)

    if (
        role == "building_owner"
        and certificate.status != "published"
    ):
        raise HTTPException(
            status_code=404,
            detail="Certificate not found.",
        )

    return certificate


@router.post(
    "/projects/{project_id}",
    response_model=CertificateResponse,
    status_code=201,
)
def create_project_certificate(
    project_id: int,
    payload: CertificateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(db, project_id)
        require_qs(db, project, current_user)
        lock_project(db, project)

        valuation = db.scalar(
            select(Valuation)
            .where(
                Valuation.id == payload.valuation_id,
                Valuation.project_id == project_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if valuation is None:
            raise HTTPException(
                status_code=404,
                detail="Valuation not found in this project.",
            )

        if valuation.status != "published":
            raise HTTPException(
                status_code=409,
                detail="Publish the valuation before creating a certificate.",
            )

        existing = db.scalar(
            select(Certificate.id).where(
                Certificate.valuation_id == valuation.id
            )
        )

        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="A certificate already exists for this valuation.",
            )

        latest_number = db.scalar(
            select(Certificate.certificate_no)
            .where(Certificate.project_id == project_id)
            .order_by(Certificate.certificate_no.desc())
            .limit(1)
        )

        certificate = Certificate(
            project_id=project_id,
            valuation_id=valuation.id,
            certificate_no=(latest_number or 0) + 1,
            created_by=current_user.id,
            status="draft",
            work_value=money(valuation.total_amount),
        )

        apply_deductions(certificate, payload)

        db.add(certificate)

        return save_certificate(db, certificate)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A certificate already exists. Reload the certificate list.",
        )

    except Exception:
        db.rollback()
        logger.exception("Unable to create certificate.")

        raise HTTPException(
            status_code=500,
            detail="Unable to create the certificate.",
        )


@router.put(
    "/{certificate_id}",
    response_model=CertificateResponse,
)
def update_certificate(
    certificate_id: int,
    payload: CertificateUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        certificate = get_certificate_or_404(
            db,
            certificate_id,
        )

        project = get_project_or_404(
            db,
            certificate.project_id,
        )
        require_qs(db, project, current_user)
        lock_project(db, project)

        # Reload after acquiring the project lock.
        certificate = get_certificate_or_404(
            db,
            certificate_id,
        )
        require_draft(certificate)

        apply_deductions(certificate, payload)

        return save_certificate(db, certificate)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to update certificate.")

        raise HTTPException(
            status_code=500,
            detail="Unable to update the certificate.",
        )


@router.post(
    "/{certificate_id}/publish",
    response_model=CertificateResponse,
)
def publish_certificate(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        certificate = get_certificate_or_404(
            db,
            certificate_id,
        )

        project = get_project_or_404(
            db,
            certificate.project_id,
        )
        require_qs(db, project, current_user)
        lock_project(db, project)

        certificate = get_certificate_or_404(
            db,
            certificate_id,
        )
        require_draft(certificate)

        valuation = db.scalar(
            select(Valuation)
            .where(
                Valuation.id == certificate.valuation_id,
                Valuation.project_id == certificate.project_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if valuation is None or valuation.status != "published":
            raise HTTPException(
                status_code=409,
                detail="The linked valuation must be published.",
            )

        if money(valuation.total_amount) != money(
            certificate.work_value
        ):
            raise HTTPException(
                status_code=409,
                detail="The valuation value has changed. Review the certificate.",
            )

        # Revalidate stored deductions and recalculate totals.
        deductions = CertificateUpdate(
            retention_percentage=certificate.retention_percentage,
            other_deductions=certificate.other_deductions,
            deduction_reason=certificate.deduction_reason,
            notes=certificate.notes,
        )

        apply_deductions(certificate, deductions)

        certificate.status = "published"
        certificate.published_by = current_user.id
        certificate.published_at = datetime.utcnow()

        return save_certificate(db, certificate)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to publish certificate.")

        raise HTTPException(
            status_code=500,
            detail="Unable to publish the certificate.",
        )