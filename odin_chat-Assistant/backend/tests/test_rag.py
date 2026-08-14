"""Tests for RAG functionality."""

import tempfile
from pathlib import Path

import pytest
import pytest_asyncio

from app.config import Settings
from app.rag import RAGStore, EmbeddingClient


@pytest.fixture
def settings() -> Settings:
    return Settings(
        llm_url="http://localhost:11434",
        llm_model="qwen3:0.6b",
        rag_enabled=True,
        rag_persist_dir="/tmp/test_rag",
        rag_embedding_model="nomic-embed-text",
        rag_chunk_size=100,
        rag_chunk_overlap=20,
        rag_top_k=3,
    )


@pytest.fixture
def rag_store(settings: Settings) -> RAGStore:
    with tempfile.TemporaryDirectory() as tmpdir:
        yield RAGStore(settings, tmpdir)


def test_chunk_text() -> None:
    """Test text chunking logic."""
    from app.rag import RAGStore
    store = RAGStore(Settings(rag_chunk_size=10, rag_chunk_overlap=2))
    
    # Short text - single chunk
    chunks = store._chunk_text("Hello world")
    assert len(chunks) == 1
    assert chunks[0] == "Hello world"
    
    # Long text - multiple chunks with overlap
    text = " ".join([f"word{i}" for i in range(20)])
    chunks = store._chunk_text(text)
    assert len(chunks) > 1
    # Check overlap exists
    assert "word10" in chunks[0] or "word10" in chunks[1]


def test_generate_id() -> None:
    """Test deterministic ID generation."""
    from app.rag import RAGStore
    store = RAGStore(Settings())
    
    id1 = store._generate_id("source.txt", 0)
    id2 = store._generate_id("source.txt", 0)
    id3 = store._generate_id("source.txt", 1)
    
    assert id1 == id2  # Same source and index = same ID
    assert id1 != id3  # Different index = different ID
    assert len(id1) == 16  # SHA256 truncated to 16 chars


@pytest.mark.asyncio
async def test_add_and_search(rag_store: RAGStore) -> None:
    """Test adding document and searching."""
    # Add a document
    text = "The quick brown fox jumps over the lazy dog. " * 10
    chunks_added = await rag_store.add_document(text, "test_source.txt", {"category": "test"})
    assert chunks_added > 0
    
    # Search for it
    results = await rag_store.search("fox jumps", top_k=3)
    assert len(results) > 0
    assert any("fox" in r.text for r in results)
    assert all(r.source == "test_source.txt" for r in results)


@pytest.mark.asyncio
async def test_search_as_citations(rag_store: RAGStore) -> None:
    """Test searching and returning as Citation objects."""
    text = "Sherlock Holmes is a fictional detective created by Arthur Conan Doyle."
    await rag_store.add_document(text, "holmes.txt")
    
    citations = await rag_store.search_as_citations("Sherlock Holmes", top_k=2)
    assert len(citations) > 0
    assert citations[0].key.startswith("rag_")
    assert "Sherlock" in citations[0].facts.get("text", "")
    assert citations[0].facts.get("source") == "holmes.txt"


@pytest.mark.asyncio
async def test_delete_source(rag_store: RAGStore) -> None:
    """Test deleting all chunks from a source."""
    text = "Test document for deletion."
    await rag_store.add_document(text, "to_delete.txt")
    
    # Verify it exists
    results = await rag_store.search("deletion", top_k=5)
    assert len(results) > 0
    
    # Delete it
    deleted = await rag_store.delete_source("to_delete.txt")
    assert deleted > 0
    
    # Verify it's gone
    results = await rag_store.search("deletion", top_k=5)
    assert len(results) == 0


@pytest.mark.asyncio
async def test_clear(rag_store: RAGStore) -> None:
    """Test clearing the entire store."""
    await rag_store.add_document("Doc 1", "doc1.txt")
    await rag_store.add_document("Doc 2", "doc2.txt")
    
    stats_before = rag_store.get_stats()
    assert stats_before["document_count"] > 0
    
    await rag_store.clear()
    
    stats_after = rag_store.get_stats()
    assert stats_after["document_count"] == 0


@pytest.mark.asyncio
async def test_empty_search(rag_store: RAGStore) -> None:
    """Test searching empty store returns empty results."""
    results = await rag_store.search("anything", top_k=5)
    assert results == []
    
    citations = await rag_store.search_as_citations("anything", top_k=5)
    assert citations == []


def test_combined_search_import() -> None:
    """Test that combined_search function can be imported."""
    from app.retrieval import combined_search
    assert callable(combined_search)