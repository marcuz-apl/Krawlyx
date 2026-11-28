"""Add decision status to contact messages (access requests).

Revision ID: d2e3f4a5b6c7
Revises: 8a1b2c3d4e5f
"""

import sqlalchemy as sa

from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "8a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
    )
    op.execute("UPDATE messages SET status = 'granted' WHERE reviewed_at IS NOT NULL")
    with op.batch_alter_table("messages") as batch_op:
        batch_op.create_check_constraint(
            "ck_messages_status", "status IN ('pending','granted','rejected')"
        )


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.drop_constraint("ck_messages_status", type_="check")
        batch_op.drop_column("status")
