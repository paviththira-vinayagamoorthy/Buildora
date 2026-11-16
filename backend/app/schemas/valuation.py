from datetime import date, datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class ValuationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    boq_id: int = Field(gt=0)
    period_start: date
    period_end: date
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_end < self.period_start:
            raise ValueError(
                "Period end must be on or after period start."
            )

        return self


class ValuationItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cumulative_quantity: Decimal = Field(
        ge=0,
        max_digits=15,
        decimal_places=3,
        allow_inf_nan=False,
    )


class ValuationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=2000)


class ValuationPeriodUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_start: date
    period_end: date

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_end < self.period_start:
            raise ValueError(
                "Period end cannot be before period start."
            )

        return self


class ValuationItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    valuation_id: int
    boq_item_id: int

    item_no: str
    description: str
    unit: str

    boq_quantity: Decimal
    rate: Decimal

    previous_quantity: Decimal
    cumulative_quantity: Decimal
    current_quantity: Decimal
    amount: Decimal


class ValuationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    boq_id: int
    created_by: int
    valuation_no: int

    period_start: date
    period_end: date
    status: str
    notes: str | None

    total_amount: Decimal

    published_by: int | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    items: list[ValuationItemResponse]