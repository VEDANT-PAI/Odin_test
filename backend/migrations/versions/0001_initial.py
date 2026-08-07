"""Create Odin catalog tables."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("books", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("title", sa.String(500), nullable=False), sa.Column("authors", sa.String(500), nullable=False), sa.Column("average_rating", sa.Float(), nullable=False), sa.Column("ratings_count", sa.Integer(), nullable=False), sa.Column("image_url", sa.Text()), sa.Column("small_image_url", sa.Text()), sa.Column("original_title", sa.String(500)), sa.Column("language_code", sa.String(20)), sa.Column("publication_year", sa.Float()), sa.Column("isbn", sa.String(20)))
    op.create_table("tags", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(200), nullable=False))
    op.create_table("ratings", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), nullable=False), sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False), sa.Column("rating", sa.Integer(), nullable=False))
    op.create_table("book_tag_links", sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), primary_key=True), sa.Column("tag_id", sa.Integer(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True))
    op.create_table("recommendation_events", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="SET NULL")), sa.Column("recommendation_type", sa.String(50), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_index("ix_books_title", "books", ["title"])
    op.create_index("ix_books_popularity", "books", ["ratings_count", "average_rating"])
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_index("ix_ratings_book_id", "ratings", ["book_id"])
    op.create_index("ix_ratings_user_id", "ratings", ["user_id"])

def downgrade() -> None:
    op.drop_table("recommendation_events")
    op.drop_table("book_tag_links")
    op.drop_table("ratings")
    op.drop_table("tags")
    op.drop_table("books")
