from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class BookSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    authors: str
    average_rating: float
    ratings_count: int
    image_url: str | None = None
    small_image_url: str | None = None
    publication_year: float | None = None


class BookDetail(BookSummary):
    original_title: str | None = None
    language_code: str | None = None
    isbn: str | None = None
    tags: list[TagResponse] = Field(default_factory=list)


class PaginatedBooks(BaseModel):
    items: list[BookSummary]
    page: int
    limit: int
    total: int


class RecommendationResponse(BaseModel):
    items: list[BookSummary]
    strategy: str


class GenreRecommendationRequest(BaseModel):
    genres: list[str] = Field(min_length=1, max_length=6)
    limit: int = Field(default=5, ge=1, le=20)


class UserBookRating(BaseModel):
    book_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)


class RatingsRecommendationRequest(BaseModel):
    ratings: list[UserBookRating] = Field(min_length=1, max_length=10)
    limit: int = Field(default=5, ge=1, le=20)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=500)

    @field_validator("content")
    @classmethod
    def content_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content cannot be blank")
        return value


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatMessage] = Field(default_factory=list, max_length=8)

    @field_validator("message")
    @classmethod
    def message_cannot_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value


class ChatResponse(BaseModel):
    message: str
    recommendations: list[BookSummary]
    intent: str
    strategy: str
    llm_used: bool


class ChatHealthResponse(BaseModel):
    enabled: bool
    available: bool
    model: str
