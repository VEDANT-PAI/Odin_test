from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


book_tag_links = Table(
    "book_tag_links",
    Base.metadata,
    Column("book_id", ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (
        Index("ix_books_popularity", "ratings_count", "average_rating"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500), index=True)
    authors: Mapped[str] = mapped_column(Text, default="Unknown author")
    average_rating: Mapped[float] = mapped_column(Float, default=0)
    ratings_count: Mapped[int] = mapped_column(Integer, default=0)
    image_url: Mapped[str | None] = mapped_column(Text)
    small_image_url: Mapped[str | None] = mapped_column(Text)
    original_title: Mapped[str | None] = mapped_column(String(500))
    language_code: Mapped[str | None] = mapped_column(String(20))
    publication_year: Mapped[float | None] = mapped_column(Float)
    isbn: Mapped[str | None] = mapped_column(String(20))

    tags: Mapped[list["Tag"]] = relationship(secondary=book_tag_links, back_populates="books")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (Index("ix_tags_name", "name", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    books: Mapped[list[Book]] = relationship(secondary=book_tag_links, back_populates="tags")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (Index("ix_ratings_book_id", "book_id"), Index("ix_ratings_user_id", "user_id"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)


class RecommendationEvent(Base):
    __tablename__ = "recommendation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_book_id: Mapped[int | None] = mapped_column(ForeignKey("books.id", ondelete="SET NULL"))
    recommendation_type: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
