from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NotebookIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class NotebookOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    notes_count: int = 0


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=100_000)
    notebook_id: Optional[int] = None
    pinned: bool = False


class NoteUpdate(BaseModel):
    """Частичное обновление: передаются только изменяемые поля.

    notebook_id можно явно передать как null, чтобы убрать заметку из блокнота.
    """

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, max_length=100_000)
    notebook_id: Optional[int] = None
    pinned: Optional[bool] = None


class NoteOut(BaseModel):
    id: int
    title: str
    content: str
    notebook_id: Optional[int]
    pinned: bool
    created_at: datetime
    updated_at: datetime
