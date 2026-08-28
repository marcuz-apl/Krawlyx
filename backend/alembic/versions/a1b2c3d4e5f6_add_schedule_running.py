"""add Schedule.running lock column

Revision ID: a1b2c3d4e5f6
Revises: 9c1a2b3d4e5f
Create Date: 2026-08-28 12:00:00.000000

M5 (Scheduler, PRD §6.3 FR-SCH-03): a coarse `running` boolean
prevents overlapping firings of the same schedule. The cron tick
acquires the flag with an atomic UPDATE ... WHERE running=0; if
rowcount is 0 the tick is skipped. The flag is released when the
spawned Job reaches a terminal state.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "9c1a2b3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("schedules") as batch_op:
        batch_op.add_column(
            sa.Column(
                "running",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("schedules") as batch_op:
        batch_op.drop_column("running")
