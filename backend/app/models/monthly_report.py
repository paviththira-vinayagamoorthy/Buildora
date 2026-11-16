from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
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


class MonthlyReport(Base):
    __tablename__ = "monthly_reports"

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "report_month",
            name="uq_monthly_report_project_month",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    # Store the first day of the reporting month.
    # Example: 2026-11-01 represents November 2026.
    report_month = Column(
        Date,
        nullable=False,
    )

    summary = Column(
        Text,
        nullable=False,
    )

    issues = Column(
        Text,
        nullable=True,
    )

    next_steps = Column(
        Text,
        nullable=True,
    )

    ai_explanation = Column(Text, nullable=True)

    # Latest published site progress available
    # for the report's cutoff.
    # NULL means no published progress is available.
    progress_percentage = Column(
        Numeric(5, 2),
        nullable=True,
    )

    # Payments made during the reporting month.
    payments_this_month = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    # Cumulative certificate and payment totals
    # as of the report's cutoff.
    certified_to_date = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    paid_to_date = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    outstanding_to_date = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    # Records when the report figures were calculated.
    snapshot_at = Column(
        DateTime,
        nullable=True,
    )

    status = Column(
        String(30),
        nullable=False,
        default="draft",
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

    creator = relationship(
        "User",
        foreign_keys=[created_by],
    )

    publisher = relationship(
        "User",
        foreign_keys=[published_by],
    )