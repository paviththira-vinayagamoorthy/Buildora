from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


DocumentCategory = Literal[
    "drawing",
    "invoice",
    "receipt",
    "site_photo",
    "other",
]


class DocumentCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    title: str = Field(
        min_length=1,
        max_length=255,
    )

    category: DocumentCategory = "other"

    description: str | None = Field(
        default=None,
        max_length=2000,
    )


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    uploaded_by: int

    title: str
    category: DocumentCategory
    description: str | None

    original_filename: str
    content_type: str
    file_size: int

    created_at: datetime