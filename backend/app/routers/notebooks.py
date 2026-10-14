from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection, errors

from ..db import get_conn
from ..schemas import NotebookIn, NotebookOut

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])

_SELECT = """
    SELECT nb.id, nb.name, nb.created_at, COUNT(n.id)::int AS notes_count
    FROM notebooks nb
    LEFT JOIN notes n ON n.notebook_id = nb.id
"""


def _get_or_404(conn: Connection, notebook_id: int) -> dict:
    row = conn.execute(_SELECT + " WHERE nb.id = %s GROUP BY nb.id", (notebook_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notebook not found")
    return row


@router.get("", response_model=List[NotebookOut])
def list_notebooks(conn: Connection = Depends(get_conn)):
    return conn.execute(_SELECT + " GROUP BY nb.id ORDER BY nb.name").fetchall()


@router.get("/{notebook_id}", response_model=NotebookOut)
def get_notebook(notebook_id: int, conn: Connection = Depends(get_conn)):
    return _get_or_404(conn, notebook_id)


@router.post("", response_model=NotebookOut, status_code=status.HTTP_201_CREATED)
def create_notebook(body: NotebookIn, conn: Connection = Depends(get_conn)):
    try:
        row = conn.execute(
            "INSERT INTO notebooks (name) VALUES (%s) RETURNING id, name, created_at, 0 AS notes_count",
            (body.name.strip(),),
        ).fetchone()
    except errors.UniqueViolation:
        raise HTTPException(status.HTTP_409_CONFLICT, "Notebook with this name already exists")
    return row


@router.put("/{notebook_id}", response_model=NotebookOut)
def update_notebook(notebook_id: int, body: NotebookIn, conn: Connection = Depends(get_conn)):
    try:
        cur = conn.execute(
            "UPDATE notebooks SET name = %s WHERE id = %s", (body.name.strip(), notebook_id)
        )
    except errors.UniqueViolation:
        raise HTTPException(status.HTTP_409_CONFLICT, "Notebook with this name already exists")
    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notebook not found")
    return _get_or_404(conn, notebook_id)


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: int, conn: Connection = Depends(get_conn)):
    # Заметки не удаляются: notebook_id обнуляется через ON DELETE SET NULL.
    cur = conn.execute("DELETE FROM notebooks WHERE id = %s", (notebook_id,))
    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notebook not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
