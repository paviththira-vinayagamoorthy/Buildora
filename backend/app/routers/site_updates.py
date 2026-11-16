import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.site_update import SiteUpdate
from app.routers.boq import (
    get_access_role,
    get_project_or_404,
)
from app.schemas.site_update import (
    SiteUpdateCreate,
    SiteUpdateEdit,
    SiteUpdateResponse,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/site-updates",
    tags=["Site Updates"],
)


def require_qs(db, project, current_user):
    role = get_access_role(db, project, current_user)

    if role != "qs":
        raise HTTPException(
            status_code=403,
            detail="Only the assigned QS can manage site updates.",
        )


def lock_project(db, project):
    project_model = type(project)

    db.execute(
        select(project_model)
        .where(project_model.id == project.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one()


def get_update_or_404(db, update_id):
    record = db.scalar(
        select(SiteUpdate)
        .where(SiteUpdate.id == update_id)
        .execution_options(populate_existing=True)
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Site update not found.",
        )

    return record


def require_draft(record):
    if record.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Published site updates cannot be changed.",
        )


def apply_fields(record, payload):
    record.update_date = payload.update_date
    record.title = payload.title
    record.work_completed = payload.work_completed
    record.progress_percentage = payload.progress_percentage
    record.issues = payload.issues or None
    record.next_steps = payload.next_steps or None
    record.updated_at = datetime.utcnow()


def save_update(db, record):
    db.flush()

    result = SiteUpdateResponse.model_validate(record)

    db.commit()

    return result


@router.get("/projects/{project_id}/access")
def get_site_update_access(
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
    response_model=list[SiteUpdateResponse],
)
def list_project_site_updates(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    query = (
        select(SiteUpdate)
        .where(SiteUpdate.project_id == project_id)
        .order_by(
            SiteUpdate.update_date.desc(),
            SiteUpdate.id.desc(),
        )
    )

    if role == "building_owner":
        query = query.where(
            SiteUpdate.status == "published"
        )

    return db.scalars(query).all()


@router.get(
    "/{update_id}",
    response_model=SiteUpdateResponse,
)
def get_site_update(
    update_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = get_update_or_404(db, update_id)

    project = get_project_or_404(
        db,
        record.project_id,
    )
    role = get_access_role(db, project, current_user)

    if (
        role == "building_owner"
        and record.status != "published"
    ):
        raise HTTPException(
            status_code=404,
            detail="Site update not found.",
        )

    return record


@router.post(
    "/projects/{project_id}",
    response_model=SiteUpdateResponse,
    status_code=201,
)
def create_site_update(
    project_id: int,
    payload: SiteUpdateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(db, project_id)
        require_qs(db, project, current_user)
        lock_project(db, project)

        record = SiteUpdate(
            project_id=project_id,
            created_by=current_user.id,
            status="draft",
        )

        apply_fields(record, payload)

        db.add(record)

        return save_update(db, record)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to create site update.")

        raise HTTPException(
            status_code=500,
            detail="Unable to create the site update.",
        )


@router.put(
    "/{update_id}",
    response_model=SiteUpdateResponse,
)
def edit_site_update(
    update_id: int,
    payload: SiteUpdateEdit,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        record = get_update_or_404(db, update_id)

        project = get_project_or_404(
            db,
            record.project_id,
        )
        require_qs(db, project, current_user)
        lock_project(db, project)

        record = get_update_or_404(db, update_id)
        require_draft(record)

        apply_fields(record, payload)

        return save_update(db, record)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to edit site update.")

        raise HTTPException(
            status_code=500,
            detail="Unable to edit the site update.",
        )


@router.post(
    "/{update_id}/publish",
    response_model=SiteUpdateResponse,
)
def publish_site_update(
    update_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        record = get_update_or_404(db, update_id)

        project = get_project_or_404(
            db,
            record.project_id,
        )
        require_qs(db, project, current_user)
        lock_project(db, project)

        record = get_update_or_404(db, update_id)
        require_draft(record)

        # Validate stored fields before publication.
        validated = SiteUpdateEdit(
            update_date=record.update_date,
            title=record.title,
            work_completed=record.work_completed,
            progress_percentage=record.progress_percentage,
            issues=record.issues,
            next_steps=record.next_steps,
        )

        apply_fields(record, validated)

        record.status = "published"
        record.published_by = current_user.id
        record.published_at = datetime.utcnow()

        return save_update(db, record)

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Unable to publish site update.")

        raise HTTPException(
            status_code=500,
            detail="Unable to publish the site update.",
        )