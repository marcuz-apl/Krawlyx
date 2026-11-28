"""Normalize databases that already passed both historical engine revisions.

Revision ID: 26b6110f2c03
Revises: a9b8c7d6e5f4
"""

from alembic import op

revision = "26b6110f2c03"
down_revision = "a9b8c7d6e5f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    repair = op.get_context().script.get_revision("26b6110f2c01").module
    repair.normalize_engine_types("type IN ('playtrafi','scrapy','patroy')")


def downgrade() -> None:
    # The current parent revision already uses the normalized engine type.
    pass
