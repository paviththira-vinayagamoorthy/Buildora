from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class OrganizationVerificationDocument(Base):
    __tablename__ = "organization_verification_documents"

    __table_args__ = (
        UniqueConstraint(
            "storage_key",
            name="uq_org_verification_document_storage",
        ),
        Index(
            "ix_org_verification_documents_organization_id",
            "organization_id",
        ),
        Index(
            "ix_org_verification_documents_uploaded_by",
            "uploaded_by",
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
            name="fk_org_verification_documents_organization",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    uploaded_by = Column(
        Integer,
        ForeignKey(
            "users.id",
            name="fk_org_verification_documents_uploader",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    document_type = Column(
        String(50),
        nullable=False,
    )

    original_filename = Column(
        String(255),
        nullable=False,
    )

    storage_key = Column(
        String(255),
        nullable=False,
    )

    content_type = Column(
        String(100),
        nullable=False,
    )

    file_size = Column(
        Integer,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    organization = relationship(
        "Organization",
        foreign_keys=[organization_id],
    )

    uploader = relationship(
        "User",
        foreign_keys=[uploaded_by],
    )