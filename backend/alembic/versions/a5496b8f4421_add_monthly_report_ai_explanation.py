"""add monthly report AI explanation

Revision ID: a5496b8f4421
Revises: 74a3df5571c1
Create Date: 2026-11-10 11:49:23.824217

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5496b8f4421'
down_revision: Union[str, Sequence[str], None] = '74a3df5571c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "monthly_reports",
        sa.Column("ai_explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("monthly_reports", "ai_explanation")