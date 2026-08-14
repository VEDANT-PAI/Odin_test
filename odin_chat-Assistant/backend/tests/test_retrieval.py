import pytest
from app.main import has_book_intent
from app.retrieval import OpenLibraryRetriever, WebSearchRetriever, is_recency_query


def test_query_normalization_removes_noise():
    assert OpenLibraryRetriever.normalize("  Dune!!! by Frank  Herbert ") == "dune by frank herbert"


def test_citation_requires_work_key(settings):
    retriever = OpenLibraryRetriever(settings)
    assert retriever._citation({"key": "/books/OL1M", "title": "Dune"}) is None


def test_is_recency_query_detects_years_and_keywords():
    assert is_recency_query("What are the latest sci-fi books in 2025?") is True
    assert is_recency_query("Top 2026 fantasy book releases") is True
    assert is_recency_query("Tell me about Dune published in 1965") is False


def test_has_book_intent():
    assert has_book_intent("Recommend me a good thriller") is True
    assert has_book_intent("What are the best books by Brandon Sanderson?") is True
    assert has_book_intent("Latest 2025 fantasy book releases") is True
    assert has_book_intent("hello") is False
    assert has_book_intent("hi there!") is False


@pytest.mark.asyncio
async def test_web_retriever_domain_extraction(settings):
    retriever = WebSearchRetriever(settings)
    assert retriever._domain("https://www.goodreads.com/book/show/123") == "goodreads.com"
    assert retriever._domain("https://panmacmillan.com/blogs/fantasy") == "panmacmillan.com"
