from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1_000)

    @field_validator("content")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content cannot be blank")
        return value.strip()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    model: str | None = Field(default=None, max_length=100)
    think: bool = Field(default=False)

    @field_validator("message")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value.strip()


class Citation(BaseModel):
    key: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    language: list[str] = Field(default_factory=list)
    url: str
    cover_url: str | None = None
    facts: dict[str, Any] = Field(default_factory=dict)


class BookSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)


class BookSearchResponse(BaseModel):
    items: list[Citation]


class ModelStatus(BaseModel):
    configured_model: str
    available: bool
    installed_models: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    ollama_available: bool
    retrieval_available: bool
    web_search_available: bool = True
