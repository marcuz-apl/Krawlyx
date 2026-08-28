"""add Job.export_target_id FK

Revision ID: 9c1a2b3d4e5f
Revises: 358c747f5742
Create Date: 2026-08-28 10:30:00.000000

M4 (Export, PRD §6.4): a Job may reference an ExportTarget so its results
stream to a folder as CSV/XLSX in addition to the SQLite DB (FR-EXP-03).
The column is nullable because the M3 default (database-only) still works.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9c1a2b3d4e5f"
down_revision: str | None = "358c747f5742"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(
            sa.Column("export_target_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_jobs_export_target_id",
            "export_targets",
            ["export_target_id"],
            ["id"],
        )
        batch_op.create_index(
            "ix_jobs_export_target", ["export_target_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_index("ix_jobs_export_target")
        batch_op.drop_constraint("fk_jobs_export_target_id", type_="foreignkey")
        batch_op.drop_column("export_target_id")
