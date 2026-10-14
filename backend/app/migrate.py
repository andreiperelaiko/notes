"""Административный процесс: применение миграций схемы БД (фактор XII).

Запускается разово тем же образом и с той же конфигурацией, что и приложение:
    python -m app.migrate
"""
import logging
import sys
from pathlib import Path

import psycopg

from .config import load_settings
from .logging_setup import setup_logging

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
# Произвольный ключ advisory lock, чтобы две параллельные миграции не столкнулись.
LOCK_KEY = 7_420_115

log = logging.getLogger("migrate")


def migrate(database_url: str) -> int:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    applied_now = 0
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_KEY,))
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version    TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            applied = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
            for path in files:
                version = path.stem
                if version in applied:
                    continue
                log.info("applying migration", extra={"extra_fields": {"version": version}})
                with conn.transaction():
                    conn.execute(path.read_text(encoding="utf-8"))
                    conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
                applied_now += 1
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,))
    log.info("migrations done", extra={"extra_fields": {"applied": applied_now, "total": len(files)}})
    return applied_now


def main() -> None:
    settings = load_settings()
    setup_logging(settings.log_level)
    try:
        migrate(settings.database_url)
    except Exception:
        log.exception("migration failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
