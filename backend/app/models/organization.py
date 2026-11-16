from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String(150),
        nullable=False,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    # Company details
    registration_number = Column(
        String(100),
        nullable=True,
    )

    company_email = Column(
        String(255),
        nullable=True,
    )

    company_phone = Column(
        String(30),
        nullable=True,
    )

    address = Column(
        String(1000),
        nullable=True,
    )

    # Company representative
    contact_person_name = Column(
        String(100),
        nullable=True,
    )

    contact_person_position = Column(
        String(100),
        nullable=True,
    )

    declaration_accepted_at = Column(
        DateTime,
        nullable=True,
    )

    # Verification
    verification_status = Column(
        String(30),
        nullable=False,
        default="unsubmitted",
        server_default="unsubmitted",
        index=True,
    )

    submitted_at = Column(
        DateTime,
        nullable=True,
    )

    reviewed_by = Column(
        Integer,
        ForeignKey(
            "users.id",
            name="fk_organizations_reviewer",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )

    reviewed_at = Column(
        DateTime,
        nullable=True,
    )

    review_reason = Column(
        Text,
        nullable=True,
    )

    # Timestamps
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    creator = relationship(
        "User",
        foreign_keys=[created_by],
    )

    reviewer = relationship(
        "User",
        foreign_keys=[reviewed_by],
    )

    members = relationship(
        "OrganizationMember",
        back_populates="organization",
        cascade="all, delete-orphan",
    )