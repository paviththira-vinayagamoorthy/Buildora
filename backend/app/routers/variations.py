from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.variation import Variation
from app.routers.boq import get_access_role, get_project_or_404


router = APIRouter(prefix="/variations", tags=["Variations"])


class VariationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=255)
    reason: str = Field(min_length=1, max_length=5000)
    cost_change: Decimal = Field(max_digits=15, decimal_places=2)


class VariationDecision(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


class VariationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    created_by: int
    title: str
    reason: str
    cost_change: Decimal
    status: str
    decided_by: int | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime


@router.get("/projects/{project_id}", response_model=list[VariationResponse])
def list_variations(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    get_access_role(db, project, current_user)

    return db.scalars(
        select(Variation)
        .where(Variation.project_id == project_id)
        .order_by(Variation.id.desc())
    ).all()


@router.post(
    "/projects/{project_id}",
    response_model=VariationResponse,
    status_code=201,
)
def submit_variation(
    project_id: int,
    payload: VariationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    if get_access_role(db, project, current_user) != "qs":
        raise HTTPException(403, "Only the assigned QS can submit variations.")


    if project.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Archived projects are read-only. Restore the project to submit variations.",
        )


    variation = Variation(
        project_id=project_id,
        created_by=current_user.id,
        title=payload.title,
        reason=payload.reason,
        cost_change=payload.cost_change,
        status="pending",
    )
    db.add(variation)
    db.commit()
    db.refresh(variation)
    return variation


@router.patch(
    "/projects/{project_id}/{variation_id}/decision",
    response_model=VariationResponse,
)
def decide_variation(
    project_id: int,
    variation_id: int,
    payload: VariationDecision,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    if get_access_role(db, project, current_user) != "building_owner":
        raise HTTPException(403, "Only the assigned Building Owner can decide variations.")


    if project.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Archived projects are read-only. Restore the project to approve or reject variations.",
        )


    variation = db.scalar(
        select(Variation).where(
            Variation.id == variation_id,
            Variation.project_id == project_id,
        )
    )
    if variation is None:
        raise HTTPException(404, "Variation not found.")

    result = db.execute(
        update(Variation)
        .where(
            Variation.id == variation_id,
            Variation.project_id == project_id,
            Variation.status == "pending",
        )
        .values(
            status=payload.status,
            decided_by=current_user.id,
            decided_at=datetime.now(timezone.utc).replace(tzinfo=None),
            decision_note=payload.note or None,
        )
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "This variation already has a decision.")

    db.commit()
    db.refresh(variation)
    return variation