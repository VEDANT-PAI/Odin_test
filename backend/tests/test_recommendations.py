from odin.recommendations import similar_books


def test_similarity_service_is_callable():
    assert callable(similar_books)

