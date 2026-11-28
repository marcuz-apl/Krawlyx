"""Track review timestamps for account access requests.

Revision ID: 26b6110f2c04
Revises: 26b6110f2c03
"""

import sqlalchemy as sa

from alembic import op

revision = "26b6110f2c04"
down_revision = "26b6110f2c03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("reviewed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.drop_column("reviewed_at")
