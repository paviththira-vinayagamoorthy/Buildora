from datetime import datetime
from decimal import Decimal

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


class Valuation(Base):
    __tablename__ = "valuations"

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "valuation_no",
            name="uq_valuation_project_number",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )

    boq_id = Column(
        Integer,
        ForeignKey("boqs.id"),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    valuation_no = Column(Integer, nullable=False)

    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)

    status = Column(
        String(30),
        nullable=False,
        default="draft",
    )

    notes = Column(Text, nullable=True)

    # Value of work included in this valuation period.
    total_amount = Column(
        Numeric(15, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    published_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    published_at = Column(DateTime, nullable=True)

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

    project = relationship("Project")
    boq = relationship("BOQ")

    creator = relationship(
        "User",
        foreign_keys=[created_by],
    )

    publisher = relationship(
        "User",
        foreign_keys=[published_by],
    )

    items = relationship(
        "ValuationItem",
        back_populates="valuation",
        cascade="all, delete-orphan",
        order_by="ValuationItem.id",
    )


class ValuationItem(Base):
    __tablename__ = "valuation_items"

    __table_args__ = (
        UniqueConstraint(
            "valuation_id",
            "boq_item_id",
            name="uq_valuation_boq_item",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    valuation_id = Column(
        Integer,
        ForeignKey("valuations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    boq_item_id = Column(
        Integer,
        ForeignKey("boq_items.id"),
        nullable=False,
        index=True,
    )

    # Snapshot: later BOQ changes must not change old valuations.
    item_no = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    unit = Column(String(50), nullable=False)

    boq_quantity = Column(
        Numeric(15, 3),
        nullable=False,
    )

    rate = Column(
        Numeric(15, 2),
        nullable=False,
    )

    # Previously published completed quantity.
    previous_quantity = Column(
        Numeric(15, 3),
        nullable=False,
        default=Decimal("0.000"),
    )

    # Total completed quantity up to this valuation.
    cumulative_quantity = Column(
        Numeric(15, 3),
        nullable=False,
        default=Decimal("0.000"),
    )

    # cumulative_quantity - previous_quantity
    current_quantity = Column(
        Numeric(15, 3),
        nullable=False,
        default=Decimal("0.000"),
    )

    # current_quantity × rate
    amount = Column(
        Numeric(15, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    valuation = relationship(
        "Valuation",
        back_populates="items",
    )

    boq_item = relationship("BOQItem")