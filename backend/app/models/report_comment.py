from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class ReportComment(Base):
    __tablename__ = "report_comments"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_id = Column(
        Integer,
        ForeignKey(
            "monthly_reports.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    message = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    report = relationship(
        "MonthlyReport",
        foreign_keys=[report_id],
    )

    author = relationship(
        "User",
        foreign_keys=[created_by],
    )