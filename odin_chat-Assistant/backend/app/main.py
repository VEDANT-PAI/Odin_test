import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import get_settings
from .ollama import OllamaClient
from .retrieval import OpenLibraryRetriever
from .schemas import BookSearchRequest, BookSearchResponse, ChatRequest, HealthResponse, ModelStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("odin-chat")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.retriever = OpenLibraryRetriever(settings)
    app.state.ollama = OllamaClient(settings)
    ollama_ok, ollama_models = await app.state.ollama.status()
    logger.info(
        "startup llm_url=%s llm_model=%s ollama_available=%s models=%s",
        settings.llm_url,
        settings.llm_model,
        ollama_ok,
        ollama_models,
    )
    yield
    await app.state.retriever.close()


app = FastAPI(title="Odin Chat Assistant API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)


def sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    ollama_available, _ = await request.app.state.ollama.status()
    return HealthResponse(status="ok", ollama_available=ollama_available, retrieval_available=await request.app.state.retriever.available())


@app.get("/models/status", response_model=ModelStatus)
async def model_status(request: Request) -> ModelStatus:
    available, installed_models = await request.app.state.ollama.status()
    return ModelStatus(configured_model=settings.llm_model, available=available, installed_models=installed_models)


@app.post("/books/search", response_model=BookSearchResponse)
async def book_search(payload: BookSearchRequest, request: Request) -> BookSearchResponse:
    try:
        return BookSearchResponse(items=await request.app.state.retriever.search(payload.query))
    except httpx.HTTPError as exc:
        logger.warning("openlibrary_search_failed error=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Book research is temporarily unavailable.") from exc


@app.post("/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request) -> StreamingResponse:
    available, installed = await request.app.state.ollama.status()
    selected_model = payload.model or settings.llm_model
    if selected_model not in installed:
        raise HTTPException(status_code=503, detail=f"Ollama model {selected_model!r} is unavailable. Run: ollama pull {selected_model}")

    async def generate() -> AsyncIterator[str]:
        try:
            try:
                citations = await request.app.state.retriever.search(payload.message)
            except httpx.HTTPError:
                citations = []
                yield sse("notice", {"message": "Book research is unavailable; Odin will answer without external citations."})
            yield sse("citations", {"items": [citation.model_dump() for citation in citations]})
            history = [message.model_dump() for message in payload.history[-settings.max_history_messages:]]
            async for token in request.app.state.ollama.stream(payload.message, history, citations, payload.model):
                if await request.is_disconnected():
                    logger.info("chat_cancelled")
                    return
                yield sse("token", {"text": token})
            yield sse("done", {"citations": len(citations)})
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("chat_generation_failed error=%s", type(exc).__name__)
            yield sse("error", {"message": "The local model could not complete this response. Check Ollama and try again."})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
