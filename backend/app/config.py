"""Конфигурация приложения. Единственный источник — переменные окружения (фактор III)."""
import os
from dataclasses import dataclass
from typing import List


class ConfigError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(f"Environment variable {name} is required")
    return value


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        raise ConfigError(f"Environment variable {name} must be an integer, got {raw!r}")


@dataclass(frozen=True)
class Settings:
    database_url: str
    host: str
    port: int
    log_level: str
    db_pool_min_size: int
    db_pool_max_size: int
    cors_origins: List[str]


def load_settings() -> Settings:
    cors = os.environ.get("CORS_ORIGINS", "")
    return Settings(
        database_url=_required("DATABASE_URL"),
        host=os.environ.get("HOST", "0.0.0.0"),
        port=_int("PORT", 8000),
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        db_pool_min_size=_int("DB_POOL_MIN_SIZE", 1),
        db_pool_max_size=_int("DB_POOL_MAX_SIZE", 10),
        cors_origins=[o.strip() for o in cors.split(",") if o.strip()],
    )
