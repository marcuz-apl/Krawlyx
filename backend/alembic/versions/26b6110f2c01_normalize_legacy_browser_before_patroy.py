"""Normalize legacy browser rows before adding Patroy.

Revision ID: 26b6110f2c01
Revises: e5f6a7b8c9d0
"""

import sqlalchemy as sa

from alembic import op

revision = "26b6110f2c01"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def normalize_engine_types(check_sql: str) -> None:
    conn = op.get_bind()
    checks = sa.inspect(conn).get_check_constraints("engines")
    if not any(
        check["name"] == "ck_engines_type" and "'patchtroy'" in check["sqltext"] for check in checks
    ):
        return

    # Some released revisions permit only the old name. The following batch
    # copy validates every row against the replacement CHECK constraint.
    conn.exec_driver_sql("PRAGMA ignore_check_constraints = ON")
    try:
        op.execute("UPDATE engines SET type = 'playtrafi' WHERE type = 'patchtroy'")
    finally:
        conn.exec_driver_sql("PRAGMA ignore_check_constraints = OFF")

    with op.batch_alter_table("engines", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_engines_type", type_="check")
        batch_op.create_check_constraint("ck_engines_type", check_sql)


def upgrade() -> None:
    normalize_engine_types("type IN ('playtrafi','scrapy')")


def downgrade() -> None:
    # The current parent revision already uses the normalized engine type.
    pass
