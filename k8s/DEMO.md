# Гайд: запись скринкаста (≈ 5 минут)

## 0. Подготовка (не записывается, ~3 минуты)

1. **Терминал А — туннель к интерфейсу.** Открыть и не трогать до конца записи:
   ```bash
   ssh -N -L 18080:192.168.49.2:30080 myserver
   ```
   Команда ничего не выводит — так и должно быть.

2. **Терминал Б — рабочий.** Подключиться и очистить кластер, чтобы на записи всё создавалось с нуля:
   ```bash
   ssh myserver
   ```
   ```bash
   cd /root/notes-service && kubectl delete namespace notes --ignore-not-found && clear
   ```

3. Увеличить шрифт терминала Б (**⌘ +** 2–3 раза), чтобы текст читался на записи.

4. Открыть браузер на вкладке http://localhost:18080 — пока будет ошибка, это нормально: приложения ещё нет.

5. Разложить окна: терминал Б слева, браузер справа (или переключаться ⌘ Tab).

## 1. Запись

Начать запись: **⌘ Shift 5** → «Записать весь экран» → «Записать».

| Время | Шаг | Команда в терминале Б | Что сказать / показать |
|---|---|---|---|
| 0:00 | Кластер | `minikube status` | «Одноузловой кластер minikube запущен» |
| 0:15 | Dockerfile | `cat backend/Dockerfile` | «Dockerfile бэкенда; у фронтенда аналогичный на nginx» |
| 0:30 | **П. 4** docker-env | `eval $(minikube docker-env)` | «Переключаю docker на демон внутри minikube» |
| 0:40 | **П. 5** сборка | `docker build -t notes-backend:1.0.0 ./backend`<br>`docker build -t notes-frontend:1.0.0 ./frontend` | Сборка из кэша, пара секунд |
| 1:00 | Проверка | `docker images \| grep notes` | Образы лежат в minikube |
| 1:10 | **П. 6** image load | `eval $(minikube docker-env -u)`<br>`minikube image load notes-backend:1.0.0`<br>`minikube image load notes-frontend:1.0.0`<br>`minikube image ls \| grep notes` | «Второй способ — загрузить образ из обычного docker» |
| 1:40 | Манифесты | `ls k8s/` | 6 файлов: namespace, config, postgres, migrate, backend, frontend |
| 1:50 | ✅ **Запуск** | `kubectl apply -f k8s/` | Создаются namespace, configmap, secret, statefulset, job, deployments, services |
| 2:00 | Ожидание | `kubectl get pods -n notes -w` | Поды переходят в Running, migrate → Completed (~15–25 с), затем **Ctrl C** |
| 2:30 | ✅ **Вывод подов** | `kubectl get pods -n notes -o wide`<br>`kubectl get svc,pvc -n notes` | 4 пода, 3 сервиса, PVC Bound |
| 2:50 | ✅ **Масштабирование** | `kubectl scale deployment/backend -n notes --replicas=3` | `deployment.apps/backend scaled` |
| 3:00 | Проверка | `kubectl get pods -n notes -l app=backend` | Три пода backend в Running |
| 3:15 | Адрес UI | `minikube service frontend -n notes --url` | `http://192.168.49.2:30080` — браузер ходит туда через туннель |
| 3:25 | ✅ **Клики в UI** | Браузер → http://localhost:18080, **⌘ R** | Пустой список |
| | создать | Заголовок «Привет из minikube», текст → **Добавить** | Карточка и тост «Заметка добавлена» |
| | ещё одна | «Сдать ДЗ по Kubernetes» → **Добавить** | Две карточки |
| | изменить | Клик по карточке → поправить текст → **Сохранить** | Текст обновился |
| | удалить | Навести на карточку → корзина → **Отменить** → снова корзина | Исчезла, вернулась, исчезла |
| | поиск | Ввести «minikube» в поиск | «1 из 1» / фильтр |
| 4:30 | Бонус: балансировка | `for i in $(seq 9); do curl -s -D - -o /dev/null http://$(minikube ip):30080/api/notes \| grep -i x-instance; done` | Ответы от разных подов backend |
| 4:50 | Финал | `kubectl get pods -n notes` | Всё Running |

Остановить запись: кнопка ⏹ в строке меню. Файл появится на рабочем столе («Запись экрана … .mov»).

> В таблице `\|` — это обычная вертикальная черта `|`; при копировании из отрендеренного Markdown она скопируется правильно.

## 2. Если что-то пошло не так

| Симптом | Что сделать |
|---|---|
| Браузер не открывает localhost:18080 | Проверить, что терминал А с туннелем открыт; перезапустить команду туннеля |
| `kubectl apply` — `namespace "notes" is being terminated` | Подождать 10–20 с после `delete namespace` и повторить |
| Под в `ErrImagePull` / `ImagePullBackOff` | Повторить шаги 4–5 (`eval $(minikube docker-env)` + `docker build`) |
| `minikube status` → Stopped | `minikube start` и подождать минуту |
| Запись получилась длиннее 7 минут | Пропустить бонус-шаг 4:30 и `cat Dockerfile` |

## 3. После записи

Добавить файл записи в архив сдачи под именем `screencast.mov` (на него ссылается `Отчёт.md`).

После записи кластер можно оставить или остановить: `minikube stop`.
