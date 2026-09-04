"""add patroy engine type to engines check constraint

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-03 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('playtrafi','scrapy','patroy')",
        )


def downgrade() -> None:
    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('playtrafi','scrapy')",
        )
