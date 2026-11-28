"""Normalize databases that already added Patroy under the old browser name.

Revision ID: 26b6110f2c02
Revises: f6a7b8c9d0e1
"""

from alembic import op

revision = "26b6110f2c02"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    repair = op.get_context().script.get_revision("26b6110f2c01").module
    repair.normalize_engine_types("type IN ('playtrafi','scrapy','patroy')")


def downgrade() -> None:
    # The current parent revision already uses the normalized engine type.
    pass
