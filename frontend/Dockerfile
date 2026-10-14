FROM nginx:1.27-alpine

# Шаблон рендерится официальным entrypoint nginx через envsubst при старте контейнера,
# поэтому адрес бэкенда и порт задаются переменными окружения, а не зашиваются в образ.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html

ENV NGINX_PORT=80 \
    BACKEND_URL=http://backend:8000

EXPOSE 80
