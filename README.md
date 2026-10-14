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
  public/index.html, style.css, app.js   страница, стили, логика
  nginx/default.conf.template     nginx: статика + прокси /api на бэкенд
docker-compose.yml                db → migrate → backend → frontend
```

## 12 факторов

Подробная аргументация — в [Отчёт.md](Отчёт.md). Коротко:

| # | Фактор | Как выполнен | Где смотреть |
|---|---|---|---|
| I | Кодовая база | Один git-репозиторий, из него разворачиваются все окружения; различаются только переменные окружения | этот репозиторий |
| II | Зависимости | Явно перечислены с точными версиями и ставятся внутрь образа; системные пакеты не нужны (`psycopg[binary]`); базовые образы зафиксированы по версии | `backend/requirements.txt`, `*/Dockerfile` |
| III | Конфигурация | Всё, что меняется между окружениями, — в переменных окружения: `DATABASE_URL`, `PORT`, `BACKEND_URL`, `NGINX_PORT`. В коде нет паролей и адресов, `.env` не коммитится | `.env.example`, `backend/main.py`, `frontend/nginx/default.conf.template` |
| IV | Сторонние службы | PostgreSQL подключается по `DATABASE_URL`; чтобы перейти на другую БД (например, облачную), достаточно поменять переменную | `docker-compose.yml` |
| V | Сборка, релиз, выполнение | Сборка — `docker compose build` (образ), релиз — образ + `.env`, выполнение — `docker compose up`. Код в запущенном контейнере не меняется | `*/Dockerfile`, `docker-compose.yml` |
| VI | Процессы без состояния | Бэкенд ничего не хранит в памяти между запросами, все данные — в PostgreSQL. Черновик заметки живёт в `localStorage` браузера, а не на сервере | `backend/main.py` |
| VII | Привязка портов | Бэкенд сам поднимает HTTP-сервер (Uvicorn) на `$PORT`, nginx — на `$NGINX_PORT` | `backend/Dockerfile` |
| VIII | Параллелизм | Масштабирование запуском копий: `docker compose up --scale backend=3`; заголовок `X-Instance` показывает, какая копия ответила | `backend/main.py` |
| IX | Утилизируемость | Старт меньше секунды; по `SIGTERM` Uvicorn дожидается текущих запросов и завершается (`exec` в Dockerfile делает его PID 1); незавершённые транзакции откатывает PostgreSQL | `backend/Dockerfile` |
| X | Паритет окружений | В разработке те же образы, тот же `docker-compose.yml` и тот же PostgreSQL 16, что и в эксплуатации | `docker-compose.yml` |
| XI | Журналирование | Логи пишутся в stdout/stderr (Uvicorn, nginx), файлов логов нет; собирает их окружение: `docker compose logs backend` | — |
| XII | Админ-процессы | Создание схемы БД — разовый процесс `python migrate.py` из того же образа с тем же `DATABASE_URL`; в compose это сервис `migrate`, он отрабатывает перед бэкендом. Повторный запуск безопасен (`CREATE TABLE IF NOT EXISTS`) | `backend/migrate.py`, `backend/schema.sql` |

## API

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/notes` | список заметок |
| GET | `/api/notes/{id}` | одна заметка |
| POST | `/api/notes` | создать: `{"title": "...", "content": "..."}` |
| PUT | `/api/notes/{id}` | изменить: `{"title": "...", "content": "..."}` |
| DELETE | `/api/notes/{id}` | удалить |
| GET | `/api/health` | проверка, что бэкенд и БД живы |
