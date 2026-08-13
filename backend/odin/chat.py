"""Deterministic intent handling for the conversational recommendation endpoint."""

import re
from dataclasses import dataclass

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from .models import Book
from .recommendations import genre_combination_books, popular_books, similar_books


GENRE_KEYWORDS = {
    "science fiction": ("science fiction", "sci-fi", "sci fi"),
    "fantasy": ("fantasy",),
    "romance": ("romance", "romantic"),
    "mystery": ("mystery", "mysterious", "detective"),
    "thriller": ("thriller", "suspense"),
    "horror": ("horror",),
    "historical": ("historical", "history"),
    "young adult": ("young adult", "ya"),
    "fiction": ("fiction",),
    "nonfiction": ("nonfiction", "non-fiction"),
    "biography": ("biography", "memoir"),
    "adventure": ("adventure",),
}
MOOD_KEYWORDS = {
    "dark": ("dark", "darker"),
    "cozy": ("cozy",),
    "hopeful": ("hopeful",),
    "funny": ("humor", "funny"),
    "quiet": ("quiet",),
}
SIMILAR_PATTERN = re.compile(r"(?:like|similar to|reminds? me of)\s+(.+?)(?:[?.!,]|$)", re.IGNORECASE)
AUTHOR_PATTERN = re.compile(r"(?:books?|works?)\s+by\s+(.+?)(?:[?.!,]|$)", re.IGNORECASE)
BOOK_SEARCH_PATTERN = re.compile(r"(?:find|search for|tell me about)\s+(?:the book\s+)?(.+?)(?:[?.!]|$)", re.IGNORECASE)


@dataclass(frozen=True)
class ChatIntent:
    name: str
    genres: list[str]
    title: str | None = None
    author: str | None = None


def _keywords_in(text: str, keyword_map: dict[str, tuple[str, ...]]) -> list[str]:
    lowered = text.lower()
    return [
        name
        for name, aliases in keyword_map.items()
        if any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", lowered) for alias in aliases)
    ]


def detect_intent(message: str, history: list[str] | None = None) -> ChatIntent:
    """Classify a small set of useful book requests without relying on the LLM."""
    normalized = message.strip()
    lowered = normalized.lower()
    requested_genres = _keywords_in(normalized, GENRE_KEYWORDS)
    moods = _keywords_in(normalized, MOOD_KEYWORDS)
    genres = list(dict.fromkeys([*requested_genres, *moods]))[:6]

    # Preserve the most recent preference for short refinements such as
    # "make it darker". This remains request-scoped; no chat state is stored.
    if history:
        inherited: list[str] = []
        for previous in reversed(history):
            inherited.extend(_keywords_in(previous, GENRE_KEYWORDS))
            inherited.extend(_keywords_in(previous, MOOD_KEYWORDS))
            if inherited:
                break
        genres = list(dict.fromkeys([*genres, *inherited]))[:6]

    similar_match = SIMILAR_PATTERN.search(normalized)
    if similar_match:
        return ChatIntent("similar_book", genres, title=similar_match.group(1).strip(" '\""))

    author_match = AUTHOR_PATTERN.search(normalized)
    if author_match:
        return ChatIntent("author_search", genres, author=author_match.group(1).strip(" '\""))

    if re.fullmatch(r"(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: odin)?[!. ]*", lowered):
        return ChatIntent("greeting", genres)

    book_match = BOOK_SEARCH_PATTERN.search(normalized)
    if book_match and not genres:
        return ChatIntent("book_search", genres, title=book_match.group(1).strip(" '\""))

    if genres:
        return ChatIntent("genre_recommendation", genres)

    if any(token in lowered for token in ("recommend", "suggest", "what should i read", "something to read")):
        return ChatIntent("recommendation", genres)

    if lowered.endswith("?"):
        return ChatIntent("general_book_question", genres)

    return ChatIntent("recommendation", genres)


def _search_books(db: Session, term: str, *, authors_only: bool = False, limit: int = 5) -> list[Book]:
    pattern = f"%{term.strip().lower()}%"
    field = func.lower(Book.authors) if authors_only else func.lower(Book.title)
    query = select(Book).options(selectinload(Book.tags)).where(field.like(pattern))
    return list(db.scalars(query.order_by(Book.ratings_count.desc(), Book.average_rating.desc()).limit(limit)))


def _book_by_title(db: Session, title: str) -> Book | None:
    pattern = f"%{title.strip().lower()}%"
    exact = case((func.lower(Book.title) == title.strip().lower(), 0), else_=1)
    return db.scalar(
        select(Book)
        .options(selectinload(Book.tags))
        .where(func.lower(Book.title).like(pattern))
        .order_by(exact, Book.ratings_count.desc(), Book.average_rating.desc())
        .limit(1)
    )


def choose_recommendations(db: Session, intent: ChatIntent, limit: int = 5) -> tuple[list[Book], str]:
    """Select catalog books using Odin's existing deterministic recommendation functions."""
    if intent.name == "similar_book" and intent.title:
        seed = _book_by_title(db, intent.title)
        if seed:
            return similar_books(db, seed, limit), "metadata-tags"
        if intent.genres:
            return genre_combination_books(db, intent.genres, limit), "genre-combination"
        return popular_books(db, limit), "popularity"
    if intent.name == "author_search" and intent.author:
        return _search_books(db, intent.author, authors_only=True, limit=limit), "author-search"
    if intent.name == "book_search" and intent.title:
        return _search_books(db, intent.title, limit=limit), "book-search"
    if intent.genres:
        return genre_combination_books(db, intent.genres, limit), "genre-combination"
    return popular_books(db, limit), "popularity"


def compact_book_context(books: list[Book]) -> str:
    if not books:
        return "No recommendations were found. Say so briefly and suggest a different request."
    lines = []
    for index, book in enumerate(books[:5], start=1):
        tags = ", ".join(tag.name for tag in book.tags[:5]) or "no genres supplied"
        lines.append(
            f"{index}. {book.title} — {book.authors} — genres: {tags} — rating: {book.average_rating:.2f}"
        )
    return "\n".join(lines)
