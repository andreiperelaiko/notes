const $ = (id) => document.getElementById(id);
const form = $("form");
const title = $("title");
const content = $("content");
const search = $("search");
const grid = $("notes");

const DRAFT_KEY = "notes:draft"; // черновик новой заметки в localStorage
const UNDO_MS = 5000;            // сколько секунд можно отменить удаление

let notes = [];                   // заметки с бэкенда, новые сверху
let editingId = null;             // id редактируемой заметки или null, если пишем новую
const pendingDeletes = new Map(); // id → таймер удаления, которое ещё можно отменить

// ---------- Работа с API ----------

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw apiError(0, "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.");
  }
  if (res.ok) return res.status === 204 ? null : res.json();
  if (res.status === 404) throw apiError(404, "Эта заметка уже удалена.");
  if (res.status === 422) throw apiError(422, "Заголовок не может быть пустым.");
  throw apiError(res.status, `Сервер ответил ошибкой (${res.status}). Попробуйте ещё раз.`);
}

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function load() {
  $("banner").hidden = true;
  try {
    const data = await request("GET", "/api/notes");
    notes = data.filter((n) => !pendingDeletes.has(n.id));
    render();
  } catch (err) {
    $("banner-text").textContent = "Не удалось загрузить заметки. " + err.message;
    $("banner").hidden = false;
    $("empty").hidden = true; // «пусто» было бы неправдой: заметки просто не загрузились
  }
}

// ---------- Отрисовка ----------

function render(highlightId) {
  grid.replaceChildren(...notes.map((n) => card(n, n.id === highlightId)));
  applyFilter();
}

// Поиск только прячет карточки, а не пересобирает их — поэтому ничего не мигает
function applyFilter() {
  const query = search.value.trim().toLowerCase();
  let shown = 0;
  for (const div of grid.children) {
    const text = (div.note.title + "\n" + div.note.content).toLowerCase();
    div.hidden = query !== "" && !text.includes(query);
    if (!div.hidden) shown++;
  }
  $("count").textContent = query ? `${shown} из ${notes.length}` : notes.length || "";
  $("empty").hidden = shown > 0;
  $("clear-search").hidden = !query;
  $("empty-text").textContent = query
    ? `По запросу «${search.value.trim()}» ничего нет 🔍`
    : "Пока пусто — напишите первую заметку ✨";
}

function card(note, isNew) {
  const div = document.createElement("article");
  div.className = "note";
  div.classList.toggle("is-new", isNew);
  div.classList.toggle("editing", note.id === editingId);
  div.dataset.id = note.id;
  div.note = note;
  div.innerHTML = `
    <button type="button" class="note-open"><h2></h2><p></p></button>
    <footer>
      <time></time>
      <button type="button" class="delete"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>
    </footer>`;
  // textContent, а не innerHTML — HTML из заметки не выполнится (защита от XSS)
  div.querySelector("h2").textContent = note.title;
  const p = div.querySelector("p");
  p.textContent = note.content.trim() || "Без текста";
  p.classList.toggle("is-empty", !note.content.trim());
  const time = div.querySelector("time");
  time.textContent = timeAgo(note.updated_at);
  time.dateTime = note.updated_at;
  time.title = new Date(note.updated_at).toLocaleString("ru-RU");

  const open = div.querySelector(".note-open");
  open.setAttribute("aria-label", `${note.title}, ${time.textContent}. Открыть для редактирования`);
  open.onclick = () => startEdit(note);
  const del = div.querySelector(".delete");
  del.setAttribute("aria-label", `Удалить «${note.title}»`);
  del.title = "Удалить";
  del.onclick = () => remove(note);
  return div;
}

function timeAgo(iso) {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ч назад`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
}

function toast(message, { error = false, action, onAction } = {}) {
  const el = $("toast");
  const button = $("toast-action");
  $("toast-text").textContent = message;
  button.hidden = !action;
  button.textContent = action || "";
  button.onclick = () => { el.className = "toast"; onAction(); };
  el.className = "toast show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = "toast"), action ? UNDO_MS : error ? 6000 : 2500);
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
  title.setAttribute("aria-invalid", message ? "true" : "false");
}

function autosize() {
  content.style.height = "";
  if (content.value) content.style.height = content.scrollHeight + "px";
}

// ---------- Форма: новая заметка или редактирование ----------

function isDirty() {
  const note = notes.find((n) => n.id === editingId);
  return note && (title.value !== note.title || content.value !== note.content);
}

async function startEdit(note) {
  if (editingId === note.id) return title.focus();
  // Несохранённые правки в другой заметке не теряем — сохраняем их перед переключением
  if (isDirty() && !(await save())) return;
  editingId = note.id;
  title.value = note.title;
  content.value = note.content;
  setMode();
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  form.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  title.focus({ preventScroll: true });
}

// Выйти из редактирования: в форму возвращается черновик новой заметки
function resetForm() {
  const id = editingId;
  editingId = null;
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
  title.value = draft.title || "";
  content.value = draft.content || "";
  setMode();
  return id;
}

function setMode() {
  const editing = editingId !== null;
  form.classList.toggle("editing", editing);
  $("submit").textContent = editing ? "Сохранить" : "Добавить";
  $("cancel").hidden = !editing;
  $("delete").hidden = !editing;
  showError("");
  autosize();
  for (const div of grid.children) div.classList.toggle("editing", div.note.id === editingId);
}

function focusCard(id) {
  grid.querySelector(`[data-id="${id}"] .note-open`)?.focus();
}

async function save() {
  const note = { title: title.value.trim(), content: content.value };
  if (!note.title) {
    showError("Сначала напишите заголовок.");
    title.focus();
    return false;
  }
  try {
    if (editingId !== null) {
      const saved = await request("PUT", `/api/notes/${editingId}`, note);
      notes = notes.map((n) => (n.id === saved.id ? saved : n));
      resetForm();
      render();
      focusCard(saved.id);
      toast("Сохранено");
    } else {
      const created = await request("POST", "/api/notes", note);
      notes.unshift(created);
      localStorage.removeItem(DRAFT_KEY);
      resetForm();
      render(created.id);
      toast("Заметка добавлена");
    }
    return true;
  } catch (err) {
    toast(err.message, { error: true });
    return false;
  }
}

function cancelEdit() {
  const id = resetForm();
  focusCard(id);
}

// ---------- Удаление с возможностью отменить ----------

function remove(note) {
  if (editingId === note.id) resetForm();
  const next = grid.querySelector(`[data-id="${note.id}"]`)?.nextElementSibling;
  notes = notes.filter((n) => n.id !== note.id);
  render();
  if (next) focusCard(next.dataset.id); else search.focus();

  const timer = setTimeout(() => commitDelete(note.id), UNDO_MS);
  pendingDeletes.set(note.id, timer);
  toast(`Заметка «${note.title.slice(0, 40)}» удалена`, {
    action: "Отменить",
    onAction() {
      clearTimeout(timer);
      pendingDeletes.delete(note.id);
      notes.push(note);
      notes.sort((a, b) => b.id - a.id);
      render(note.id);
      focusCard(note.id);
    },
  });
}

async function commitDelete(id) {
  pendingDeletes.delete(id);
  try {
    await request("DELETE", `/api/notes/${id}`);
  } catch (err) {
    if (err.status !== 404) {
      toast(err.message, { error: true });
      load();
    }
  }
}

// Если вкладку закрыли, пока шёл отсчёт отмены, — всё равно удаляем
window.addEventListener("pagehide", () => {
  for (const [id, timer] of pendingDeletes) {
    clearTimeout(timer);
    fetch(`/api/notes/${id}`, { method: "DELETE", keepalive: true });
  }
});

// ---------- Обработчики ----------

form.onsubmit = (e) => { e.preventDefault(); save(); };
form.oninput = () => {
  showError("");
  autosize();
  if (editingId === null) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: title.value, content: content.value }));
  }
};
form.onkeydown = (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  if (e.key === "Escape") {
    if (editingId !== null) cancelEdit();
    else document.activeElement.blur(); // черновик не стираем
  }
};
$("cancel").onclick = cancelEdit;
$("delete").onclick = () => remove(notes.find((n) => n.id === editingId));
$("retry").onclick = load;

search.oninput = applyFilter;
search.onkeydown = (e) => {
  if (e.key === "Escape" && search.value) { search.value = ""; applyFilter(); }
};
$("clear-search").onclick = () => { search.value = ""; applyFilter(); search.focus(); };

resetForm(); // подставит черновик, если он остался с прошлого раза
load();
