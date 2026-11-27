"""add messages table for the contact page

Revision ID: a9b8c7d6e5f4
Revises: 7b8c9d0e1f2a
Create Date: 2026-11-27 13:20:00.000000

Contact form submissions from the public /contact page (sister-project
parity with DiaBit). POST is open (no auth); listing is admin-only.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a9b8c7d6e5f4"
down_revision: str | None = "7b8c9d0e1f2a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # init_db()/a previous interrupted run may have created the table already.
    if sa.inspect(op.get_bind()).has_table("messages"):
        return
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("messages")
