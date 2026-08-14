"""Grounded, streaming Ollama adapter."""

import json
import re
from collections.abc import AsyncIterator

import httpx

from .config import Settings
from .schemas import Citation


SYSTEM_PROMPT = """You are Odin, an intelligent book research and recommendation assistant. You help users find books, authors, latest releases, reviews, and reading suggestions using the provided reference records and web search results.

CITATION RULES:
1. Cite facts and book titles using [1], [2], etc., corresponding strictly to the numbered records provided below.
2. Only cite the specific source numbers [N] that you actually mention or reference in your answer.
3. For latest / recent book releases or literary news, synthesize from the web search results.
4. For greetings or general conversation without records, respond naturally.
5. Keep answers concise, informative, and conversational. Do not repeat raw metadata keys.

EXAMPLE:
Records:
[1] Dune by Frank Herbert (1965)
[2] Web source (goodreads.com): A Psalm for the Wild-Built by Becky Chambers (2021) - Hugo Award winning hopeful sci-fi...

User: Recommend me great sci-fi books
You: Here are top recommendations: Dune [1] by Frank Herbert is a legendary space opera classic. For modern, character-driven fiction, Becky Chambers' A Psalm for the Wild-Built [2] offers a heartwarming and philosophical story."""

# Catch any stray <think>...</think> blocks (defensive, for model-agnostic safety)
_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def source_context(citations: list[Citation]) -> str:
    if not citations:
        return "No external records were retrieved for this request."
    lines = []
    for index, citation in enumerate(citations, start=1):
        if citation.key.startswith("rag_"):
            text = citation.facts.get("text", "")
            source = citation.facts.get("source", "unknown")
            lines.append(f"[{index}] RAG source ({source}):\n{text}")
        elif citation.key.startswith("web_"):
            snippet = citation.facts.get("snippet", "")
            source = citation.facts.get("source", "web")
            lines.append(f"[{index}] Web source ({source}): {citation.title}\n{snippet}")
        else:
            authors = ', '.join(citation.authors) if citation.authors else 'unknown'
            year = str(citation.year) if citation.year else 'unknown'
            lines.append(f"[{index}] Book: {citation.title} by {authors} ({year})")
    return "\n".join(lines)


class OllamaClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _auth_headers(self) -> dict[str, str]:
        token = (self.settings.llm_bearer_token or "").strip()
        return {"Authorization": f"Bearer {token}"} if token else {}

    async def status(self) -> tuple[bool, list[str]]:
        try:
            async with httpx.AsyncClient(timeout=5, headers=self._auth_headers()) as client:
                response = await client.get(f"{self.settings.llm_url.rstrip('/')}/api/tags")
                response.raise_for_status()
                names = [str(model.get("name")) for model in response.json().get("models", []) if isinstance(model, dict)]
                return self.settings.llm_model in names, names
        except (httpx.HTTPError, ValueError):
            return False, []

    async def stream(self, message: str, history: list[dict[str, str]], citations: list[Citation], model: str | None = None, think: bool = False) -> AsyncIterator[tuple[str, str]]:
        system_content = f"{SYSTEM_PROMPT}\n\nSearch Records & Sources:\n{source_context(citations)}"

        payload = {
            "model": model or self.settings.llm_model,
            "stream": True,
            "messages": [
                {"role": "system", "content": system_content},
                *history,
                {"role": "user", "content": message},
            ],
            "options": {"temperature": 0.2, "num_predict": self.settings.max_output_tokens},
        }
        timeout = httpx.Timeout(self.settings.llm_timeout, connect=5)
        async with httpx.AsyncClient(timeout=timeout, headers=self._auth_headers()) as client:
            async with client.stream("POST", f"{self.settings.llm_url.rstrip('/')}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        item = json.loads(line)
                        message_obj = item.get("message", {})
                        content = message_obj.get("content", "")
                        if isinstance(content, str) and content:
                            clean = _THINK_TAG_RE.sub("", content)
                            if clean:
                                yield clean, ""
                        if item.get("done"):
                            return
