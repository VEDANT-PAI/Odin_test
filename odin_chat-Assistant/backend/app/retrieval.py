"""Bounded Open Library and Web Search retrieval with in-memory TTL caching."""

import asyncio
import hashlib
import logging
import re
import time
from urllib.parse import urlparse

import httpx

from .config import Settings
from .rag import get_rag_store
from .schemas import Citation

logger = logging.getLogger("odin-chat.retrieval")


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
            facts={"type": "openlibrary", "title": title, "authors": authors, "first_publish_year": year if isinstance(year, int) else None, "languages": languages},
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
        except (httpx.HTTPError, ValueError, Exception):
            return False

    async def close(self) -> None:
        await self.client.aclose()


class WebSearchRetriever:
    """Live web & Google search retriever for up-to-date book recommendations and news."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._cache: dict[str, tuple[float, list[Citation]]] = {}

    @staticmethod
    def _domain(url: str) -> str:
        try:
            return urlparse(url).netloc.replace("www.", "")
        except Exception:
            return "web"

    async def _search_google_api(self, query: str, max_results: int) -> list[Citation]:
        """Use Google Custom Search JSON API if API key and cx are configured."""
        if not self.settings.google_search_api_key or not self.settings.google_search_cx:
            return []
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": self.settings.google_search_api_key,
            "cx": self.settings.google_search_cx,
            "q": query,
            "num": min(max_results, 10),
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])
            citations = []
            for item in items:
                link = item.get("link", "")
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                if not link or not title:
                    continue
                key = f"web_{hashlib.md5(link.encode()).hexdigest()[:12]}"
                citations.append(Citation(
                    key=key,
                    title=title,
                    url=link,
                    facts={
                        "type": "web",
                        "title": title,
                        "snippet": snippet,
                        "source": self._domain(link),
                        "url": link,
                    },
                ))
            return citations

    def _search_ddgs_sync(self, query: str, max_results: int) -> list[Citation]:
        """Synchronous DuckDuckGo search executed in worker thread."""
        try:
            from ddgs import DDGS
            ddgs = DDGS()
            raw_results = list(ddgs.text(query, max_results=max_results))
        except Exception as exc:
            logger.warning("ddgs_search_failed error=%s", exc)
            return []

        citations = []
        for item in raw_results:
            link = item.get("href") or item.get("url") or ""
            title = item.get("title") or ""
            snippet = item.get("body") or item.get("snippet") or ""
            if not link or not title:
                continue
            key = f"web_{hashlib.md5(link.encode()).hexdigest()[:12]}"
            domain = self._domain(link)
            citations.append(Citation(
                key=key,
                title=title,
                url=link,
                facts={
                    "type": "web",
                    "title": title,
                    "snippet": snippet,
                    "source": domain,
                    "url": link,
                },
            ))
        return citations

    async def search(self, query: str, max_results: int = 4) -> list[Citation]:
        if not self.settings.web_search_enabled or not query.strip():
            return []

        normalized = query.strip().lower()
        cached = self._cache.get(normalized)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        citations: list[Citation] = []
        # Try Google Custom Search API first if key provided
        try:
            citations = await self._search_google_api(query, max_results)
        except Exception as exc:
            logger.warning("google_api_search_failed error=%s", exc)

        # Fallback to zero-config DDGS web search
        if not citations:
            try:
                citations = await asyncio.to_thread(self._search_ddgs_sync, query, max_results)
            except Exception as exc:
                logger.warning("ddgs_async_failed error=%s", exc)

        if citations:
            self._cache[normalized] = (time.monotonic() + self.settings.retrieval_cache_seconds, citations)
        return citations


def is_recency_query(text: str) -> bool:
    """Check if query is asking for latest, recent, upcoming, or current recommendations."""
    return bool(re.search(
        r'\b(latest|recent|new|upcoming|released?|bestseller|best|top|current|2024|2025|2026|today|this year|award|winner|trending)\b',
        text,
        re.IGNORECASE,
    ))


async def combined_search(settings: Settings, search_query: str, original_message: str = "") -> list[Citation]:
    """Search Web (Google/DDGS), Open Library, and RAG store concurrently, combining results."""
    retriever = OpenLibraryRetriever(settings)
    web_retriever = WebSearchRetriever(settings)
    recency = is_recency_query(original_message or search_query)

    # For web search: use the natural question with book context for better search engine ranking
    web_query = original_message.strip() if original_message else search_query
    if not re.search(r'\b(book|novel|read|author|series)\b', web_query, re.IGNORECASE):
        web_query = f"{web_query} book"

    tasks = [
        retriever.search(search_query),
        web_retriever.search(web_query, settings.web_search_max_results),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ol_results: list[Citation] = results[0] if isinstance(results[0], list) else []
    web_results: list[Citation] = results[1] if isinstance(results[1], list) else []

    rag_results: list[Citation] = []
    if settings.rag_enabled:
        rag_store = get_rag_store()
        if rag_store:
            try:
                rag_results = await rag_store.search_as_citations(search_query, settings.rag_top_k)
            except Exception:
                pass

    # Order results based on intent:
    # If looking for latest / recent / trending books -> Web search first, then Open Library, then RAG
    # Otherwise -> Open Library (authoritative catalog), Web search, then RAG
    if recency:
        combined = web_results + ol_results + rag_results
    else:
        combined = ol_results + web_results + rag_results

    # Deduplicate by URL or title
    seen = set()
    deduped = []
    for c in combined:
        identifier = c.url or c.title.lower()
        if identifier not in seen:
            seen.add(identifier)
            deduped.append(c)

    return deduped[:8]