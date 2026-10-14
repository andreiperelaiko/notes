"""Подключение к PostgreSQL как к подключаемому ресурсу (фактор IV)."""
from typing import Iterator, Optional

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings

_pool: Optional[ConnectionPool] = None


def open_pool(settings: Settings) -> None:
    global _pool
    _pool = ConnectionPool(
        conninfo=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    _pool.open(wait=True, timeout=30)


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def get_conn() -> Iterator[Connection]:
    """FastAPI-зависимость: соединение из пула, одна транзакция на запрос.

    Контекстный менеджер пула делает COMMIT при успешном выходе и ROLLBACK при исключении.
    """
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    with _pool.connection() as conn:
        yield conn
