from odin.chat import detect_intent


def test_detects_similar_book_request():
    intent = detect_intent("I want a dark fantasy book like The Witcher")

    assert intent.name == "similar_book"
    assert intent.title == "The Witcher"
    assert "dark" in intent.genres
    assert "fantasy" in intent.genres


def test_detects_author_and_genre_requests():
    author_intent = detect_intent("Books by Neil Gaiman")
    genre_intent = detect_intent("Give me fantasy romance")

    assert author_intent.name == "author_search"
    assert author_intent.author == "Neil Gaiman"
    assert genre_intent.name == "genre_recommendation"
    assert genre_intent.genres == ["fantasy", "romance"]


def test_follow_up_inherits_recent_genre_context():
    intent = detect_intent("Make it darker", ["I want fantasy"])

    assert intent.name == "genre_recommendation"
    assert "fantasy" in intent.genres
    assert "dark" in intent.genres
