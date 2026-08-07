from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://odin:odin@localhost:5432/odin"
    cors_origins: str = "http://localhost:3000"
    data_dir: str = "../datasets/dataset_processed"

    model_config = SettingsConfigDict(env_prefix="ODIN_", env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

