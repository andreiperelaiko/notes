FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py migrate.py schema.sql ./

ENV PORT=8000
# exec — чтобы uvicorn стал PID 1 и сам получал SIGTERM для корректного завершения.
CMD exec uvicorn main:app --host 0.0.0.0 --port $PORT
