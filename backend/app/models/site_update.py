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


class SiteUpdate(Base):
    __tablename__ = "site_updates"

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

    update_date = Column(
        Date,
        nullable=False,
        index=True,
    )

    title = Column(
        String(255),
        nullable=False,
    )

    work_completed = Column(
        Text,
        nullable=False,
    )

    # Overall project completion reported by the QS.
    # This is not calculated from payment amounts.
    progress_percentage = Column(
        Numeric(5, 2),
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