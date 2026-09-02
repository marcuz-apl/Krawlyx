"""replace crawl4ai with playtrafi in engines check constraint

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-02 10:35:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Temporarily ignore check constraints to allow migrating 'crawl4ai' rows to 'playtrafi'
    op.execute("PRAGMA ignore_check_constraints = ON")
    op.execute("UPDATE engines SET type = 'playtrafi' WHERE type = 'crawl4ai'")
    op.execute(
        "UPDATE engines SET name = 'Playtrafi Local' WHERE name IN ('Crawl4AI Local', 'crawl4ai', 'Crawl4AI')"
    )
    op.execute("PRAGMA ignore_check_constraints = OFF")

    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('playtrafi','scrapy')",
        )


def downgrade() -> None:
    op.execute("PRAGMA ignore_check_constraints = ON")
    op.execute("UPDATE engines SET type = 'crawl4ai' WHERE type = 'playtrafi'")
    op.execute("UPDATE engines SET name = 'Crawl4AI Local' WHERE name = 'Playtrafi Local'")
    op.execute("PRAGMA ignore_check_constraints = OFF")

    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.create_check_constraint(
            "ck_engines_type",
            "type IN ('crawl4ai','scrapy')",
        )
