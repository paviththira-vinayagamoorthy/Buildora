from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class PaymentCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    certificate_id: int = Field(gt=0)

    payment_date: date

    amount: Decimal = Field(
        gt=0,
        max_digits=15,
        decimal_places=2,
        allow_inf_nan=False,
    )

    payment_method: Literal[
        "bank_transfer",
        "cash",
        "cheque",
    ]

    reference: str | None = Field(
        default=None,
        max_length=100,
    )

    notes: str | None = Field(
        default=None,
        max_length=2000,
    )

    @model_validator(mode="after")
    def validate_reference(self):
        if (
            self.payment_method in {"bank_transfer", "cheque"}
            and not self.reference
        ):
            raise ValueError(
                "A transaction reference or cheque number is required."
            )

        return self


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    certificate_id: int
    recorded_by: int

    payment_date: date
    amount: Decimal
    payment_method: str
    reference: str | None
    notes: str | None

    created_at: datetime


class CertificatePaymentSummary(BaseModel):
    certificate_id: int
    certificate_no: int

    net_payable: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal

    payment_status: Literal[
        "unpaid",
        "partially_paid",
        "paid",
    ]