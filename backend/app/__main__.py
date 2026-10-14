"""Точка входа: приложение само поднимает HTTP-сервер на порту из $PORT (фактор VII)."""
import uvicorn

from .config import load_settings


def main() -> None:
    settings = load_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_config=None,  # логирование настраивает само приложение (JSON в stdout)
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_graceful_shutdown=10,
    )


if __name__ == "__main__":
    main()
