import json
import logging
import os
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import get_settings
from .ollama import OllamaClient
from .rag import RAGStore, set_rag_store
from .retrieval import OpenLibraryRetriever, combined_search
from .schemas import BookSearchRequest, BookSearchResponse, ChatRequest, HealthResponse, ModelStatus

BOOK_INTENT_PATTERNS = [
    r'\b(recommend|suggest|find|search|look for|show|what is|tell me about|who wrote|who is|explain|summarize|summary|review)\b',
    r'\b(novel|book|series|author|writer|title|audiobook|story|literature|read|reading|genre|chapter|bestseller)\b',
    r'\b(action|thriller|mystery|romance|fantasy|sci[\s-]?fi|science fiction|horror|historical|crime|adventure|memoir|biography|dystopian|non-fiction|fiction)\b',
    r'\b(latest|recent|new|upcoming|released?|bestseller|best|top|current|2024|2025|2026|today|this year|award|winner|trending|google|web)\b',
    r'\b(19|20)\d{2}\b',  # year
]

def has_book_intent(message: str) -> bool:
    """Check if the message is asking for book research, recommendations, or search."""
    message_lower = message.lower().strip()
    # If it's a very short greeting like "hi", "hello", "hey", skip search
    if re.match(r'^(hi|hello|hey|greetings|good morning|good evening|good afternoon)[\s!.]*$', message_lower):
        return False
    return any(re.search(pattern, message_lower) for pattern in BOOK_INTENT_PATTERNS)

def extract_search_query(message: str) -> str:
    """Extract keyword-style query from natural language for better Open Library / catalog results."""
    # First, try to extract key entities: genre + year + format
    genre_match = re.search(r'\b(action|thriller|mystery|romance|fantasy|sci[\s-]?fi|science fiction|horror|historical|crime|adventure|memoir|biography|dystopian)\b', message, re.IGNORECASE)
    year_match = re.search(r'\b(19|20)\d{2}s?\b', message)
    format_match = re.search(r'\b(novel|book|series|story)s?\b', message, re.IGNORECASE)

    parts = []
    if genre_match:
        genre = genre_match.group(1).lower().replace(' ', '').replace('-', '')
        if genre in ('scifi', 'scif'):
            genre = 'science fiction'
        parts.append(genre)
    if format_match:
        parts.append(format_match.group(1))
    if year_match:
        parts.append(year_match.group(0))

    if len(parts) >= 2:
        return ' '.join(parts)

    # Fallback: remove conversational filler
    stop_phrases = [
        r'^\s*(google|search|search for|look up|recommend|suggest|find|show|give|get|tell me about)\s+(me\s+)?',
        r'^\s*(i want to|i would like to|i\'d like to|i\'m looking for|can you|could you|please)\s+(read|find|get|see|recommend|search)?\s*',
        r'\b(from|in|during|published|written|released)\s+',
    ]
    query = message
    for phrase in stop_phrases:
        query = re.sub(phrase, ' ', query, flags=re.IGNORECASE)
    query = re.sub(r'\s+', ' ', query).strip()
    return query or message

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("odin-chat")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.retriever = OpenLibraryRetriever(settings)
    app.state.ollama = OllamaClient(settings)

    # Initialize RAG store if enabled
    if settings.rag_enabled:
        persist_dir = settings.rag_persist_dir
        os.makedirs(persist_dir, exist_ok=True)
        app.state.rag_store = RAGStore(settings, persist_dir)
        set_rag_store(app.state.rag_store)
        stats = app.state.rag_store.get_stats()
        logger.info("RAG store initialized: %s", stats)
    else:
        app.state.rag_store = None

    ollama_ok, ollama_models = await app.state.ollama.status()
    logger.info(
        "startup llm_url=%s llm_model=%s ollama_available=%s models=%s web_search_enabled=%s",
        settings.llm_url,
        settings.llm_model,
        ollama_ok,
        ollama_models,
        settings.web_search_enabled,
    )
    yield
    await app.state.retriever.close()


app = FastAPI(title="Odin Chat Assistant API", version="1.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)


def sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    ollama_available, _ = await request.app.state.ollama.status()
    return HealthResponse(
        status="ok",
        ollama_available=ollama_available,
        retrieval_available=await request.app.state.retriever.available(),
        web_search_available=settings.web_search_enabled,
    )


@app.get("/models/status", response_model=ModelStatus)
async def model_status(request: Request) -> ModelStatus:
    available, installed_models = await request.app.state.ollama.status()
    return ModelStatus(configured_model=settings.llm_model, available=available, installed_models=installed_models)


@app.post("/books/search", response_model=BookSearchResponse)
async def book_search(payload: BookSearchRequest, request: Request) -> BookSearchResponse:
    try:
        citations = await combined_search(settings, payload.query, payload.query)
        return BookSearchResponse(items=citations)
    except httpx.HTTPError as exc:
        logger.warning("book_search_failed error=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Book research is temporarily unavailable.") from exc


@app.post("/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request) -> StreamingResponse:
    available, installed = await request.app.state.ollama.status()
    selected_model = payload.model or settings.llm_model
    if selected_model not in installed:
        raise HTTPException(status_code=503, detail=f"Ollama model {selected_model!r} is unavailable. Run: ollama pull {selected_model}")

    async def generate() -> AsyncIterator[str]:
        try:
            if has_book_intent(payload.message):
                search_query = extract_search_query(payload.message)
                try:
                    citations = await combined_search(settings, search_query, payload.message)
                except Exception as exc:
                    logger.warning("combined_search_error: %s", exc)
                    citations = []
                    yield sse("notice", {"message": "Search services unavailable; Odin will answer from base knowledge."})
            else:
                citations = []

            yield sse("citations", {"items": [citation.model_dump() for citation in citations]})
            history = [message.model_dump() for message in payload.history[-settings.max_history_messages:]]
            async for token, thinking in request.app.state.ollama.stream(payload.message, history, citations, payload.model, payload.think):
                if await request.is_disconnected():
                    logger.info("chat_cancelled")
                    return
                if thinking:
                    yield sse("thinking", {"text": thinking})
                else:
                    yield sse("token", {"text": token})
            yield sse("done", {"citations": len(citations)})
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("chat_generation_failed error=%s", type(exc).__name__)
            yield sse("error", {"message": "The local model could not complete this response. Check Ollama and try again."})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# RAG Management Endpoints

class RagIngestRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    source: str = Field(min_length=1, max_length=200)
    metadata: dict | None = None


class RagIngestResponse(BaseModel):
    chunks_added: int
    source: str


@app.post("/rag/ingest", response_model=RagIngestResponse)
async def rag_ingest(payload: RagIngestRequest, request: Request) -> RagIngestResponse:
    rag_store = request.app.state.rag_store
    if not rag_store:
        raise HTTPException(status_code=503, detail="RAG is not enabled")
    chunks = await rag_store.add_document(payload.text, payload.source, payload.metadata)
    return RagIngestResponse(chunks_added=chunks, source=payload.source)


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


class RagSearchResponse(BaseModel):
    results: list[dict]


@app.post("/rag/search", response_model=RagSearchResponse)
async def rag_search(payload: RagSearchRequest, request: Request) -> RagSearchResponse:
    rag_store = request.app.state.rag_store
    if not rag_store:
        raise HTTPException(status_code=503, detail="RAG is not enabled")
    chunks = await rag_store.search(payload.query, payload.top_k)
    return RagSearchResponse(results=[
        {
            "id": chunk.id,
            "text": chunk.text,
            "source": chunk.source,
            "metadata": chunk.metadata,
        }
        for chunk in chunks
    ])


@app.get("/rag/stats")
async def rag_stats(request: Request) -> dict:
    rag_store = request.app.state.rag_store
    if not rag_store:
        return {"enabled": False, "document_count": 0}
    stats = rag_store.get_stats()
    return {"enabled": True, **stats}


@app.delete("/rag/source/{source:path}")
async def rag_delete_source(source: str, request: Request) -> dict:
    rag_store = request.app.state.rag_store
    if not rag_store:
        raise HTTPException(status_code=503, detail="RAG is not enabled")
    deleted = await rag_store.delete_source(source)
    return {"deleted_chunks": deleted, "source": source}


@app.post("/rag/clear")
async def rag_clear(request: Request) -> dict:
    rag_store = request.app.state.rag_store
    if not rag_store:
        raise HTTPException(status_code=503, detail="RAG is not enabled")
    await rag_store.clear()
    return {"cleared": True}