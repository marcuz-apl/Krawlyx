"""replace playtrafi/crawl4ai with patchtroy in engines check constraint

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-02 11:32:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Temporarily ignore check constraints to allow migrating 'playtrafi'/'crawl4ai' rows to 'patchtroy'
    op.execute("PRAGMA ignore_check_constraints = ON")
    op.execute("UPDATE engines SET type = 'patchtroy' WHERE type IN ('playtrafi', 'crawl4ai')")
    op.execute(
        "UPDATE engines SET name = 'Patchtroy (Stealth Browser & Dynamic JS)' WHERE type = 'patchtroy'"
    )
    op.execute("PRAGMA ignore_check_constraints = OFF")

    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('patchtroy','scrapy')",
        )


def downgrade() -> None:
    op.execute("PRAGMA ignore_check_constraints = ON")
    op.execute("UPDATE engines SET type = 'playtrafi' WHERE type = 'patchtroy'")
    op.execute(
        "UPDATE engines SET name = 'Playtrafi (Browser & JS Dynamic)' WHERE type = 'playtrafi'"
    )
    op.execute("PRAGMA ignore_check_constraints = OFF")

    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('playtrafi','scrapy')",
        )
