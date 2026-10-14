# Notes

Простой сервис заметок: создать, посмотреть, изменить, удалить заметку.
Описание и соответствие 12 факторам — в [Отчёт.md](Отчёт.md).

## Запуск

```bash
cp .env.example .env
docker compose up --build
```

Откройте http://localhost:8080.

## Структура

```
backend/
  main.py          весь бэкенд: REST API на FastAPI
  schema.sql       схема БД
  migrate.py       разовый процесс, создаёт схему
frontend/
  public/index.html               страница со встроенным JS
  nginx/default.conf.template     nginx: статика + прокси /api на бэкенд
docker-compose.yml                db → migrate → backend → frontend
```

## API

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/notes` | список заметок |
| GET | `/api/notes/{id}` | одна заметка |
| POST | `/api/notes` | создать: `{"title": "...", "content": "..."}` |
| PUT | `/api/notes/{id}` | изменить: `{"title": "...", "content": "..."}` |
| DELETE | `/api/notes/{id}` | удалить |
| GET | `/api/health` | проверка, что бэкенд и БД живы |
