import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.monthly_report import MonthlyReport
from app.models.report_comment import ReportComment
from app.routers.boq import (
    get_access_role,
    get_project_or_404,
)
from app.schemas.report_comment import (
    ReportCommentCreate,
    ReportCommentResponse,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/report-comments",
    tags=["Report Comments"],
)


def get_published_report_access(
    db,
    report_id,
    current_user,
):
    report = db.get(MonthlyReport, report_id)

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Monthly report not found.",
        )

    project = get_project_or_404(
        db,
        report.project_id,
    )

    role = get_access_role(
        db,
        project,
        current_user,
    )

    if report.status != "published":
        raise HTTPException(
            status_code=404,
            detail="Published monthly report not found.",
        )

    return report, role


def comment_response(comment, author):
    author_name = (
        getattr(author, "name", None)
        or getattr(author, "full_name", None)
        or "Project member"
    )

    return ReportCommentResponse(
        id=comment.id,
        report_id=comment.report_id,
        created_by=comment.created_by,
        author_name=author_name,
        message=comment.message,
        created_at=comment.created_at,
    )


@router.get(
    "/reports/{report_id}",
    response_model=list[ReportCommentResponse],
)
def list_report_comments(
    report_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    get_published_report_access(
        db,
        report_id,
        current_user,
    )

    comments = db.scalars(
        select(ReportComment)
        .options(
            selectinload(ReportComment.author)
        )
        .where(
            ReportComment.report_id == report_id
        )
        .order_by(
            ReportComment.created_at.asc(),
            ReportComment.id.asc(),
        )
    ).all()

    return [
        comment_response(comment, comment.author)
        for comment in comments
    ]


@router.post(
    "/reports/{report_id}",
    response_model=ReportCommentResponse,
    status_code=201,
)
def create_report_comment(
    report_id: int,
    payload: ReportCommentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        report, role = get_published_report_access(
            db,
            report_id,
            current_user,
        )

        if role not in {"qs", "building_owner"}:
            raise HTTPException(
                status_code=403,
                detail="Only the assigned QS or Building Owner can comment.",
            )

        comment = ReportComment(
            report_id=report.id,
            created_by=current_user.id,
            message=payload.message,
        )

        db.add(comment)
        db.flush()

        result = comment_response(
            comment,
            current_user,
        )

        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to add report comment.")

        raise HTTPException(
            status_code=500,
            detail="Unable to add the comment.",
        )