import logging
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.certificate import Certificate
from app.models.payment import Payment
from app.routers.boq import (
    get_access_role,
    get_project_or_404,
)
from app.schemas.payment import (
    CertificatePaymentSummary,
    PaymentCreate,
    PaymentResponse,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)

CENT = Decimal("0.01")


def money(value):
    return Decimal(str(value or 0)).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def get_paid_amount(db, certificate_id):
    total = db.scalar(
        select(
            func.coalesce(func.sum(Payment.amount), 0)
        ).where(
            Payment.certificate_id == certificate_id
        )
    )

    return money(total)


def build_summary(certificate, paid_amount):
    net_payable = money(certificate.net_payable)
    paid_amount = money(paid_amount)

    if paid_amount >= net_payable:
        payment_status = "paid"
    elif paid_amount > 0:
        payment_status = "partially_paid"
    else:
        payment_status = "unpaid"

    return CertificatePaymentSummary(
        certificate_id=certificate.id,
        certificate_no=certificate.certificate_no,
        net_payable=net_payable,
        paid_amount=paid_amount,
        outstanding_amount=money(
            net_payable - paid_amount
        ),
        payment_status=payment_status,
    )


def same_payment_request(
    payment,
    project_id,
    payload,
    current_user,
):
    return (
        payment.project_id == project_id
        and payment.recorded_by == current_user.id
        and payment.certificate_id == payload.certificate_id
        and payment.payment_date == payload.payment_date
        and money(payment.amount) == money(payload.amount)
        and payment.payment_method == payload.payment_method
        and (payment.reference or None)
        == (payload.reference or None)
        and (payment.notes or None)
        == (payload.notes or None)
    )


@router.get("/projects/{project_id}/access")
def get_payment_access(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    return {
        "role": role,
        "can_manage": role == "qs",
    }


@router.get(
    "/projects/{project_id}",
    response_model=list[PaymentResponse],
)
def list_project_payments(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    get_access_role(db, project, current_user)

    return db.scalars(
        select(Payment)
        .join(
            Certificate,
            Certificate.id == Payment.certificate_id,
        )
        .where(
            Payment.project_id == project_id,
            Certificate.project_id == project_id,
            Certificate.status == "published",
        )
        .order_by(
            Payment.payment_date.desc(),
            Payment.id.desc(),
        )
    ).all()


@router.get(
    "/projects/{project_id}/summary",
    response_model=list[CertificatePaymentSummary],
)
def get_project_payment_summary(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    get_access_role(db, project, current_user)

    certificates = db.scalars(
        select(Certificate)
        .where(
            Certificate.project_id == project_id,
            Certificate.status == "published",
        )
        .order_by(Certificate.certificate_no.desc())
    ).all()

    paid_rows = db.execute(
        select(
            Payment.certificate_id,
            func.sum(Payment.amount),
        )
        .where(Payment.project_id == project_id)
        .group_by(Payment.certificate_id)
    ).all()

    paid_by_certificate = {
        certificate_id: money(total)
        for certificate_id, total in paid_rows
    }

    return [
        build_summary(
            certificate,
            paid_by_certificate.get(
                certificate.id,
                Decimal("0.00"),
            ),
        )
        for certificate in certificates
    ]


@router.get(
    "/certificates/{certificate_id}/summary",
    response_model=CertificatePaymentSummary,
)
def get_certificate_payment_summary(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    certificate = db.get(
        Certificate,
        certificate_id,
    )

    if certificate is None:
        raise HTTPException(
            status_code=404,
            detail="Certificate not found.",
        )

    project = get_project_or_404(
        db,
        certificate.project_id,
    )
    get_access_role(db, project, current_user)

    if certificate.status != "published":
        raise HTTPException(
            status_code=404,
            detail="Published certificate not found.",
        )

    return build_summary(
        certificate,
        get_paid_amount(db, certificate.id),
    )


@router.post(
    "/projects/{project_id}",
    response_model=PaymentResponse,
    status_code=201,
)
def record_project_payment(
    project_id: int,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(db, project_id)
        role = get_access_role(db, project, current_user)

        if role != "qs":
            raise HTTPException(
                status_code=403,
                detail="Only the assigned QS can record payments.",
            )

        # Serialize payment changes for this project.
        project_model = type(project)

        db.execute(
            select(project_model)
            .where(project_model.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalar_one()

        if project.status != "active":
            raise HTTPException(
                status_code=409,
                detail="Archived projects are read-only. Restore the project to record payments.",
            )


        request_key = str(payload.idempotency_key)

        # A locking read sees a previously committed retry
        # after waiting for the project lock.
        existing = db.scalar(
            select(Payment)
            .where(
                Payment.idempotency_key == request_key
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if existing is not None:
            if not same_payment_request(
                existing,
                project_id,
                payload,
                current_user,
            ):
                raise HTTPException(
                    status_code=409,
                    detail="This request ID was already used for different payment details.",
                )

            # Return the saved record without inserting again.
            result = PaymentResponse.model_validate(existing)
            db.commit()

            return result

        certificate = db.scalar(
            select(Certificate)
            .where(
                Certificate.id == payload.certificate_id,
                Certificate.project_id == project_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if certificate is None:
            raise HTTPException(
                status_code=404,
                detail="Certificate not found in this project.",
            )

        if certificate.status != "published":
            raise HTTPException(
                status_code=409,
                detail="Publish the certificate before recording payments.",
            )

        outstanding_amount = money(
            money(certificate.net_payable)
            - get_paid_amount(db, certificate.id)
        )

        amount = money(payload.amount)

        if outstanding_amount <= 0:
            raise HTTPException(
                status_code=409,
                detail="This certificate has no outstanding balance.",
            )

        if amount > outstanding_amount:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Payment cannot exceed the outstanding balance "
                    f"of LKR {outstanding_amount:,.2f}."
                ),
            )

        payment = Payment(
            idempotency_key=request_key,
            project_id=project_id,
            certificate_id=certificate.id,
            recorded_by=current_user.id,
            payment_date=payload.payment_date,
            amount=amount,
            payment_method=payload.payment_method,
            reference=payload.reference or None,
            notes=payload.notes or None,
        )

        db.add(payment)
        db.flush()

        result = PaymentResponse.model_validate(payment)

        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        logger.exception("Payment request ID conflict.")

        raise HTTPException(
            status_code=409,
            detail="Payment request conflict. Check payment history before trying again.",
        )

    except Exception:
        db.rollback()
        logger.exception("Unable to record payment.")

        raise HTTPException(
            status_code=500,
            detail="Unable to record the payment.",
        )