from datetime import datetime

from sqlalchemy import (
    CHAR,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class OrganizationEmailVerification(Base):
    __tablename__ = "organization_email_verifications"

    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uq_org_email_verifications_token_hash",
        ),
        Index(
            "ix_org_email_verifications_organization_created",
            "organization_id",
            "created_at",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    organization_id = Column(
        Integer,
        ForeignKey(
            "organizations.id",
            name="fk_org_email_verifications_organization",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    requested_by = Column(
        Integer,
        ForeignKey(
            "users.id",
            name="fk_org_email_verifications_requester",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    email = Column(
        String(255),
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

    sent_at = Column(
        DateTime,
        nullable=True,
    )

    consumed_at = Column(
        DateTime,
        nullable=True,
    )

    invalidated_at = Column(
        DateTime,
        nullable=True,
    )

    organization = relationship(
        "Organization",
        foreign_keys=[organization_id],
    )

    requester = relationship(
        "User",
        foreign_keys=[requested_by],
    )