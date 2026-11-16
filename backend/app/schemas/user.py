from datetime import datetime

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    ConfigDict,
)

import base64
import binascii

# -------------------------
# USER REGISTER
# -------------------------

class UserCreate(BaseModel):
    full_name: str = Field(
        min_length=2,
        max_length=100
    )

    email: EmailStr

    phone: str | None = Field(
        default=None,
        max_length=20
    )

    password: str = Field(
        min_length=8,
        max_length=128
    )


# -------------------------
# USER RESPONSE
# -------------------------

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str | None
    photo_data: str | None = None
    system_role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


# -------------------------
# USER LOGIN
# -------------------------

class UserLogin(BaseModel):
    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128
    )


# -------------------------
# GOOGLE LOGIN REQUEST
# -------------------------

class GoogleLoginRequest(BaseModel):
    credential: str = Field(
        min_length=1
    )


# -------------------------
# LOGIN TOKEN RESPONSE
# -------------------------

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# -------------------------
# REFRESH TOKEN REQUEST
# -------------------------

class RefreshTokenRequest(BaseModel):
    refresh_token: str


# -------------------------
# NEW ACCESS TOKEN RESPONSE
# -------------------------

class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

    # -------------------------
# UPDATE MY PROFILE
# -------------------------

from pydantic import field_validator


class UserProfileUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    full_name: str = Field(
        min_length=2,
        max_length=100,
    )

    photo_data: str | None = Field(default=None, max_length=700_000)

    @field_validator("photo_data")
    @classmethod
    def validate_photo_data(cls, value):
        if value is None:
            return value

        header, _, encoded = value.partition(",")
        signatures = {
            "data:image/jpeg;base64": b"\xff\xd8\xff",
            "data:image/png;base64": b"\x89PNG\r\n\x1a\n",
        }

        if header not in signatures:
            raise ValueError("Choose a JPG or PNG profile photo.")

        try:
            image = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError("The profile photo is invalid.") from error

        if not image.startswith(signatures[header]):
            raise ValueError("The profile photo is invalid.")

        if len(image) > 512 * 1024:
            raise ValueError("Choose a photo smaller than 512 KB.")

        return value

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value):
        value = " ".join(value.split())

        if len(value) < 2:
            raise ValueError(
                "Enter a name with at least 2 characters."
            )

        if not any(character.isalpha() for character in value):
            raise ValueError(
                "Your name must contain letters."
            )

        return value