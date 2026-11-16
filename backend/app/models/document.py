from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "supplier_name",
            "invoice_number",
            name="uq_documents_project_supplier_invoice",
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

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    title = Column(String(255), nullable=False)

    # drawing, invoice, receipt, site_photo, other
    category = Column(String(30), nullable=False, default="other")

    description = Column(Text, nullable=True)
    supplier_name = Column(String(150), nullable=True)
    invoice_number = Column(String(100), nullable=True)

    # Original filename displayed to the user.
    original_filename = Column(String(255), nullable=False)

    # Unique internal storage key.
    storage_key = Column(String(255), nullable=False, unique=True)

    content_type = Column(String(100), nullable=False)

    # File size in bytes.
    file_size = Column(Integer, nullable=False)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    project = relationship(
        "Project",
        foreign_keys=[project_id],
    )

    uploader = relationship(
        "User",
        foreign_keys=[uploaded_by],
    )