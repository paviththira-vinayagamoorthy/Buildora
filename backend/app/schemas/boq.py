from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


MAX_NUMBER = Decimal("9999999999999.99")


class BOQItemCreate(BaseModel):
    item_no: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=10000)
    unit: str = Field(min_length=1, max_length=50)

    quantity: Decimal = Field(
        ge=0,
        max_digits=15,
        decimal_places=3,
        allow_inf_nan=False,
    )

    rate: Decimal = Field(
        ge=0,
        max_digits=15,
        decimal_places=2,
        allow_inf_nan=False,
    )

    @field_validator(
        "item_no",
        "description",
        "unit",
        mode="before",
    )
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class BOQItemUpdate(BaseModel):
    item_no: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    description: str | None = Field(
        default=None,
        min_length=1,
        max_length=10000,
    )

    unit: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    quantity: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=15,
        decimal_places=3,
        allow_inf_nan=False,
    )

    rate: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=15,
        decimal_places=2,
        allow_inf_nan=False,
    )

    @field_validator(
        "item_no",
        "description",
        "unit",
        "quantity",
        "rate",
        mode="before",
    )
    @classmethod
    def validate_provided_value(cls, value):
        # This validator runs for explicitly supplied fields.
        # Omitted fields retain their defaults.
        if value is None:
            raise ValueError("This field cannot be null.")

        return value.strip() if isinstance(value, str) else value


class BOQItemResponse(BaseModel):
    id: int
    boq_id: int

    item_no: str
    description: str
    unit: str

    quantity: Decimal
    rate: Decimal
    amount: Decimal

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BOQCreate(BaseModel):
    title: str = Field(
        default="Initial BOQ",
        min_length=1,
        max_length=255,
    )

    notes: str | None = Field(
        default=None,
        max_length=5000,
    )

    @field_validator("title", "notes", mode="before")
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class BOQRevisionCreate(BaseModel):
    reason: str = Field(
        min_length=5,
        max_length=2000,
    )

    @field_validator("reason", mode="before")
    @classmethod
    def clean_reason(cls, value):
        return value.strip() if isinstance(value, str) else value


class BOQResponse(BaseModel):
    id: int
    project_id: int
    created_by: int

    title: str
    revision: str
    status: str

    notes: str | None = None
    source_boq_id: int | None = None
    revision_reason: str | None = None
    published_by: int | None = None
    published_at: datetime | None = None

    total_amount: Decimal

    created_at: datetime
    updated_at: datetime

    items: list[BOQItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class BOQImportItem(BOQItemCreate):
    # Accepted for compatibility with the existing preview UI.
    # The backend recalculates this value before saving.
    amount: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=MAX_NUMBER,
        allow_inf_nan=False,
    )


class BOQImportPreviewResponse(BaseModel):
    file_name: str
    sheet_name: str
    total_items: int
    calculated_total: Decimal
    items: list[BOQImportItem]


class BOQImportConfirm(BOQCreate):
    title: str = Field(
        default="Imported BOQ",
        min_length=1,
        max_length=255,
    )

    items: list[BOQImportItem] = Field(
        min_length=1,
        max_length=5000,
    )