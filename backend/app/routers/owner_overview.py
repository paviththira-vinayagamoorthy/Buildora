from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.boq import BOQ
from app.models.certificate import Certificate
from app.models.document import Document
from app.models.monthly_report import MonthlyReport
from app.models.payment import Payment
from app.models.site_update import SiteUpdate
from app.routers.boq import (
    get_access_role,
    get_project_or_404,
)


router = APIRouter(
    prefix="/owner-overview",
    tags=["Owner Overview"],
)


def amount_text(value):
    # Return exact monetary values as decimal strings.
    return format(
        Decimal(str(value or 0)).quantize(Decimal("0.01")),
        ".2f",
    )


@router.get("/projects/{project_id}")
def get_owner_project_overview(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)

    role = get_access_role(
        db,
        project,
        current_user,
    )

    # Only published records are included in this overview.
    latest_boq = db.scalar(
        select(BOQ)
        .where(
            BOQ.project_id == project_id,
            BOQ.status == "published",
        )
        .order_by(
            BOQ.published_at.desc(),
            BOQ.id.desc(),
        )
        .limit(1)
    )

    latest_site_update = db.scalar(
        select(SiteUpdate)
        .where(
            SiteUpdate.project_id == project_id,
            SiteUpdate.status == "published",
            SiteUpdate.update_date <= func.current_date(),
        )
        .order_by(
            SiteUpdate.update_date.desc(),
            SiteUpdate.id.desc(),
        )
        .limit(1)
    )

    latest_report = db.scalar(
        select(MonthlyReport)
        .where(
            MonthlyReport.project_id == project_id,
            MonthlyReport.status == "published",
        )
        .order_by(
            MonthlyReport.report_month.desc(),
            MonthlyReport.id.desc(),
        )
        .limit(1)
    )

    certified_amount = db.scalar(
        select(
            func.coalesce(
                func.sum(Certificate.net_payable),
                0,
            )
        ).where(
            Certificate.project_id == project_id,
            Certificate.status == "published",
        )
    )

    paid_amount = db.scalar(
        select(
            func.coalesce(
                func.sum(Payment.amount),
                0,
            )
        )
        .select_from(Payment)
        .join(
            Certificate,
            Certificate.id == Payment.certificate_id,
        )
        .where(
            Payment.project_id == project_id,
            Certificate.project_id == project_id,
            Certificate.status == "published",
        )
    )

    certified = Decimal(str(certified_amount or 0))
    paid = Decimal(str(paid_amount or 0))

    recent_documents = db.scalars(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(
            Document.created_at.desc(),
            Document.id.desc(),
        )
        .limit(5)
    ).all()

    recent_photos = db.scalars(
        select(Document)
        .where(
            Document.project_id == project_id,
            Document.category == "site_photo",
            Document.content_type.in_([
                "image/jpeg",
                "image/png",
                "image/webp",
            ]),
        )
        .order_by(
            Document.created_at.desc(),
            Document.id.desc(),
        )
        .limit(4)
    ).all()

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "location": getattr(project, "location", None),
            "status": getattr(project, "status", None),
        },
        "role": role,
        "boq": (
            {
                "id": latest_boq.id,
                "title": latest_boq.title,
                "revision": latest_boq.revision,
                "total_amount": amount_text(
                    latest_boq.total_amount
                ),
                "published_at": latest_boq.published_at,
            }
            if latest_boq is not None
            else None
        ),
        "financials": {
            "certified_net_payable": amount_text(certified),
            "recorded_payments": amount_text(paid),
            "outstanding_balance": amount_text(
                certified - paid
            ),
        },
        "latest_site_update": (
            {
                "id": latest_site_update.id,
                "title": latest_site_update.title,
                "update_date": latest_site_update.update_date,
                "progress_percentage": str(
                    latest_site_update.progress_percentage
                ),
                "work_completed": latest_site_update.work_completed,
                "issues": latest_site_update.issues,
                "next_steps": latest_site_update.next_steps,
            }
            if latest_site_update is not None
            else None
        ),
        "latest_monthly_report": (
            {
                "id": latest_report.id,
                "report_month": latest_report.report_month,
                "summary": latest_report.summary,
                "published_at": latest_report.published_at,
            }
            if latest_report is not None
            else None
        ),
        "recent_documents": [
            {
                "id": document.id,
                "title": document.title,
                "category": document.category,
                "original_filename": document.original_filename,
                "content_type": document.content_type,
                "created_at": document.created_at,
            }
            for document in recent_documents
        ],
        "recent_site_photos": [
            {
                "id": photo.id,
                "title": photo.title,
                "original_filename": photo.original_filename,
            }
            for photo in recent_photos
        ],
    }