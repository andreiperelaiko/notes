import logging
import socket
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import Connection

from . import db
from .config import load_settings
from .logging_setup import setup_logging
from .routers import notebooks, notes

settings = load_settings()
setup_logging(settings.log_level)
log = logging.getLogger("notes")

# Имя экземпляра (hostname контейнера) — пригодится, чтобы видеть балансировку между репликами.
INSTANCE = socket.gethostname()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting", extra={"extra_fields": {"instance": INSTANCE}})
    db.open_pool(settings)
    yield
    # Graceful shutdown по SIGTERM: uvicorn дожидается текущих запросов, затем закрываем пул (фактор IX).
    db.close_pool()
    log.info("stopped", extra={"extra_fields": {"instance": INSTANCE}})


app = FastAPI(title="Notes Service", version="1.0.0", lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def access_log(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error", extra={"extra_fields": {"path": request.url.path}})
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    response.headers["X-Instance"] = INSTANCE
    log.info(
        "request",
        extra={
            "extra_fields": {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            }
        },
    )
    return response


@app.get("/api/health", tags=["service"])
def health(conn: Connection = Depends(db.get_conn)):
    conn.execute("SELECT 1")
    return {"status": "ok", "instance": INSTANCE}


app.include_router(notebooks.router)
app.include_router(notes.router)
