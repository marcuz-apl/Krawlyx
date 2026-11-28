"""Add unique email to users for access-request association.

Revision ID: 8a1b2c3d4e5f
Revises: 26b6110f2c04
"""

import sqlalchemy as sa

from alembic import op

revision = "8a1b2c3d4e5f"
down_revision = "26b6110f2c04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=200), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("email")
