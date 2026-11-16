from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


VerificationStatus = Literal[
    "unsubmitted",
    "pending",
    "approved",
    "rejected",
]


# =========================================================
# CREATE ORGANIZATION
# Existing name-only creation remains compatible.
# Verification submission is a separate action.
# =========================================================

class OrganizationCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    name: str = Field(
        min_length=2,
        max_length=150,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = " ".join(value.split())

        if len(value) < 2:
            raise ValueError(
                "Enter a company name with at least 2 characters."
            )

        if not any(character.isalnum() for character in value):
            raise ValueError("Enter a valid company name.")

        return value


# =========================================================
# SAVE COMPANY VERIFICATION DETAILS
# Status and reviewer fields cannot be supplied here.
# =========================================================

class OrganizationDetailsUpdate(OrganizationCreate):
    registration_number: str = Field(
        min_length=2,
        max_length=100,
    )

    company_email: EmailStr = Field(
        max_length=255,
    )

    company_phone: str = Field(
        min_length=7,
        max_length=30,
    )

    address: str = Field(
        min_length=10,
        max_length=1000,
    )

    contact_person_name: str = Field(
        min_length=2,
        max_length=100,
    )

    contact_person_position: str = Field(
        min_length=2,
        max_length=100,
    )

    @field_validator("registration_number")
    @classmethod
    def validate_registration_number(cls, value: str) -> str:
        if not any(character.isalnum() for character in value):
            raise ValueError(
                "Enter a valid company registration number."
            )

        return value

    @field_validator("company_phone")
    @classmethod
    def validate_company_phone(cls, value: str) -> str:
        allowed_characters = set("0123456789+()- ")

        if any(
            character not in allowed_characters
            for character in value
        ):
            raise ValueError(
                "Enter a valid company phone number."
            )

        digit_count = sum(
            character in "0123456789"
            for character in value
        )

        if not 7 <= digit_count <= 15:
            raise ValueError(
                "Phone number must contain 7 to 15 digits."
            )

        if value.count("+") > 1 or (
            "+" in value and not value.startswith("+")
        ):
            raise ValueError(
                "The + sign is allowed only at the start."
            )

        return value

    @field_validator(
        "contact_person_name",
        "contact_person_position",
    )
    @classmethod
    def validate_contact_text(cls, value: str) -> str:
        value = " ".join(value.split())

        if len(value) < 2 or not any(
            character.isalpha() for character in value
        ):
            raise ValueError(
                "Enter a valid name or position containing letters."
            )

        return value

    @field_validator("address")
    @classmethod
    def validate_address(cls, value: str) -> str:
        if not any(character.isalnum() for character in value):
            raise ValueError("Enter a valid company address.")

        return value


# =========================================================
# SUBMIT FOR VERIFICATION
# Server checks saved details, verified email and documents.
# =========================================================

class OrganizationVerificationSubmit(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    declaration_accepted: bool = Field(
        strict=True,
    )

    @field_validator("declaration_accepted")
    @classmethod
    def validate_declaration(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError(
                "You must confirm that the submitted details "
                "and documents are accurate."
            )

        return value


# =========================================================
# PLATFORM ADMIN REVIEW
# =========================================================

class OrganizationReview(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    decision: Literal["approved", "rejected"]

    reason: str = Field(
        min_length=5,
        max_length=2000,
    )

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not any(character.isalnum() for character in value):
            raise ValueError("Enter a valid review reason.")

        return value


# =========================================================
# ORGANIZATION RESPONSE
# Keep the existing response fields for current pages.
# =========================================================

class OrganizationResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    name: str
    created_by: int

    verification_status: VerificationStatus

    created_at: datetime
    updated_at: datetime


# =========================================================
# COMPANY ADMIN / PLATFORM ADMIN DETAIL RESPONSE
# =========================================================

class OrganizationDetailsResponse(OrganizationResponse):
    registration_number: str | None = None
    company_email: str | None = None
    company_phone: str | None = None
    address: str | None = None

    contact_person_name: str | None = None
    contact_person_position: str | None = None

    declaration_accepted_at: datetime | None = None
    submitted_at: datetime | None = None

    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    review_reason: str | None = None


# =========================================================
# ORGANIZATION MEMBER RESPONSE
# =========================================================

class OrganizationMemberResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    user_id: int
    full_name: str | None = None
    email: EmailStr
    member_role: str
    joined_at: datetime

    # =========================================================
# COMPANY VERIFICATION DOCUMENT RESPONSE
# Private storage_key is intentionally excluded.
# =========================================================

class OrganizationVerificationDocumentResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    organization_id: int
    uploaded_by: int

    document_type: str
    original_filename: str
    content_type: str
    file_size: int

    created_at: datetime

    # =========================================================
# VERIFICATION REVIEW HISTORY RESPONSE
# =========================================================

class OrganizationVerificationReviewResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    organization_id: int
    reviewed_by: int

    decision: Literal["approved", "rejected"]
    reason: str

    submitted_at: datetime
    reviewed_at: datetime

    # =========================================================
# COMPANY EMAIL VERIFICATION
# =========================================================

class OrganizationEmailVerify(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    token: str = Field(
        min_length=40,
        max_length=200,
    )


class OrganizationEmailVerificationResult(BaseModel):
    message: str