"""Allow long Goodreads author lists."""
from alembic import op
import sqlalchemy as sa

revision = "0002_authors_text"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.alter_column("authors", existing_type=sa.String(length=500), type_=sa.Text(), existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.alter_column("authors", existing_type=sa.Text(), type_=sa.String(length=500), existing_nullable=False)

