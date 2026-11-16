import logging
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.boq import BOQ, BOQItem
from app.models.valuation import Valuation, ValuationItem
from app.schemas.valuation import (
    ValuationCreate,
    ValuationItemUpdate,
    ValuationPeriodUpdate,
    ValuationResponse,
)
from app.routers.boq import (
    get_access_role,
    get_latest_published,
    get_project_or_404,
)

def ensure_project_active(project):
    if project.status != "active":
        raise HTTPException(
            status_code=409,
            detail=(
                "Archived projects are read-only. "
                "Restore the project to modify valuations."
            ),
        )

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/valuations",
    tags=["Valuations"],
)

MAX_MONEY = Decimal("9999999999999.99")


# =========================================================
# PREVIOUS QUANTITIES AND BOQ REVISION CONNECTIONS
# =========================================================

def map_previous_quantities(db, boq_id, published):
    boq = db.get(BOQ, boq_id)

    if boq is None:
        raise HTTPException(404, "BOQ not found.")

    previous_items = {}

    for record in sorted(
        published,
        key=lambda row: row.valuation_no,
        reverse=True,
    ):
        for item in record.items:
            previous_items.setdefault(item.boq_item_id, item)

    current_items = db.scalars(
        select(BOQItem)
        .where(BOQItem.boq_id == boq_id)
        .order_by(BOQItem.id)
    ).all()

    result = {}
    used_ancestors = set()

    has_other_revision = any(
        record.boq_id != boq_id
        for record in published
    )

    for current in current_items:
        node = current
        visited = set()
        previous_quantity = Decimal("0.000")

        while True:
            if node.id in visited:
                raise HTTPException(
                    409,
                    "A circular BOQ item reference was found.",
                )

            visited.add(node.id)
            node_boq = db.get(BOQ, node.boq_id)

            if (
                node_boq is None
                or node_boq.project_id != boq.project_id
            ):
                raise HTTPException(
                    409,
                    "Invalid BOQ item revision reference.",
                )

            previous = previous_items.get(node.id)

            if previous is not None:
                if node.id in used_ancestors:
                    raise HTTPException(
                        409,
                        "Multiple BOQ items refer to the same "
                        "previously valued work.",
                    )

                used_ancestors.add(node.id)
                previous_quantity = previous.cumulative_quantity

                if (
                    previous_quantity > 0
                    and previous.unit.strip().casefold()
                    != current.unit.strip().casefold()
                ):
                    raise HTTPException(
                        409,
                        f"Item '{current.item_no}' has a different "
                        "unit from previously valued work. "
                        "Review its mapping.",
                    )

                break

            if node.source_item_id is None:
                if (
                    has_other_revision
                    and node_boq.source_boq_id is not None
                ):
                    raise HTTPException(
                        409,
                        f"Item '{current.item_no}' has no verified "
                        "revision connection. Review its source "
                        "item before continuing the valuation.",
                    )

                break

            parent = db.get(BOQItem, node.source_item_id)

            if (
                parent is None
                or node_boq.source_boq_id is None
                or parent.boq_id != node_boq.source_boq_id
            ):
                raise HTTPException(
                    409,
                    f"Invalid revision connection for "
                    f"item '{current.item_no}'.",
                )

            if (
                node.unit.strip().casefold()
                != parent.unit.strip().casefold()
            ):
                raise HTTPException(
                    409,
                    f"Item '{current.item_no}' changed units "
                    "between revisions. Review it before "
                    "carrying quantities forward.",
                )

            node = parent

        if (
            previous_quantity < 0
            or previous_quantity > current.quantity
        ):
            raise HTTPException(
                409,
                f"BOQ quantity for item '{current.item_no}' "
                "is below its previously valued quantity.",
            )

        result[current.id] = previous_quantity

    return result


# =========================================================
# PROJECT ACCESS
# =========================================================

@router.get("/projects/{project_id}/access")
def get_valuation_access(
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


# =========================================================
# LIST PROJECT VALUATIONS
# =========================================================

@router.get(
    "/projects/{project_id}",
    response_model=list[ValuationResponse],
)
def list_project_valuations(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    query = (
        select(Valuation)
        .options(selectinload(Valuation.items))
        .where(Valuation.project_id == project_id)
        .order_by(Valuation.valuation_no.desc())
    )

    if role == "building_owner":
        query = query.where(
            Valuation.status == "published"
        )

    return db.scalars(query).all()


# =========================================================
# GET ONE VALUATION
# =========================================================

@router.get(
    "/{valuation_id}",
    response_model=ValuationResponse,
)
def get_valuation(
    valuation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    valuation = db.scalar(
        select(Valuation)
        .options(selectinload(Valuation.items))
        .where(Valuation.id == valuation_id)
    )

    if valuation is None:
        raise HTTPException(404, "Valuation not found.")

    project = get_project_or_404(
        db,
        valuation.project_id,
    )

    role = get_access_role(db, project, current_user)

    if (
        role == "building_owner"
        and valuation.status != "published"
    ):
        raise HTTPException(404, "Valuation not found.")

    return valuation


# =========================================================
# CREATE DRAFT — ASSIGNED QS ONLY
# =========================================================

@router.post(
    "/projects/{project_id}",
    response_model=ValuationResponse,
    status_code=201,
)
def create_project_valuation(
    project_id: int,
    payload: ValuationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(
            db,
            project_id,
            lock=True,
        )

        ensure_project_active(project)

        role = get_access_role(db, project, current_user)

        if role != "qs":
            raise HTTPException(
                403,
                "Only an assigned Quantity Surveyor "
                "can create valuations.",
            )

        existing_draft = db.scalar(
            select(Valuation.id)
            .where(
                Valuation.project_id == project_id,
                Valuation.status == "draft",
            )
            .limit(1)
        )

        if existing_draft is not None:
            raise HTTPException(
                409,
                "A draft valuation already exists. "
                "Complete it before creating another.",
            )

        boq = db.get(BOQ, payload.boq_id)

        if (
            boq is None
            or boq.project_id != project_id
            or boq.status != "published"
        ):
            raise HTTPException(
                422,
                "Select a published BOQ from this project.",
            )

        latest_boq = get_latest_published(db, project_id)

        if latest_boq is None or latest_boq.id != boq.id:
            raise HTTPException(
                409,
                "Use the latest published BOQ.",
            )

        if payload.period_end < payload.period_start:
            raise HTTPException(
                422,
                "Period end cannot be before period start.",
            )

        history = db.scalars(
            select(Valuation)
            .options(selectinload(Valuation.items))
            .where(Valuation.project_id == project_id)
            .order_by(Valuation.valuation_no.desc())
        ).all()

        published = [
            record
            for record in history
            if record.status == "published"
        ]

        previous = published[0] if published else None

        if (
            previous is not None
            and payload.period_start <= previous.period_end
        ):
            raise HTTPException(
                422,
                "The new valuation period must start "
                "after the previous published period.",
            )

        boq_items = db.scalars(
            select(BOQItem)
            .where(BOQItem.boq_id == boq.id)
            .order_by(BOQItem.id)
        ).all()

        if not boq_items:
            raise HTTPException(
                422,
                "The published BOQ has no items.",
            )

        previous_quantities = map_previous_quantities(
            db,
            boq.id,
            published,
        )

        next_number = max(
            (record.valuation_no for record in history),
            default=0,
        ) + 1

        valuation = Valuation(
            project_id=project_id,
            boq_id=boq.id,
            created_by=current_user.id,
            valuation_no=next_number,
            period_start=payload.period_start,
            period_end=payload.period_end,
            notes=(payload.notes or "").strip() or None,
            status="draft",
            total_amount=Decimal("0.00"),
        )

        db.add(valuation)
        db.flush()

        for source in boq_items:
            previous_quantity = previous_quantities.get(
                source.id,
                Decimal("0.000"),
            )

            if (
                previous_quantity < 0
                or previous_quantity > source.quantity
            ):
                raise HTTPException(
                    409,
                    "Previous completed quantities need review.",
                )

            valuation.items.append(
                ValuationItem(
                    boq_item_id=source.id,
                    item_no=source.item_no,
                    description=source.description,
                    unit=source.unit,
                    boq_quantity=source.quantity,
                    rate=source.rate,
                    previous_quantity=previous_quantity,
                    cumulative_quantity=previous_quantity,
                    current_quantity=Decimal("0.000"),
                    amount=Decimal("0.00"),
                )
            )

        db.flush()

        result = ValuationResponse.model_validate(valuation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        logger.exception(
            "Unable to create valuation for project %s",
            project_id,
        )
        db.rollback()

        raise HTTPException(
            500,
            "Unable to create the valuation.",
        )


# =========================================================
# UPDATE COMPLETED QUANTITY — DRAFT ONLY
# =========================================================

@router.put(
    "/{valuation_id}/items/{item_id}",
    response_model=ValuationResponse,
)
def update_valuation_item(
    valuation_id: int,
    item_id: int,
    payload: ValuationItemUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        reference = db.get(Valuation, valuation_id)

        if reference is None:
            raise HTTPException(404, "Valuation not found.")

        project = get_project_or_404(
            db,
            reference.project_id,
            lock=True,
        )

        ensure_project_active(project)

        role = get_access_role(db, project, current_user)

        if role != "qs":
            raise HTTPException(
                403,
                "Only an assigned Quantity Surveyor "
                "can update valuations.",
            )

        valuation = db.scalar(
            select(Valuation)
            .options(selectinload(Valuation.items))
            .where(Valuation.id == valuation_id)
            .execution_options(populate_existing=True)
        )

        if valuation is None:
            raise HTTPException(404, "Valuation not found.")

        if valuation.status != "draft":
            raise HTTPException(
                409,
                "Published valuations cannot be edited.",
            )

        item = next(
            (
                row
                for row in valuation.items
                if row.id == item_id
            ),
            None,
        )

        if item is None:
            raise HTTPException(
                404,
                "Valuation item not found.",
            )

        cumulative = payload.cumulative_quantity

        if cumulative < item.previous_quantity:
            raise HTTPException(
                422,
                "Completed quantity cannot be less than "
                "the previously published quantity "
                f"({item.previous_quantity}).",
            )

        if cumulative > item.boq_quantity:
            raise HTTPException(
                422,
                "Completed quantity cannot exceed "
                f"the BOQ quantity ({item.boq_quantity}).",
            )

        current = cumulative - item.previous_quantity

        amount = (current * item.rate).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        if amount > MAX_MONEY:
            raise HTTPException(
                422,
                "Calculated amount exceeds the supported limit.",
            )

        total = sum(
            (
                amount if row.id == item.id else row.amount
                for row in valuation.items
            ),
            Decimal("0.00"),
        )

        if total > MAX_MONEY:
            raise HTTPException(
                422,
                "Valuation total exceeds the supported limit.",
            )

        item.cumulative_quantity = cumulative
        item.current_quantity = current
        item.amount = amount

        valuation.total_amount = total
        valuation.updated_at = datetime.utcnow()

        db.flush()

        result = ValuationResponse.model_validate(valuation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        logger.exception(
            "Unable to update valuation %s item %s",
            valuation_id,
            item_id,
        )
        db.rollback()

        raise HTTPException(
            500,
            "Unable to update the valuation item.",
        )


# =========================================================
# PUBLISH — ASSIGNED QS ONLY
# =========================================================

@router.post(
    "/{valuation_id}/publish",
    response_model=ValuationResponse,
)
def publish_valuation(
    valuation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        reference = db.get(Valuation, valuation_id)

        if reference is None:
            raise HTTPException(404, "Valuation not found.")

        project = get_project_or_404(
            db,
            reference.project_id,
            lock=True,
        )

        ensure_project_active(project)

        role = get_access_role(db, project, current_user)

        if role != "qs":
            raise HTTPException(
                403,
                "Only an assigned Quantity Surveyor "
                "can publish valuations.",
            )

        valuation = db.scalar(
            select(Valuation)
            .options(selectinload(Valuation.items))
            .where(Valuation.id == valuation_id)
            .execution_options(populate_existing=True)
        )

        if valuation is None:
            raise HTTPException(404, "Valuation not found.")

        if valuation.status != "draft":
            raise HTTPException(
                409,
                "This valuation is already published "
                "or is no longer a draft.",
            )

        if not valuation.items:
            raise HTTPException(
                422,
                "A valuation must contain at least one item.",
            )

        boq = db.get(BOQ, valuation.boq_id)

        if (
            boq is None
            or boq.project_id != project.id
            or boq.status != "published"
        ):
            raise HTTPException(
                409,
                "The valuation must reference "
                "a published BOQ from this project.",
            )

        published = db.scalars(
            select(Valuation)
            .options(selectinload(Valuation.items))
            .where(
                Valuation.project_id == project.id,
                Valuation.status == "published",
            )
            .order_by(Valuation.valuation_no.desc())
        ).all()

        if published:
            latest = published[0]

            if valuation.valuation_no <= latest.valuation_no:
                raise HTTPException(
                    409,
                    "A newer valuation has already been published.",
                )

            if valuation.period_start <= latest.period_end:
                raise HTTPException(
                    422,
                    "The valuation period overlaps "
                    "the previous published period.",
                )

        previous_quantities = map_previous_quantities(
            db,
            valuation.boq_id,
            published,
        )

        total = Decimal("0.00")

        for item in valuation.items:
            if item.boq_item_id not in previous_quantities:
                raise HTTPException(
                    409,
                    "A valuation item does not belong "
                    "to the selected BOQ.",
                )

            expected_previous = previous_quantities[
                item.boq_item_id
            ]

            if item.previous_quantity != expected_previous:
                raise HTTPException(
                    409,
                    "Previously valued quantities have changed. "
                    "Review this draft before publishing.",
                )

            if not (
                Decimal("0.000")
                <= item.previous_quantity
                <= item.cumulative_quantity
                <= item.boq_quantity
            ):
                raise HTTPException(
                    422,
                    f"Invalid completed quantity "
                    f"for item '{item.item_no}'.",
                )

            if item.rate < 0:
                raise HTTPException(
                    422,
                    f"Invalid rate for item '{item.item_no}'.",
                )

            item.current_quantity = (
                item.cumulative_quantity
                - item.previous_quantity
            )

            item.amount = (
                item.current_quantity * item.rate
            ).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )

            total += item.amount

            if total > MAX_MONEY:
                raise HTTPException(
                    422,
                    "Valuation total exceeds the supported limit.",
                )

        if total <= 0:
            raise HTTPException(
                422,
                "Enter completed work with a positive "
                "value before publishing.",
            )

        now = datetime.utcnow()

        valuation.total_amount = total
        valuation.status = "published"
        valuation.published_by = current_user.id
        valuation.published_at = now
        valuation.updated_at = now

        db.flush()

        result = ValuationResponse.model_validate(valuation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        logger.exception(
            "Unable to publish valuation %s",
            valuation_id,
        )
        db.rollback()

        raise HTTPException(
            500,
            "Unable to publish the valuation.",
        )


# =========================================================
# UPDATE DRAFT PERIOD — ASSIGNED QS ONLY
# =========================================================

@router.patch(
    "/{valuation_id}/period",
    response_model=ValuationResponse,
)
def update_valuation_period(
    valuation_id: int,
    payload: ValuationPeriodUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        reference = db.get(Valuation, valuation_id)

        if reference is None:
            raise HTTPException(404, "Valuation not found.")

        project = get_project_or_404(
            db,
            reference.project_id,
            lock=True,
        )

        ensure_project_active(project)

        role = get_access_role(db, project, current_user)

        if role != "qs":
            raise HTTPException(
                403,
                "Only an assigned Quantity Surveyor "
                "can change valuation dates.",
            )

        valuation = db.scalar(
            select(Valuation)
            .options(selectinload(Valuation.items))
            .where(Valuation.id == valuation_id)
            .execution_options(populate_existing=True)
        )

        if valuation is None:
            raise HTTPException(404, "Valuation not found.")

        if valuation.status != "draft":
            raise HTTPException(
                409,
                "Published valuation dates cannot be changed.",
            )

        latest_published = db.scalar(
            select(Valuation)
            .where(
                Valuation.project_id == project.id,
                Valuation.status == "published",
            )
            .order_by(Valuation.valuation_no.desc())
            .limit(1)
        )

        if (
            latest_published is not None
            and payload.period_start <= latest_published.period_end
        ):
            raise HTTPException(
                422,
                "The valuation period must start after "
                "the previous published period.",
            )

        valuation.period_start = payload.period_start
        valuation.period_end = payload.period_end
        valuation.updated_at = datetime.utcnow()

        db.flush()

        result = ValuationResponse.model_validate(valuation)
        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        logger.exception(
            "Unable to update period for valuation %s",
            valuation_id,
        )
        db.rollback()

        raise HTTPException(
            500,
            "Unable to update the valuation dates.",
        )