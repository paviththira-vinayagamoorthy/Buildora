from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    email: EmailStr = Field(
        max_length=255,
    )


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    token: str = Field(
        min_length=40,
        max_length=200,
    )

    password: str = Field(
        min_length=8,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=8,
        max_length=128,
    )

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        allowed = (
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "abcdefghijklmnopqrstuvwxyz"
            "0123456789-_"
        )

        if any(character not in allowed for character in value):
            raise ValueError("Invalid password reset link.")

        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError(
                "Password cannot contain only whitespace."
            )

        # Preserve the exact password, including intentional spaces.
        return value

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")

        return self


class PasswordResetMessage(BaseModel):
    message: str