from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    llm_url: str = "http://localhost:11434"
    llm_model: str = "qwen2.5:3b"
    llm_timeout: float = 90.0
    llm_bearer_token: str = ""  # sent as `Authorization: Bearer ...` to Ollama; empty = no header (local dev)
    cors_origins: str = "http://localhost:3001"
    openlibrary_url: str = "https://openlibrary.org"
    openlibrary_timeout: float = 8.0
    retrieval_cache_seconds: int = 600
    max_history_messages: int = 12
    max_sources: int = 5
    max_output_tokens: int = 500

    model_config = SettingsConfigDict(env_prefix="ODIN_CHAT_", env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
