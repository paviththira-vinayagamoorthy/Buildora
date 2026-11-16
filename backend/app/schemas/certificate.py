from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class CertificateDeductions(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    retention_percentage: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
        allow_inf_nan=False,
    )

    other_deductions: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        max_digits=15,
        decimal_places=2,
        allow_inf_nan=False,
    )

    deduction_reason: str | None = Field(
        default=None,
        max_length=2000,
    )

    notes: str | None = Field(
        default=None,
        max_length=2000,
    )

    @model_validator(mode="after")
    def validate_deduction_reason(self):
        if self.other_deductions > 0 and not self.deduction_reason:
            raise ValueError(
                "A reason is required for other deductions."
            )

        return self


class CertificateCreate(CertificateDeductions):
    valuation_id: int = Field(gt=0)


class CertificateUpdate(CertificateDeductions):
    """Replace all deduction fields on a draft certificate."""


class CertificateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    valuation_id: int
    certificate_no: int
    created_by: int

    status: str

    work_value: Decimal
    retention_percentage: Decimal
    retention_amount: Decimal
    other_deductions: Decimal
    deduction_reason: str | None
    net_payable: Decimal
    notes: str | None

    published_by: int | None
    published_at: datetime | None

    created_at: datetime
    updated_at: datetime