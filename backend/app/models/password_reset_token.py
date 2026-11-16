from datetime import datetime

from sqlalchemy import (
    CHAR,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uq_password_reset_tokens_hash",
        ),
        Index(
            "ix_password_reset_tokens_user_created",
            "user_id",
            "created_at",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    user_id = Column(
        Integer,
        ForeignKey(
            "users.id",
            name="fk_password_reset_tokens_user",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    token_hash = Column(
        CHAR(64, collation="ascii_bin"),
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    expires_at = Column(
        DateTime,
        nullable=False,
    )

    used_at = Column(
        DateTime,
        nullable=True,
    )

    invalidated_at = Column(
        DateTime,
        nullable=True,
    )

    user = relationship(
        "User",
        foreign_keys=[user_id],
    )