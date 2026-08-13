"""Bounded Open Library retrieval with an in-memory TTL cache."""

import asyncio
import re
import time

import httpx

from .config import Settings
from .schemas import Citation


class OpenLibraryRetriever:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=settings.openlibrary_timeout)
        self._cache: dict[str, tuple[float, list[Citation]]] = {}
        self._last_request_at = 0.0

    @staticmethod
    def normalize(query: str) -> str:
        cleaned = re.sub(r"[^\w\s'’-]", " ", query.casefold())
        return re.sub(r"\s+", " ", cleaned).strip()

    def _citation(self, document: dict) -> Citation | None:
        key = document.get("key")
        title = document.get("title")
        if not isinstance(key, str) or not key.startswith("/works/") or not isinstance(title, str):
            return None
        authors = [str(author) for author in document.get("author_name", [])[:3]]
        year = document.get("first_publish_year")
        cover_id = document.get("cover_i")
        languages = [str(language) for language in document.get("language", [])[:4]]
        url = f"{self.settings.openlibrary_url.rstrip('/')}{key}"
        return Citation(
            key=key,
            title=title,
            authors=authors,
            year=year if isinstance(year, int) else None,
            language=languages,
            url=url,
            cover_url=f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if isinstance(cover_id, int) else None,
            facts={"title": title, "authors": authors, "first_publish_year": year if isinstance(year, int) else None, "languages": languages},
        )

    async def search(self, query: str) -> list[Citation]:
        normalized = self.normalize(query)
        if not normalized:
            return []
        cached = self._cache.get(normalized)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        delay = 0.2 - (time.monotonic() - self._last_request_at)
        if delay > 0:
            await asyncio.sleep(delay)
        response = await self.client.get(
            f"{self.settings.openlibrary_url.rstrip('/')}/search.json",
            params={"q": normalized, "limit": self.settings.max_sources, "fields": "key,title,author_name,first_publish_year,cover_i,language"},
            headers={"User-Agent": "OdinChatAssistant/1.0 (self-hosted book research)"},
        )
        self._last_request_at = time.monotonic()
        response.raise_for_status()
        records = [citation for document in response.json().get("docs", []) if (citation := self._citation(document))]
        self._cache[normalized] = (time.monotonic() + self.settings.retrieval_cache_seconds, records)
        return records

    async def available(self) -> bool:
        try:
            await self.search("book")
            return True
        except (httpx.HTTPError, ValueError):
            return False

    async def close(self) -> None:
        await self.client.aclose()
