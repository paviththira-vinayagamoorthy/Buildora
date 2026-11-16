from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


class MonthlyReportFields(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    summary: str = Field(
        min_length=1,
        max_length=5000,
    )

    issues: str | None = Field(
        default=None,
        max_length=3000,
    )

    next_steps: str | None = Field(
        default=None,
        max_length=3000,
    )


class MonthlyReportCreate(MonthlyReportFields):
    # Empty summary triggers automatic generation.
    summary: str = Field(
        default="",
        max_length=5000,
    )

    report_month: date

    @field_validator("report_month")
    @classmethod
    def validate_report_month(cls, value):
        if value.day != 1:
            raise ValueError(
                "Use the first day of the reporting month."
            )

        return value


class MonthlyReportEdit(MonthlyReportFields):
    """Replace the editable text fields on a draft report."""


class MonthlyReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    created_by: int

    report_month: date

    summary: str
    issues: str | None
    next_steps: str | None

    progress_percentage: Decimal | None

    payments_this_month: Decimal
    certified_to_date: Decimal
    paid_to_date: Decimal
    outstanding_to_date: Decimal

    snapshot_at: datetime | None

    status: Literal["draft", "published"]

    published_by: int | None
    published_at: datetime | None

    created_at: datetime
    updated_at: datetime

    ai_explanation: str | None = None