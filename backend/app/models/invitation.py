from datetime import datetime

from sqlalchemy import (
    CHAR,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Invitation(Base):
    __tablename__ = "invitations"

    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uq_invitations_token_hash",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    organization_id = Column(
        Integer,
        ForeignKey(
            "organizations.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    invited_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    email = Column(
        String(255),
        nullable=False,
        index=True,
    )

    member_role = Column(
        String(50),
        nullable=False,
        default="staff",
    )

    status = Column(
        String(30),
        nullable=False,
        default="pending",
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    accepted_at = Column(
        DateTime,
        nullable=True,
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=True,
    )

    project_role = Column(
        String(50),
        nullable=True,
    )

    token_hash = Column(
        CHAR(64, collation="ascii_bin"),
        nullable=True,
    )

    expires_at = Column(
        DateTime,
        nullable=True,
    )

    last_send_attempt_at = Column(
        DateTime,
        nullable=True,
    )

    sent_at = Column(
        DateTime,
        nullable=True,
    )

    revoked_at = Column(
        DateTime,
        nullable=True,
    )

    organization = relationship(
        "Organization",
        foreign_keys=[organization_id],
    )

    inviter = relationship(
        "User",
        foreign_keys=[invited_by],
    )

    project = relationship(
        "Project",
        foreign_keys=[project_id],
    )