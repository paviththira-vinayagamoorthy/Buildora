from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class OrganizationVerificationReview(Base):
    __tablename__ = "organization_verification_reviews"

    __table_args__ = (
        Index(
            "ix_org_verification_reviews_organization_id",
            "organization_id",
        ),
        Index(
            "ix_org_verification_reviews_reviewed_by",
            "reviewed_by",
        ),
        CheckConstraint(
            "decision IN ('approved', 'rejected')",
            name="ck_org_verification_reviews_decision",
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
            name="fk_org_verification_reviews_organization",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    reviewed_by = Column(
        Integer,
        ForeignKey(
            "users.id",
            name="fk_org_verification_reviews_reviewer",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    decision = Column(String(30), nullable=False)
    reason = Column(Text, nullable=False)
    submitted_at = Column(DateTime, nullable=False)

    reviewed_at = Column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    organization = relationship(
        "Organization",
        foreign_keys=[organization_id],
    )

    reviewer = relationship(
        "User",
        foreign_keys=[reviewed_by],
    )