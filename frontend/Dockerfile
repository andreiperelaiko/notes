FROM nginx:1.27-alpine

# Официальный образ nginx при старте подставляет переменные окружения в шаблоны из /etc/nginx/templates.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html
