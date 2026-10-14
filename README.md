# Notes Service

Сервис заметок: блокноты и заметки с поиском, закреплением и CRUD через REST API.
Подробное описание и соответствие 12 факторам — в [Отчёт.md](Отчёт.md).

## Быстрый старт (Docker)

```bash
cp .env.example .env        # при необходимости поменять пароль/порт
docker compose up --build -d
```

Откройте http://localhost:8080. Swagger UI API доступен на бэкенде по `/docs`; через nginx проксируется только `/api/*`.

Порядок старта: `db` → `migrate` (разовый процесс, применяет миграции и завершается) → `backend` → `frontend`.

Полезные команды:

```bash
docker compose logs -f backend                 # поток логов (JSON в stdout)
docker compose run --rm migrate                # повторно прогнать миграции
docker compose up -d --scale backend=3         # несколько экземпляров бэкенда
docker compose down                            # остановить (данные остаются в volume pgdata)
```

## Запуск без Docker (локальная разработка)

Нужны Python 3.9+ и доступный PostgreSQL.

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export DATABASE_URL=postgresql://notes:notes@localhost:5432/notes
.venv/bin/python -m app.migrate
.venv/bin/python -m app            # слушает $PORT (по умолчанию 8000)
```

Фронтенд — статика в `frontend/public`, ходит в API по относительному пути `/api`,
поэтому его нужно отдавать через прокси (nginx из `frontend/`) на том же origin.
Для отдачи с другого origin задайте бэкенду `CORS_ORIGINS`.

## Переменные окружения бэкенда

| Переменная | Обязательна | По умолчанию | Назначение |
|---|---|---|---|
| `DATABASE_URL` | да | — | строка подключения к PostgreSQL |
| `PORT` | нет | `8000` | порт HTTP-сервера |
| `HOST` | нет | `0.0.0.0` | адрес для bind |
| `LOG_LEVEL` | нет | `INFO` | уровень логирования |
| `DB_POOL_MIN_SIZE` / `DB_POOL_MAX_SIZE` | нет | `1` / `10` | размер пула соединений |
| `CORS_ORIGINS` | нет | пусто | разрешённые origin через запятую |

Фронтенд (nginx): `NGINX_PORT` (по умолчанию `80`), `BACKEND_URL` (по умолчанию `http://backend:8000`).

## REST API

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health` | проверка живости + доступности БД |
| GET | `/api/notebooks` | список блокнотов с количеством заметок |
| POST | `/api/notebooks` | создать блокнот `{"name": "..."}` |
| GET | `/api/notebooks/{id}` | получить блокнот |
| PUT | `/api/notebooks/{id}` | переименовать блокнот |
| DELETE | `/api/notebooks/{id}` | удалить блокнот (заметки остаются без блокнота) |
| GET | `/api/notes?notebook_id=&without_notebook=&q=&limit=&offset=` | список/поиск заметок |
| POST | `/api/notes` | создать заметку `{"title", "content", "notebook_id", "pinned"}` |
| GET | `/api/notes/{id}` | получить заметку |
| PATCH | `/api/notes/{id}` | частично обновить заметку |
| DELETE | `/api/notes/{id}` | удалить заметку |

Пример:

```bash
curl -X POST localhost:8080/api/notes -H 'Content-Type: application/json' \
     -d '{"title": "Первая заметка", "content": "Привет"}'
```
