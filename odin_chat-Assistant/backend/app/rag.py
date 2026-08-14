"""RAG (Retrieval-Augmented Generation) with vector embeddings.

Uses ChromaDB for vector storage and Ollama for embeddings.
"""

import hashlib
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

import httpx

from .config import Settings
from .schemas import Citation

logger = logging.getLogger("odin-chat.rag")


@dataclass
class DocumentChunk:
    id: str
    text: str
    source: str
    metadata: dict


class EmbeddingClient:
    """Ollama embedding client."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.embedding_model = settings.rag_embedding_model

    def _auth_headers(self) -> dict[str, str]:
        token = (self.settings.llm_bearer_token or "").strip()
        return {"Authorization": f"Bearer {token}"} if token else {}

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        if not texts:
            return []
        payload = {"model": self.embedding_model, "input": texts}
        timeout = httpx.Timeout(self.settings.llm_timeout, connect=5)
        async with httpx.AsyncClient(timeout=timeout, headers=self._auth_headers()) as client:
            response = await client.post(
                f"{self.settings.llm_url.rstrip('/')}/api/embed",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("embeddings", [])

    async def embed_single(self, text: str) -> list[float]:
        embeddings = await self.embed([text])
        return embeddings[0] if embeddings else []

    async def check_model_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5, headers=self._auth_headers()) as client:
                response = await client.get(f"{self.settings.llm_url.rstrip('/')}/api/tags")
                response.raise_for_status()
                names = [str(model.get("name")) for model in response.json().get("models", []) if isinstance(model, dict)]
                return self.embedding_model in names
        except (httpx.HTTPError, ValueError):
            return False


class RAGStore:
    """ChromaDB-backed vector store for RAG."""

    def __init__(self, settings: Settings, persist_dir: str | None = None):
        self.settings = settings
        self.embedding_client = EmbeddingClient(settings)

        # ChromaDB setup - use persistent directory if provided
        if persist_dir:
            self.client = chromadb.PersistentClient(
                path=persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        else:
            self.client = chromadb.EphemeralClient(
                settings=ChromaSettings(anonymized_telemetry=False),
            )

        self.collection = self.client.get_or_create_collection(
            name="odin_rag",
            metadata={"hnsw:space": "cosine"},
        )

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks using settings."""
        chunk_size = self.settings.rag_chunk_size
        overlap = self.settings.rag_chunk_overlap
        words = text.split()
        if len(words) <= chunk_size:
            return [text]

        chunks = []
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def _generate_id(self, source: str, chunk_index: int) -> str:
        """Generate deterministic ID for a chunk."""
        return hashlib.sha256(f"{source}:{chunk_index}".encode()).hexdigest()[:16]

    async def add_document(self, text: str, source: str, metadata: dict | None = None) -> int:
        """Add a document to the RAG store, returns number of chunks added."""
        if not text.strip():
            return 0

        chunks = self._chunk_text(text)
        if not chunks:
            return 0

        # Generate embeddings
        embeddings = await self.embedding_client.embed(chunks)

        # Prepare data for ChromaDB
        ids = [self._generate_id(source, i) for i in range(len(chunks))]
        metadatas = [
            {
                "source": source,
                "chunk_index": i,
                "chunk_count": len(chunks),
                **(metadata or {}),
            }
            for i in range(len(chunks))
        ]

        # Add to collection
        self.collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        logger.info("Added document to RAG: source=%s chunks=%d", source, len(chunks))
        return len(chunks)

    async def add_file(self, file_path: str | Path, metadata: dict | None = None) -> int:
        """Add a text file to the RAG store."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        text = path.read_text(encoding="utf-8")
        source = str(path)
        return await self.add_document(text, source, metadata)

    async def search(self, query: str, top_k: int = 5) -> list[DocumentChunk]:
        """Search for relevant chunks."""
        if not query.strip():
            return []

        query_embedding = await self.embedding_client.embed_single(query)
        if not query_embedding:
            return []

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                distance = results["distances"][0][i] if results["distances"] else 1.0
                chunks.append(DocumentChunk(
                    id=results["ids"][0][i] if results["ids"] else str(uuid.uuid4()),
                    text=doc,
                    source=metadata.get("source", "unknown"),
                    metadata={**metadata, "distance": distance},
                ))

        return chunks

    async def search_as_citations(self, query: str, top_k: int = 5) -> list[Citation]:
        """Search and return as Citation objects compatible with existing flow."""
        chunks = await self.search(query, top_k)
        citations = []
        for i, chunk in enumerate(chunks):
            distance = chunk.metadata.get("distance", 1.0)
            # Convert float distance to int (percentage) for Citation schema compatibility
            distance_int = int(distance * 100)
            citations.append(Citation(
                key=f"rag_{chunk.id}",
                title=f"RAG: {chunk.source}",
                authors=[],
                year=None,
                language=[],
                url=f"rag://{chunk.source}",
                cover_url=None,
                facts={
                    "text": chunk.text[:500],  # Truncate for context
                    "source": chunk.source,
                    "distance": distance_int,
                },
            ))
        return citations

    def get_stats(self) -> dict:
        """Get collection statistics."""
        count = self.collection.count()
        return {
            "document_count": count,
            "collection_name": self.collection.name,
        }

    async def delete_source(self, source: str) -> int:
        """Delete all chunks from a specific source."""
        # ChromaDB doesn't have direct delete by metadata, so we query first
        results = self.collection.get(
            where={"source": source},
            include=["metadatas"],
        )
        if results["ids"]:
            self.collection.delete(ids=results["ids"])
            logger.info("Deleted source from RAG: source=%s chunks=%d", source, len(results["ids"]))
            return len(results["ids"])
        return 0

    async def clear(self) -> None:
        """Clear all documents from the store."""
        self.client.delete_collection("odin_rag")
        self.collection = self.client.get_or_create_collection(
            name="odin_rag",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("Cleared RAG store")


# Global instance (initialized in main.py lifespan)
_rag_store: RAGStore | None = None


def get_rag_store() -> RAGStore | None:
    return _rag_store


def set_rag_store(store: RAGStore) -> None:
    global _rag_store
    _rag_store = store