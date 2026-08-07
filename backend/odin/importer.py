import csv
from pathlib import Path
from typing import Iterator

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.orm import Session

from .models import Book, Tag, book_tag_links


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def read_rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="replace") as handle:
        yield from csv.DictReader(handle)


def import_books(db: Session, csv_path: Path, batch_size: int = 500) -> int:
    count = 0
    for row in read_rows(csv_path):
        book_id = int(row["book_id"])
        book = db.get(Book, book_id)
        if book is None:
            book = Book(id=book_id, title=_clean(row.get("title")) or "Untitled", authors=_clean(row.get("authors")) or "Unknown author")
            db.add(book)
        book.average_rating = float(row.get("average_rating") or 0)
        book.ratings_count = int(float(row.get("ratings_count") or 0))
        book.image_url = _clean(row.get("image_url"))
        book.small_image_url = _clean(row.get("small_image_url"))
        book.original_title = _clean(row.get("original_title"))
        book.language_code = _clean(row.get("language_code"))
        book.publication_year = float(row["original_publication_year"]) if _clean(row.get("original_publication_year")) else None
        book.isbn = _clean(row.get("isbn"))
        count += 1
        if count % batch_size == 0:
            db.commit()
    db.commit()
    return count


def import_tags(db: Session, tags_path: Path, book_tags_path: Path, batch_size: int = 1000) -> int:
    for row in read_rows(tags_path):
        db.merge(Tag(id=int(row["tag_id"]), name=_clean(row.get("tag_name")) or "untagged"))
    db.commit()
    book_ids = set(db.scalars(select(Book.id)))
    tag_ids = set(db.scalars(select(Tag.id)))
    relationships: set[tuple[int, int]] = set()
    for row in read_rows(book_tags_path):
        book_id = int(row["goodreads_book_id"])
        tag_id = int(row["tag_id"])
        if book_id in book_ids and tag_id in tag_ids:
            relationships.add((book_id, tag_id))
    links = [{"book_id": book_id, "tag_id": tag_id} for book_id, tag_id in relationships]
    for start in range(0, len(links), batch_size):
        statement = postgres_insert(book_tag_links).on_conflict_do_nothing(index_elements=["book_id", "tag_id"])
        db.execute(statement, links[start : start + batch_size])
        db.commit()
    return len(links)
