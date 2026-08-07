from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .config import get_settings
from .db import get_db
from .models import Book
from .recommendations import genre_combination_books, popular_books, ratings_based_books, similar_books
from .schemas import BookDetail, GenreRecommendationRequest, PaginatedBooks, RatingsRecommendationRequest, RecommendationResponse

settings = get_settings()
app = FastAPI(title="Odin API", version="0.1.0", description="Early-phase book discovery API")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "odin-api"}


@app.get("/api/v1/books", response_model=PaginatedBooks)
def list_books(q: str | None = Query(default=None, max_length=100), page: int = Query(default=1, ge=1), limit: int = Query(default=12, ge=1, le=50), db: Session = Depends(get_db)) -> PaginatedBooks:
    query = select(Book)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(Book.title).like(term), func.lower(Book.authors).like(term)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    books = db.scalars(query.order_by(Book.title).offset((page - 1) * limit).limit(limit)).all()
    return PaginatedBooks(items=list(books), page=page, limit=limit, total=total)


@app.get("/api/v1/books/{book_id}", response_model=BookDetail)
def get_book(book_id: int, db: Session = Depends(get_db)) -> Book:
    book = db.scalar(select(Book).options(selectinload(Book.tags)).where(Book.id == book_id))
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@app.get("/api/v1/recommendations/popular", response_model=RecommendationResponse)
def get_popular(limit: int = Query(default=12, ge=1, le=50), genre: str | None = None, db: Session = Depends(get_db)) -> RecommendationResponse:
    return RecommendationResponse(items=popular_books(db, limit, genre), strategy="popularity")


@app.get("/api/v1/recommendations/similar/{book_id}", response_model=RecommendationResponse)
def get_similar(book_id: int, limit: int = Query(default=12, ge=1, le=50), db: Session = Depends(get_db)) -> RecommendationResponse:
    book = db.scalar(select(Book).options(selectinload(Book.tags)).where(Book.id == book_id))
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return RecommendationResponse(items=similar_books(db, book, limit), strategy="metadata-tags")


@app.post("/api/v1/recommendations/genres", response_model=RecommendationResponse)
def get_genre_recommendations(request: GenreRecommendationRequest, db: Session = Depends(get_db)) -> RecommendationResponse:
    return RecommendationResponse(items=genre_combination_books(db, request.genres, request.limit), strategy="genre-combination")


@app.post("/api/v1/recommendations/ratings", response_model=RecommendationResponse)
def get_ratings_recommendations(request: RatingsRecommendationRequest, db: Session = Depends(get_db)) -> RecommendationResponse:
    ratings = {item.book_id: item.rating for item in request.ratings}
    return RecommendationResponse(items=ratings_based_books(db, ratings, request.limit), strategy="co-ratings")
