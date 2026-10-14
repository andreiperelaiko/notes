from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from psycopg import Connection, errors, sql

from ..db import get_conn
from ..schemas import NoteCreate, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])

_COLUMNS = "id, title, content, notebook_id, pinned, created_at, updated_at"


def _notebook_missing() -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Notebook does not exist")


@router.get("", response_model=List[NoteOut])
def list_notes(
    notebook_id: Optional[int] = Query(default=None, description="Фильтр по блокноту"),
    without_notebook: bool = Query(default=False, description="Только заметки без блокнота"),
    q: Optional[str] = Query(default=None, max_length=200, description="Поиск по заголовку и тексту"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    conn: Connection = Depends(get_conn),
):
    where = []
    params: list = []
    if without_notebook:
        where.append("notebook_id IS NULL")
    elif notebook_id is not None:
        where.append("notebook_id = %s")
        params.append(notebook_id)
    if q:
        where.append("(title ILIKE %s OR content ILIKE %s)")
        pattern = f"%{q}%"
        params += [pattern, pattern]

    query = f"SELECT {_COLUMNS} FROM notes"
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT %s OFFSET %s"
    params += [limit, offset]
    return conn.execute(query, params).fetchall()


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: int, conn: Connection = Depends(get_conn)):
    row = conn.execute(f"SELECT {_COLUMNS} FROM notes WHERE id = %s", (note_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return row


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, conn: Connection = Depends(get_conn)):
    try:
        return conn.execute(
            f"""
            INSERT INTO notes (title, content, notebook_id, pinned)
            VALUES (%s, %s, %s, %s)
            RETURNING {_COLUMNS}
            """,
            (body.title.strip(), body.content, body.notebook_id, body.pinned),
        ).fetchone()
    except errors.ForeignKeyViolation:
        raise _notebook_missing()


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, body: NoteUpdate, conn: Connection = Depends(get_conn)):
    changes = body.model_dump(exclude_unset=True)
    for field in ("title", "content", "pinned"):
        if field in changes and changes[field] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Field '{field}' cannot be null")
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    if not changes:
        return get_note(note_id, conn)

    assignments = sql.SQL(", ").join(
        sql.SQL("{} = {}").format(sql.Identifier(k), sql.Placeholder(k)) for k in changes
    )
    query = sql.SQL(
        "UPDATE notes SET {assignments}, updated_at = now() WHERE id = %(id)s RETURNING {columns}"
    ).format(assignments=assignments, columns=sql.SQL(_COLUMNS))
    try:
        row = conn.execute(query, {**changes, "id": note_id}).fetchone()
    except errors.ForeignKeyViolation:
        raise _notebook_missing()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return row


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, conn: Connection = Depends(get_conn)):
    cur = conn.execute("DELETE FROM notes WHERE id = %s", (note_id,))
    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
