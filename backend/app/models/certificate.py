from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Certificate(Base):
    __tablename__ = "certificates"

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "certificate_no",
            name="uq_certificate_project_number",
        ),
        UniqueConstraint(
            "valuation_id",
            name="uq_certificate_valuation",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    valuation_id = Column(
        Integer,
        ForeignKey("valuations.id", ondelete="RESTRICT"),
        nullable=False,
    )

    certificate_no = Column(
        Integer,
        nullable=False,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    status = Column(
        String(30),
        nullable=False,
        default="draft",
    )

    # Snapshot of the published valuation's value
    # for this period.
    work_value = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    # Percentage entered by the QS: 0 to 100.
    retention_percentage = Column(
        Numeric(5, 2),
        nullable=False,
        default=0,
    )

    retention_amount = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    other_deductions = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    deduction_reason = Column(
        Text,
        nullable=True,
    )

    # work_value - retention_amount - other_deductions
    net_payable = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    notes = Column(
        Text,
        nullable=True,
    )

    published_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    published_at = Column(
        DateTime,
        nullable=True,
    )

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

    project = relationship(
        "Project",
        foreign_keys=[project_id],
    )

    valuation = relationship(
        "Valuation",
        foreign_keys=[valuation_id],
    )

    creator = relationship(
        "User",
        foreign_keys=[created_by],
    )

    publisher = relationship(
        "User",
        foreign_keys=[published_by],
    )