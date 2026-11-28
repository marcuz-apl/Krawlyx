"""Add per-user MFA enforcement flag.

Revision ID: b6c7d8e9f0a1
Revises: f4a5b6c7d8e9
"""

import sqlalchemy as sa

from alembic import op

revision = "b6c7d8e9f0a1"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mfa_required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("mfa_required")