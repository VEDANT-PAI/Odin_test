from app.retrieval import OpenLibraryRetriever


def test_query_normalization_removes_noise():
    assert OpenLibraryRetriever.normalize("  Dune!!! by Frank  Herbert ") == "dune by frank herbert"


def test_citation_requires_work_key(settings):
    retriever = OpenLibraryRetriever(settings)
    assert retriever._citation({"key": "/books/OL1M", "title": "Dune"}) is None
