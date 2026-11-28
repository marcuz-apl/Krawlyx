"""Drop the legacy global MFA policy setting (per-account enforcement replaces it).

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
"""

from alembic import op

revision = "c7d8e9f0a1b2"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'mfa_required'")


def downgrade() -> None:
    pass