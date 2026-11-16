from typing import Literal

from pydantic import SecretStr
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    # DATABASE
    DATABASE_URL: str

    # JWT AUTHENTICATION
    SECRET_KEY: str
    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # GOOGLE AUTHENTICATION
    GOOGLE_CLIENT_ID: str

    # FRONTEND
    FRONTEND_URL: str = "http://localhost:5173"

    # EMAIL
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587

    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: SecretStr = SecretStr("")

    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Buildora"

    SMTP_SECURITY: Literal["starttls", "ssl"] = "starttls"
    SMTP_TIMEOUT_SECONDS: int = 15
    GROQ_API_KEY: SecretStr = SecretStr("")

    COMPANY_EMAIL_TOKEN_EXPIRE_MINUTES: int = 30

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # ENV CONFIGURATION
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()