#!/usr/bin/env bash
# Суфлёр для скринкаста: показывает очередную команду, ждёт Enter и выполняет её.
# Запуск из корня проекта:  ./k8s/demo.sh
# Enter — выполнить команду, s + Enter — пропустить, Ctrl+C — остановить kubectl get -w.

cd "$(dirname "$0")/.." || exit 1
trap ':' INT   # Ctrl+C прерывает только текущую команду (kubectl get -w), а не сам скрипт

BOLD=$'\e[1m'; CYAN=$'\e[36m'; GRAY=$'\e[90m'; RESET=$'\e[0m'

step() {   # step "заголовок" "команда"
  echo
  echo "${GRAY}# $1${RESET}"
  printf '%s$ %s%s' "$BOLD$CYAN" "$2" "$RESET"
  read -r answer
  [ "$answer" = "s" ] && return
  eval "$2"
}

clear
step "Кластер minikube"                         "minikube status"
step "Dockerfile бэкенда"                       "cat backend/Dockerfile"
step "П.4: docker смотрит в демон minikube"     'eval $(minikube docker-env)'
step "П.5: сборка образа бэкенда"               "docker build -t notes-backend:1.0.0 ./backend"
step "П.5: сборка образа фронтенда"             "docker build -t notes-frontend:1.0.0 ./frontend"
step "Образы внутри minikube"                   "docker images | grep notes"
step "Возвращаемся к обычному docker"           'eval $(minikube docker-env -u)'
step "П.6: загрузка образов в minikube"         "minikube image load notes-backend:1.0.0 && minikube image load notes-frontend:1.0.0"
step "Образы в minikube"                        "minikube image ls | grep notes"
step "Манифесты"                                "ls k8s/*.yaml"
step "Запуск приложения и зависимостей"         "kubectl apply -f k8s/"
step "Ждём запуска (Ctrl+C, когда всё Running)" "kubectl get pods -n notes -w"
step "Все поды"                                 "kubectl get pods -n notes -o wide"
step "Сервисы и диск"                           "kubectl get svc,pvc -n notes"
step "Масштабирование бэкенда до 3 реплик"      "kubectl scale deployment/backend -n notes --replicas=3"
step "Реплики бэкенда"                          "kubectl get pods -n notes -l app=backend"
step "Адрес интерфейса (браузер — через туннель на localhost:18080)" "minikube service frontend -n notes --url"
echo
echo "${GRAY}# Теперь клики в браузере: http://localhost:18080 — потом Enter${RESET}"
read -r _
step "Запросы расходятся по репликам"           'for i in $(seq 9); do curl -s -D - -o /dev/null http://$(minikube ip):30080/api/notes | grep -i x-instance; done'
step "Итог"                                     "kubectl get pods -n notes"
echo
echo "${GRAY}# Готово — можно останавливать запись${RESET}"
