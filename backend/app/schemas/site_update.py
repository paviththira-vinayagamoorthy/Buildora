from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


class SiteUpdateFields(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    update_date: date

    title: str = Field(
        min_length=1,
        max_length=255,
    )

    work_completed: str = Field(
        min_length=1,
        max_length=5000,
    )

    progress_percentage: Decimal = Field(
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
        allow_inf_nan=False,
    )

    issues: str | None = Field(
        default=None,
        max_length=3000,
    )

    next_steps: str | None = Field(
        default=None,
        max_length=3000,
    )


class SiteUpdateCreate(SiteUpdateFields):
    pass


class SiteUpdateEdit(SiteUpdateFields):
    """Replace all editable fields on a draft update."""


class SiteUpdateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    created_by: int

    update_date: date
    title: str
    work_completed: str
    progress_percentage: Decimal

    issues: str | None
    next_steps: str | None

    status: Literal["draft", "published"]

    published_by: int | None
    published_at: datetime | None

    created_at: datetime
    updated_at: datetime