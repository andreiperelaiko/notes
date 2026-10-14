import os
import socket

import psycopg
from fastapi import FastAPI, HTTPException, Request
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

# Конфигурация — только из переменных окружения.
DATABASE_URL = os.environ["DATABASE_URL"]
# Имя контейнера, чтобы видеть, какой экземпляр ответил (пригодится для балансировки).
INSTANCE = socket.gethostname()

app = FastAPI(title="Notes")


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""


def db():
    # Соединение на каждый запрос; при выходе из with — COMMIT (или ROLLBACK при ошибке) и закрытие.
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@app.middleware("http")
async def add_instance_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Instance"] = INSTANCE
    return response


@app.get("/api/health")
def health():
    with db() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok", "instance": INSTANCE}


@app.get("/api/notes")
def list_notes():
    with db() as conn:
        return conn.execute("SELECT * FROM notes ORDER BY id DESC").fetchall()


@app.get("/api/notes/{note_id}")
def get_note(note_id: int):
    with db() as conn:
        note = conn.execute("SELECT * FROM notes WHERE id = %s", (note_id,)).fetchone()
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@app.post("/api/notes", status_code=201)
def create_note(body: NoteIn):
    with db() as conn:
        return conn.execute(
            "INSERT INTO notes (title, content) VALUES (%s, %s) RETURNING *",
            (body.title, body.content),
        ).fetchone()


@app.put("/api/notes/{note_id}")
def update_note(note_id: int, body: NoteIn):
    with db() as conn:
        note = conn.execute(
            "UPDATE notes SET title = %s, content = %s, updated_at = now() WHERE id = %s RETURNING *",
            (body.title, body.content, note_id),
        ).fetchone()
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int):
    with db() as conn:
        deleted = conn.execute("DELETE FROM notes WHERE id = %s", (note_id,)).rowcount
    if deleted == 0:
        raise HTTPException(404, "Note not found")
