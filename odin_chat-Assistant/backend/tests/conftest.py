import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(openlibrary_url="https://openlibrary.org")
