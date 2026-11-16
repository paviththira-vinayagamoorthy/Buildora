"""add organization subscriptions

Revision ID: dffe835bc7a7
Revises: a5496b8f4421
Create Date: 2026-11-10 12:45:46.565112

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dffe835bc7a7'
down_revision: Union[str, Sequence[str], None] = 'a5496b8f4421'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_subscriptions",
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("plan_code", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("organization_id"),
    )


def downgrade() -> None:
    op.drop_table("organization_subscriptions")