"""add project fields to invitations

Revision ID: dfdd77f702c7
Revises:
Create Date: 2026-10-29 12:27:53.730257
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "dfdd77f702c7"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invitations",
        sa.Column(
            "project_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "invitations",
        sa.Column(
            "project_role",
            sa.String(length=50),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_invitations_project_id",
        "invitations",
        "projects",
        ["project_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_invitations_project_id",
        "invitations",
        type_="foreignkey",
    )

    op.drop_column(
        "invitations",
        "project_role",
    )

    op.drop_column(
        "invitations",
        "project_id",
    )