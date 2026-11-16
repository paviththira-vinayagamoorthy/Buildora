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
)
from sqlalchemy.orm import relationship

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

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

    certificate_id = Column(
        Integer,
        ForeignKey("certificates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    recorded_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    idempotency_key = Column(
        String(36),
        nullable=True,
        unique=True,
    )

    payment_date = Column(
        Date,
        nullable=False,
    )

    amount = Column(
        Numeric(15, 2),
        nullable=False,
    )

    payment_method = Column(
        String(30),
        nullable=False,
    )

    reference = Column(
        String(100),
        nullable=True,
    )

    notes = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    project = relationship(
        "Project",
        foreign_keys=[project_id],
    )

    certificate = relationship(
        "Certificate",
        foreign_keys=[certificate_id],
    )

    recorder = relationship(
        "User",
        foreign_keys=[recorded_by],
    )