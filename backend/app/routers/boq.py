from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from fastapi.responses import StreamingResponse
from pydantic import Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

from app.models.boq import BOQ, BOQItem
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.organization_member import OrganizationMember

from app.schemas.boq import (
    BOQCreate,
    BOQRevisionCreate,
    BOQItemCreate,
    BOQItemUpdate,
    BOQItemResponse,
    BOQResponse,
    BOQImportItem,
    BOQImportPreviewResponse,
    BOQImportConfirm,
)

from app.models.organization_subscription import OrganizationSubscription
from app.routers.billing import can_write


router = APIRouter(
    prefix="/boq",
    tags=["BOQ"],
)

MONEY_STEP = Decimal("0.01")
MAX_MONEY = Decimal("9999999999999.99")
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ITEMS = 5000

class BOQExcelImportConfirm(BOQImportConfirm):
    source_boq_id: int | None = Field(default=None, gt=0)
    revision_reason: str | None = Field(default=None, max_length=2000)


# =========================================================
# ACCESS
# =========================================================

def get_project_or_404(db, project_id, lock=False):
    query = select(Project).where(Project.id == project_id)

    if lock:
        query = query.with_for_update()

    project = db.scalar(query)

    if not project:
        raise HTTPException(404, "Project not found.")

    return project


def get_boq_or_404(db, boq_id):
    boq = db.get(BOQ, boq_id)

    if not boq:
        raise HTTPException(404, "BOQ not found.")

    return boq


def get_project_membership(db, project_id, user_id):
    return db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )


def get_access_role(db, project, current_user):
    membership = get_project_membership(
        db,
        project.id,
        current_user.id,
    )

    # Explicit project QS assignment takes priority.
    if membership and membership.project_role == "qs":
        return "qs"

    organization_membership = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id
            == project.organization_id,
            OrganizationMember.user_id == current_user.id,
        )
    )

    if (
        organization_membership
        and organization_membership.member_role
        == "organization_admin"
    ):
        return "organization_admin"

    if membership and membership.project_role in {
        "owner",
        "building_owner",
    }:
        return "building_owner"

    # Platform-level role alone does not grant project access.
    # Project creators also do not receive automatic BOQ access.
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "You do not have BOQ access to this project.",
    )


def ensure_project_active(project):
    if project.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Archived projects are read-only. Restore the project to make changes.",
        )

def ensure_subscription_writable(db, project):
    sub = db.get(
        OrganizationSubscription,
        project.organization_id,
    )

    if not can_write(sub):
        raise HTTPException(
            status_code=403,
            detail=(
                "Your subscription is inactive or expired. "
                "Renew your subscription to make changes."
            ),
        )

def ensure_qs(db, project, current_user):
    role = get_access_role(db, project, current_user)

    if role != "qs":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only a Quantity Surveyor assigned to this project "
            "can manage its BOQ.",
        )


def get_boq_for_write(db, boq_id, current_user):
    reference = get_boq_or_404(db, boq_id)

    # All BOQ writes lock the same project row.
    project = get_project_or_404(
        db,
        reference.project_id,
        lock=True,
    )

    ensure_qs(db, project, current_user)
    ensure_project_active(project)
    ensure_subscription_writable(db, project)

    boq = db.scalar(
        select(BOQ)
        .where(BOQ.id == boq_id)
        .execution_options(populate_existing=True)
    )

    return project, boq


def ensure_draft(boq):
    if boq.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Published BOQs cannot be edited. "
            "Create a new revision instead.",
        )


def get_latest_published(db, project_id):
    return db.scalar(
        select(BOQ)
        .where(
            BOQ.project_id == project_id,
            BOQ.status == "published",
        )
        .order_by(BOQ.id.desc())
        .limit(1)
    )


# =========================================================
# CALCULATIONS AND VALIDATION
# =========================================================

def calculate_amount(quantity, rate):
    try:
        quantity = Decimal(str(quantity))
        rate = Decimal(str(rate))

        if (
            not quantity.is_finite()
            or not rate.is_finite()
            or quantity < 0
            or rate < 0
        ):
            raise ValueError()

        amount = (quantity * rate).quantize(
            MONEY_STEP,
            rounding=ROUND_HALF_UP,
        )

        if amount > MAX_MONEY:
            raise ValueError()

        return amount

    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(
            422,
            "Quantity, rate or calculated amount is invalid "
            "or exceeds the supported limit.",
        )


def recalculate_boq_total(db, boq):
    items = db.scalars(
        select(BOQItem).where(BOQItem.boq_id == boq.id)
    ).all()

    total = Decimal("0.00")

    for item in items:
        item.amount = calculate_amount(item.quantity, item.rate)
        total += item.amount

    if total > MAX_MONEY:
        raise HTTPException(
            422,
            "BOQ total exceeds the supported limit.",
        )

    boq.total_amount = total
    boq.updated_at = datetime.utcnow()

    db.add(boq)
    db.flush()


def ensure_unique_item_number(
    db,
    boq_id,
    item_no,
    exclude_item_id=None,
):
    query = select(BOQItem).where(
        BOQItem.boq_id == boq_id,
        BOQItem.item_no == item_no,
    )

    if exclude_item_id is not None:
        query = query.where(BOQItem.id != exclude_item_id)

    if db.scalar(query):
        raise HTTPException(
            409,
            f"Item number '{item_no}' already exists in this BOQ.",
        )


def ensure_no_existing_boq(db, project_id):
    existing = db.scalar(
        select(BOQ.id)
        .where(BOQ.project_id == project_id)
        .limit(1)
    )

    if existing is not None:
        raise HTTPException(
            409,
            "A BOQ already exists. Use the existing draft "
            "or create a revision from the latest published BOQ.",
        )


def commit_changes(db):
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            500,
            "Unable to save BOQ changes.",
        )


# =========================================================
# EXCEL PREVIEW — DOES NOT SAVE
# =========================================================

@router.post(
    "/projects/{project_id}/import/preview",
    response_model=BOQImportPreviewResponse,
)
async def preview_boq_excel(
    project_id: int,
    file: UploadFile = File(...),
    source_boq_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    ensure_qs(db, project, current_user)
    ensure_project_active(project)
    ensure_no_existing_boq(db, project_id)

    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            400,
            "Please upload a valid .xlsx Excel file.",
        )

    contents = await file.read(MAX_FILE_BYTES + 1)

    if not contents:
        raise HTTPException(400, "The uploaded file is empty.")

    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(
            400,
            "Excel file must be 5 MB or smaller.",
        )

    workbook = None

    try:
        workbook = load_workbook(
            BytesIO(contents),
            data_only=True,
            read_only=True,
        )

        sheet = workbook.active

        if sheet is None:
            raise HTTPException(400, "No worksheet was found.")

        rows = sheet.iter_rows(values_only=True)
        first_row = next(rows, None)

        if first_row is None:
            raise HTTPException(400, "The worksheet is empty.")

        headers = [
            str(value).strip().lower() if value is not None else ""
            for value in first_row
        ]

        required = [
            "item no",
            "description",
            "unit",
            "quantity",
            "rate",
        ]

        missing = [name for name in required if name not in headers]

        if missing:
            raise HTTPException(
                400,
                "Missing Excel columns: " + ", ".join(missing),
            )

        if any(headers.count(name) != 1 for name in required):
            raise HTTPException(
                400,
                "Required Excel columns must appear exactly once.",
            )

        positions = {name: headers.index(name) for name in required}

        preview_items = []
        seen_numbers = set()
        total = Decimal("0.00")

        for row_number, row in enumerate(rows, start=2):
            if row_number > 10001:
                raise HTTPException(
                    400,
                    "The worksheet contains too many rows.",
                )

            def cell(name):
                index = positions[name]
                return row[index] if index < len(row) else None

            values = {name: cell(name) for name in required}

            if all(
                value is None or str(value).strip() == ""
                for value in values.values()
            ):
                continue

            try:
                item = BOQImportItem(
                    item_no=(
                        str(values["item no"]).strip()
                        if values["item no"] is not None else ""
                    ),
                    description=(
                        str(values["description"]).strip()
                        if values["description"] is not None else ""
                    ),
                    unit=(
                        str(values["unit"]).strip()
                        if values["unit"] is not None else ""
                    ),
                    quantity=values["quantity"],
                    rate=values["rate"],
                )
            except ValidationError as exc:
                messages = "; ".join(
                    f"{error['loc'][-1]}: {error['msg']}"
                    for error in exc.errors()
                )

                raise HTTPException(
                    422,
                    f"Excel row {row_number}: {messages}",
                )

            item_key = item.item_no.casefold()

            if item_key in seen_numbers:
                raise HTTPException(
                    422,
                    f"Excel row {row_number}: duplicate item "
                    f"number '{item.item_no}'.",
                )

            seen_numbers.add(item_key)

            item.amount = calculate_amount(item.quantity, item.rate)
            total += item.amount

            if total > MAX_MONEY:
                raise HTTPException(
                    422,
                    "BOQ total exceeds the supported limit.",
                )

            preview_items.append(item)

            if len(preview_items) > MAX_IMPORT_ITEMS:
                raise HTTPException(
                    400,
                    "Import supports a maximum of 5000 BOQ items.",
                )

        if not preview_items:
            raise HTTPException(
                400,
                "No BOQ items were found in the Excel file.",
            )

        return BOQImportPreviewResponse(
            file_name=file.filename,
            sheet_name=sheet.title,
            total_items=len(preview_items),
            calculated_total=total,
            items=preview_items,
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            400,
            "Unable to read the Excel file. "
            "Check that it is a valid .xlsx workbook.",
        )

    finally:
        if workbook is not None:
            workbook.close()


# =========================================================
# CONFIRM EXCEL IMPORT
# =========================================================

@router.post(
    "/projects/{project_id}/import/confirm",
    response_model=BOQResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_boq_import(
    project_id: int,
    payload: BOQExcelImportConfirm,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(db, project_id, lock=True)
        ensure_qs(db, project, current_user)
        ensure_project_active(project)
        ensure_subscription_writable(db, project)

        source, revision = get_excel_import_target(
            db,
            project_id,
            payload.source_boq_id,
            lock=True,
        )

        reason = (payload.revision_reason or "").strip()
        if source is not None and not reason:
            raise HTTPException(422, "Enter a reason for the revision.")

        boq = BOQ(
            project_id=project_id,
            created_by=current_user.id,
            title=payload.title,
            notes=payload.notes,
            source_boq_id=source.id if source is not None else None,
            revision_reason=reason if source is not None else None,
            revision=revision,
            status="draft",
            total_amount=Decimal("0.00"),
        )

        db.add(boq)
        db.flush()

        seen_numbers = set()

        for imported in payload.items:
            key = imported.item_no.casefold()

            if key in seen_numbers:
                raise HTTPException(
                    422,
                    f"Duplicate item number '{imported.item_no}'.",
                )

            seen_numbers.add(key)

            db.add(
                BOQItem(
                    boq_id=boq.id,
                    item_no=imported.item_no,
                    description=imported.description,
                    unit=imported.unit,
                    quantity=imported.quantity,
                    rate=imported.rate,
                    amount=calculate_amount(
                        imported.quantity,
                        imported.rate,
                    ),
                )
            )

        db.flush()
        recalculate_boq_total(db, boq)
        commit_changes(db)
        db.refresh(boq)

        return boq

    except Exception:
        db.rollback()
        raise


# =========================================================
# CREATE INITIAL BOQ
# =========================================================

@router.post(
    "/projects/{project_id}",
    response_model=BOQResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_boq(
    project_id: int,
    payload: BOQCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project = get_project_or_404(db, project_id, lock=True)
        ensure_qs(db, project, current_user)
        ensure_project_active(project)
        ensure_subscription_writable(db, project)
        ensure_no_existing_boq(db, project_id)

        boq = BOQ(
            project_id=project_id,
            created_by=current_user.id,
            title=payload.title,
            notes=payload.notes,
            revision="00",
            status="draft",
            total_amount=Decimal("0.00"),
        )

        db.add(boq)
        commit_changes(db)
        db.refresh(boq)

        return boq

    except Exception:
        db.rollback()
        raise


# =========================================================
# LIST — OWNER RECEIVES LATEST PUBLISHED ONLY
# =========================================================

@router.get(
    "/projects/{project_id}",
    response_model=list[BOQResponse],
)
def get_project_boqs(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    role = get_access_role(db, project, current_user)

    if role == "building_owner":
        latest = get_latest_published(db, project_id)
        return [latest] if latest else []

    return db.scalars(
        select(BOQ)
        .where(BOQ.project_id == project_id)
        .order_by(BOQ.id.desc())
    ).all()


# =========================================================
# SINGLE — PROTECT DIRECT URL ACCESS TOO
# =========================================================

@router.get(
    "/{boq_id}",
    response_model=BOQResponse,
)
def get_boq(
    boq_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    boq = get_boq_or_404(db, boq_id)
    project = get_project_or_404(db, boq.project_id)
    role = get_access_role(db, project, current_user)

    if role == "building_owner":
        latest = get_latest_published(db, project.id)

        if latest is None or latest.id != boq.id:
            raise HTTPException(
                404,
                "This BOQ is not available to Building Owners.",
            )

    return boq


# =========================================================
# PUBLISH DRAFT
# =========================================================

@router.post(
    "/{boq_id}/publish",
    response_model=BOQResponse,
)
def publish_boq(
    boq_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        _, boq = get_boq_for_write(db, boq_id, current_user)
        ensure_draft(boq)

        items = db.scalars(
            select(BOQItem).where(BOQItem.boq_id == boq.id)
        ).all()

        if not items:
            raise HTTPException(
                422,
                "Add at least one BOQ item before publishing.",
            )

        if boq.revision != "00" and not (
            boq.revision_reason and boq.revision_reason.strip()
        ):
            raise HTTPException(
                422,
                "A revision reason is required.",
            )

        recalculate_boq_total(db, boq)

        boq.status = "published"
        boq.published_by = current_user.id
        boq.published_at = datetime.utcnow()

        commit_changes(db)
        db.refresh(boq)

        return boq

    except Exception:
        db.rollback()
        raise


# =========================================================
# NEW REVISION — COPY LATEST PUBLISHED BOQ
# =========================================================

@router.post(
    "/{boq_id}/revisions",
    response_model=BOQResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_boq_revision(
    boq_id: int,
    payload: BOQRevisionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        project, source = get_boq_for_write(
            db,
            boq_id,
            current_user,
        )

        if source.status != "published":
            raise HTTPException(
                409,
                "A revision can only be created from a published BOQ.",
            )

        latest = get_latest_published(db, project.id)

        if not latest or latest.id != source.id:
            raise HTTPException(
                409,
                "Create revisions from the latest published BOQ.",
            )

        existing_draft = db.scalar(
            select(BOQ.id).where(
                BOQ.project_id == project.id,
                BOQ.status == "draft",
            )
        )

        if existing_draft is not None:
            raise HTTPException(
                409,
                "A draft already exists. Complete and publish it first.",
            )

        previous = db.scalars(
            select(BOQ).where(BOQ.project_id == project.id)
        ).all()

        if any(not str(item.revision).isdigit() for item in previous):
            raise HTTPException(
                409,
                "Existing revision numbers need review before "
                "creating another revision.",
            )

        next_number = max(
            int(item.revision) for item in previous
        ) + 1

        revision = BOQ(
            project_id=project.id,
            created_by=current_user.id,
            title=source.title,
            notes=source.notes,
            source_boq_id=source.id,
            revision_reason=payload.reason,
            revision=f"{next_number:02d}",
            status="draft",
            total_amount=Decimal("0.00"),
        )

        db.add(revision)
        db.flush()

        source_items = db.scalars(
            select(BOQItem)
            .where(BOQItem.boq_id == source.id)
            .order_by(BOQItem.id)
        ).all()

        for item in source_items:
            db.add(
                BOQItem(
                    boq_id=revision.id,
                    source_item_id=item.id,
                    item_no=item.item_no,
                    description=item.description,
                    unit=item.unit,
                    quantity=item.quantity,
                    rate=item.rate,
                    amount=calculate_amount(item.quantity, item.rate),
                )
            )

        db.flush()
        recalculate_boq_total(db, revision)
        commit_changes(db)
        db.refresh(revision)

        return revision

    except Exception:
        db.rollback()
        raise


# =========================================================
# ADD ITEM
# =========================================================

@router.post(
    "/{boq_id}/items",
    response_model=BOQItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_boq_item(
    boq_id: int,
    payload: BOQItemCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        _, boq = get_boq_for_write(db, boq_id, current_user)
        ensure_draft(boq)

        ensure_unique_item_number(db, boq.id, payload.item_no)

        item = BOQItem(
            boq_id=boq.id,
            **payload.model_dump(),
            amount=calculate_amount(payload.quantity, payload.rate),
        )

        db.add(item)
        db.flush()

        recalculate_boq_total(db, boq)
        commit_changes(db)
        db.refresh(item)

        return item

    except Exception:
        db.rollback()
        raise


# =========================================================
# UPDATE ITEM
# =========================================================

@router.put(
    "/{boq_id}/items/{item_id}",
    response_model=BOQItemResponse,
)
def update_boq_item(
    boq_id: int,
    item_id: int,
    payload: BOQItemUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        _, boq = get_boq_for_write(db, boq_id, current_user)
        ensure_draft(boq)

        item = db.scalar(
            select(BOQItem).where(
                BOQItem.id == item_id,
                BOQItem.boq_id == boq.id,
            )
        )

        if not item:
            raise HTTPException(404, "BOQ item not found.")

        changes = payload.model_dump(exclude_unset=True)

        if not changes:
            raise HTTPException(422, "No changes were provided.")

        if "item_no" in changes:
            ensure_unique_item_number(
                db,
                boq.id,
                changes["item_no"],
                exclude_item_id=item.id,
            )

        for field, value in changes.items():
            setattr(item, field, value)

        item.amount = calculate_amount(item.quantity, item.rate)

        db.flush()
        recalculate_boq_total(db, boq)
        commit_changes(db)
        db.refresh(item)

        return item

    except Exception:
        db.rollback()
        raise


# =========================================================
# DELETE ITEM — DRAFT ONLY
# =========================================================

@router.delete(
    "/{boq_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_boq_item(
    boq_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        _, boq = get_boq_for_write(db, boq_id, current_user)
        ensure_draft(boq)

        item = db.scalar(
            select(BOQItem).where(
                BOQItem.id == item_id,
                BOQItem.boq_id == boq.id,
            )
        )

        if not item:
            raise HTTPException(404, "BOQ item not found.")

        db.delete(item)
        db.flush()

        recalculate_boq_total(db, boq)
        commit_changes(db)

        return None

    except Exception:
        db.rollback()
        raise

        # =========================================================
# EXPORT BOQ TO EXCEL
# =========================================================

@router.get("/{boq_id}/export")
def export_boq_excel(
    boq_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    boq = get_boq_or_404(db, boq_id)
    project = get_project_or_404(db, boq.project_id)
    role = get_access_role(db, project, current_user)

    # Building Owners can download only the latest published BOQ.
    if role == "building_owner":
        latest = get_latest_published(db, project.id)

        if latest is None or latest.id != boq.id:
            raise HTTPException(
                404,
                "This BOQ is not available to Building Owners.",
            )

    items = db.scalars(
        select(BOQItem)
        .where(BOQItem.boq_id == boq.id)
        .order_by(BOQItem.id)
    ).all()

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "BOQ"

    headers = [
        "Item No",
        "Description",
        "Unit",
        "Quantity",
        "Rate",
        "Amount",
    ]

    sheet.append(headers)

    def write_text(cell, value):
        # Keep user-entered text as text, including values starting with "=".
        cell.value = str(value or "")
        cell.data_type = "s"

    for row_number, item in enumerate(items, start=2):
        write_text(sheet.cell(row_number, 1), item.item_no)
        write_text(sheet.cell(row_number, 2), item.description)
        write_text(sheet.cell(row_number, 3), item.unit)

        sheet.cell(row_number, 4, float(item.quantity))
        sheet.cell(row_number, 5, float(item.rate))
        sheet.cell(row_number, 6, float(item.amount))

        sheet.cell(row_number, 4).number_format = "#,##0.000"
        sheet.cell(row_number, 5).number_format = "#,##0.00"
        sheet.cell(row_number, 6).number_format = "#,##0.00"

        sheet.cell(row_number, 1).number_format = "@"
        sheet.cell(row_number, 2).alignment = Alignment(
            vertical="top",
            wrap_text=True,
        )

    # Keep the first sheet compatible with the existing Excel importer.
    # Put project details and totals on a separate sheet.
    summary = workbook.create_sheet("Summary")
    summary.append(["Field", "Value"])

    details = [
        ("Project", project.name),
        ("Project ID", str(project.id)),
        ("BOQ title", boq.title),
        ("Revision", str(boq.revision).zfill(2)),
        ("Status", boq.status),
        ("Currency", "LKR"),
        ("Revision reason", boq.revision_reason or ""),
        ("Notes", boq.notes or ""),
        (
            "Published at (UTC)",
            boq.published_at.isoformat(sep=" ", timespec="seconds")
            if boq.published_at else "",
        ),
    ]

    for row_number, (label, value) in enumerate(details, start=2):
        write_text(summary.cell(row_number, 1), label)
        write_text(summary.cell(row_number, 2), value)

    count_row = summary.max_row + 1
    summary.cell(count_row, 1, "Item count")
    summary.cell(count_row, 2, len(items))

    total_row = summary.max_row + 1
    summary.cell(total_row, 1, "BOQ total (LKR)")
    summary.cell(total_row, 2, float(boq.total_amount))
    summary.cell(total_row, 2).number_format = "#,##0.00"
    summary.cell(total_row, 1).font = Font(bold=True)
    summary.cell(total_row, 2).font = Font(bold=True)

    for worksheet in (sheet, summary):
        worksheet.sheet_view.showGridLines = False
        worksheet.freeze_panes = "A2"
        worksheet.row_dimensions[1].height = 28

        for cell in worksheet[1]:
            cell.fill = PatternFill("solid", fgColor="382A40")
            cell.font = Font(
                name="Arial",
                size=11,
                bold=True,
                color="FFFFFF",
            )
            cell.alignment = Alignment(vertical="center")

    for column, width in {
        "A": 16,
        "B": 65,
        "C": 14,
        "D": 20,
        "E": 22,
        "F": 24,
    }.items():
        sheet.column_dimensions[column].width = width

    sheet.auto_filter.ref = sheet.dimensions

    summary.column_dimensions["A"].width = 25
    summary.column_dimensions["B"].width = 75

    for row in summary.iter_rows(min_row=2):
        row[1].alignment = Alignment(
            vertical="top",
            wrap_text=True,
        )

    output = BytesIO()

    try:
        workbook.save(output)
    finally:
        workbook.close()

    output.seek(0)

    # Numeric IDs keep the download filename safe.
    filename = f"Buildora_Project_{project.id}_BOQ_{boq.id}.xlsx"

    return StreamingResponse(
        output,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )