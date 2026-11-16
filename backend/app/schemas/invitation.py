from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    model_validator,
)


class InvitationCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    email: EmailStr

    member_role: Literal["qs", "staff"] = "staff"

    project_id: int | None = Field(
        default=None,
        gt=0,
    )

    project_role: Literal["qs", "building_owner"] | None = None

    @model_validator(mode="after")
    def validate_project_invitation(self):
        if self.project_id is not None:
            if self.project_role is None:
                raise ValueError(
                    "Select QS or Building Owner "
                    "for a project invitation."
                )

            # Project role determines organization membership.
            self.member_role = (
                "qs"
                if self.project_role == "qs"
                else "staff"
            )

        elif self.project_role is not None:
            raise ValueError(
                "A project is required when selecting "
                "a project role."
            )

        return self


class InvitationResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    organization_id: int
    invited_by: int

    email: EmailStr
    member_role: str
    status: str

    created_at: datetime
    accepted_at: datetime | None = None

    project_id: int | None = None
    project_role: str | None = None

    expires_at: datetime | None = None
    last_send_attempt_at: datetime | None = None
    sent_at: datetime | None = None
    revoked_at: datetime | None = None


class InvitationTokenRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    token: str = Field(
        min_length=40,
        max_length=200,
    )