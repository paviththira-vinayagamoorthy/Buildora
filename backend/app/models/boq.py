from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class BOQ(Base):
    __tablename__ = "boqs"

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

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    title = Column(
        String(255),
        nullable=False,
        default="Initial BOQ",
    )

    revision = Column(
        String(20),
        nullable=False,
        default="00",
    )

    status = Column(
        String(30),
        nullable=False,
        default="draft",
    )

    notes = Column(Text, nullable=True)

    source_boq_id = Column(
        Integer,
        ForeignKey("boqs.id"),
        nullable=True,
    )

    revision_reason = Column(
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

    total_amount = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
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

    project = relationship("Project")

    creator = relationship(
        "User",
        foreign_keys=[created_by],
    )

    publisher = relationship(
        "User",
        foreign_keys=[published_by],
    )

    source_boq = relationship(
        "BOQ",
        remote_side=[id],
        foreign_keys=[source_boq_id],
    )

    items = relationship(
        "BOQItem",
        back_populates="boq",
        cascade="all, delete-orphan",
        order_by="BOQItem.id",
    )


class BOQItem(Base):
    __tablename__ = "boq_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    boq_id = Column(
        Integer,
        ForeignKey("boqs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_item_id = Column(
    Integer,
    ForeignKey("boq_items.id"),
    nullable=True,
    index=True,
)

    item_no = Column(
        String(50),
        nullable=False,
    )

    description = Column(
        Text,
        nullable=False,
    )

    unit = Column(
        String(50),
        nullable=False,
    )

    quantity = Column(
        Numeric(15, 3),
        nullable=False,
        default=0,
    )

    rate = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
    )

    amount = Column(
        Numeric(15, 2),
        nullable=False,
        default=0,
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

    boq = relationship(
        "BOQ",
        back_populates="items",
    )