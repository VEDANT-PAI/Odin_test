from collections import defaultdict

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from .models import Book, Rating, Tag


def popular_books(db: Session, limit: int = 12, genre: str | None = None) -> list[Book]:
    query = select(Book).options(selectinload(Book.tags))
    if genre:
        query = query.where(Book.tags.any(Tag.name.ilike(genre)))
    return list(db.scalars(query.order_by(desc(Book.ratings_count), desc(Book.average_rating), Book.title).limit(limit)))


def similar_books(db: Session, book: Book, limit: int = 12) -> list[Book]:
    tag_ids = [tag.id for tag in book.tags]
    query = select(Book).options(selectinload(Book.tags)).where(Book.id != book.id)
    if tag_ids:
        query = query.where(Book.tags.any(Tag.id.in_(tag_ids)))
    return list(db.scalars(query.order_by(desc(Book.average_rating), desc(Book.ratings_count), Book.title).limit(limit)))


def genre_combination_books(db: Session, genres: list[str], limit: int = 5) -> list[Book]:
    """Rank books by how many requested genre tags they share, then quality."""
    terms = {genre.strip().lower() for genre in genres if genre.strip()}
    if not terms:
        return []

    books = db.scalars(select(Book).options(selectinload(Book.tags))).all()
    matches: list[tuple[int, Book]] = []
    for book in books:
        tag_names = [tag.name.lower() for tag in book.tags]
        overlap = sum(any(term in tag_name for tag_name in tag_names) for term in terms)
        if overlap:
            matches.append((overlap, book))
    matches.sort(key=lambda item: (item[0], item[1].average_rating, item[1].ratings_count, item[1].title), reverse=True)
    return [book for _, book in matches[:limit]]


def ratings_based_books(db: Session, ratings: dict[int, int], limit: int = 5) -> list[Book]:
    """Lightweight item-item collaborative filtering based on co-ratings.

    Each selected book votes for books read by the same Goodreads users. This is
    the sparse, request-time counterpart to the baseline notebook's item-item
    similarity matrix and avoids materialising its dense matrix in the API.
    """
    seed_ids = set(ratings)
    seed_rows = db.scalars(select(Rating).where(Rating.book_id.in_(seed_ids))).all()
    if not seed_rows:
        return []

    seed_by_user: dict[int, list[Rating]] = defaultdict(list)
    for row in seed_rows:
        seed_by_user[row.user_id].append(row)
    candidate_rows = db.scalars(select(Rating).where(Rating.user_id.in_(seed_by_user))).all()
    scores: dict[int, float] = defaultdict(float)
    counts: dict[int, int] = defaultdict(int)
    for candidate in candidate_rows:
        if candidate.book_id in seed_ids:
            continue
        for seed in seed_by_user[candidate.user_id]:
            # Centre ratings around neutral (3) and give the user's own score
            # extra influence, mirroring an item-item similarity vote.
            preference = ratings[seed.book_id] - 3
            scores[candidate.book_id] += preference * (seed.rating - 3) * (candidate.rating - 3)
            counts[candidate.book_id] += 1

    ranked_ids = [book_id for book_id, _ in sorted(
        scores.items(), key=lambda item: (item[1] / max(counts[item[0]], 1), counts[item[0]]), reverse=True
    ) if counts[book_id]][:limit]
    if not ranked_ids:
        return []
    found = db.scalars(select(Book).where(Book.id.in_(ranked_ids))).all()
    by_id = {book.id: book for book in found}
    return [by_id[book_id] for book_id in ranked_ids if book_id in by_id]
