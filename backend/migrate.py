# Разовый админ-процесс: создаёт схему БД. Запуск: python migrate.py
import os
from pathlib import Path

import psycopg

schema = (Path(__file__).parent / "schema.sql").read_text()
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    conn.execute(schema)
print("schema is up to date")
