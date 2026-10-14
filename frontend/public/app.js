const $ = (selector) => document.querySelector(selector);

const list = $("#notes");
const search = $("#search");
const composer = $("#composer");
const newTitle = $("#new-title");
const newContent = $("#new-content");

const DRAFT_KEY = "notes:draft";   // черновик новой заметки в localStorage
const UNDO_MS = 5000;              // сколько можно отменить удаление

let notes = [];                    // заметки с сервера, новые сверху
let editingId = null;              // какая заметка открыта для редактирования
const pendingDeletes = new Map();  // id → таймер: удаление, которое ещё можно отменить

// ---------- API ----------

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
  $("#banner").hidden = true;
  list.setAttribute("aria-busy", "true");
  try {
    const data = await request("GET", "/api/notes");
    notes = data.filter((n) => !pendingDeletes.has(n.id));
    render();
  } catch (err) {
    $("#banner-text").textContent = "Не удалось загрузить заметки. " + err.message;
    $("#banner").hidden = false;
    $("#empty").hidden = true; // «пусто» здесь было бы неправдой: заметки просто не загрузились
  } finally {
    list.removeAttribute("aria-busy");
  }
}

// ---------- Отрисовка ----------

function render(highlightId) {
  list.replaceChildren(...notes.map((note) => row(note, note.id === highlightId)));
  applyFilter();
}

// Поиск только прячет строки, а не пересобирает список
function applyFilter() {
  const query = search.value.trim().toLowerCase();
  let shown = 0;
  for (const li of list.children) {
    const text = (li.note.title + "\n" + li.note.content).toLowerCase();
    li.hidden = query !== "" && !text.includes(query) && li.note.id !== editingId;
    if (!li.hidden) shown++;
  }

  $("#count").textContent = query ? `${shown} из ${notes.length}` : String(notes.length);
  $("#empty").hidden = shown > 0;
  $("#clear-search").hidden = !query;
  $("#empty-text").textContent = query
    ? `По запросу «${search.value.trim()}» ничего нет.`
    : "Здесь пока пусто. Напишите первую заметку в поле выше.";
}

function row(note, isNew) {
  const li = document.createElement("li");
  li.className = "note";
  li.classList.toggle("is-new", isNew);
  li.classList.toggle("is-editing", note.id === editingId);
  li.dataset.id = note.id;
  li.note = note;
  li.append(note.id === editingId ? editor(note) : summary(note));
  return li;
}

function summary(note) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "note-open";
  btn.innerHTML = `<span class="note-title"></span><time class="note-date"></time><span class="note-excerpt"></span>`;
  // textContent, а не innerHTML — HTML из заметки не выполнится (защита от XSS)
  btn.querySelector(".note-title").textContent = note.title;
  const time = btn.querySelector(".note-date");
  time.textContent = formatDate(note.updated_at);
  time.dateTime = note.updated_at;
  const excerpt = btn.querySelector(".note-excerpt");
  excerpt.textContent = note.content.trim() || "Без текста";
  excerpt.classList.toggle("is-empty", !note.content.trim());
  btn.setAttribute("aria-label", `${note.title}, изменено ${time.textContent}. Открыть для редактирования`);
  btn.onclick = () => openEditor(note.id);
  return btn;
}

function editor(note) {
  const form = document.createElement("form");
  form.className = "note-editor";
  form.noValidate = true;
  form.innerHTML = `
    <input class="field-title" name="title" maxlength="200" autocomplete="off" aria-label="Заголовок">
    <textarea class="field-content" name="content" rows="3" aria-label="Текст заметки"></textarea>
    <p class="field-error" role="alert" hidden></p>
    <div class="actions">
      <button type="button" class="btn btn-danger" data-action="delete">
        <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>Удалить
      </button>
      <span class="hint">Esc — отмена</span>
      <button type="button" class="btn btn-ghost" data-action="cancel">Отмена</button>
      <button type="submit" class="btn btn-primary">Сохранить</button>
    </div>`;
  form.elements.title.value = note.title;
  form.elements.content.value = note.content;

  form.onsubmit = (e) => { e.preventDefault(); saveEdit(); };
  form.querySelector('[data-action="cancel"]').onclick = closeEditor;
  form.querySelector('[data-action="delete"]').onclick = () => remove(note);
  form.oninput = () => { autosize(form.elements.content); showError(form, ""); };
  form.onkeydown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
    if (e.key === "Escape") closeEditor();
  };
  return form;
}

function formatDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `вчера, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

function autosize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

function showError(form, message) {
  const error = form.querySelector(".field-error");
  error.textContent = message;
  error.hidden = !message;
  form.querySelector(".field-title").setAttribute("aria-invalid", message ? "true" : "false");
}

// ---------- Редактирование ----------

function currentEditor() {
  return list.querySelector(".note-editor");
}

function isEditorDirty() {
  const form = currentEditor();
  const note = notes.find((n) => n.id === editingId);
  return form && note && (form.elements.title.value !== note.title || form.elements.content.value !== note.content);
}

async function openEditor(id) {
  // Несохранённые правки в другой заметке не теряем — сохраняем их перед переключением
  if (editingId !== null && isEditorDirty() && !(await saveEdit())) return;
  editingId = id;
  render();
  const form = currentEditor();
  autosize(form.elements.content);
  form.elements.title.focus();
}

function closeEditor() {
  const id = editingId;
  editingId = null;
  render();
  list.querySelector(`[data-id="${id}"] .note-open`)?.focus();
}

async function saveEdit() {
  const form = currentEditor();
  const title = form.elements.title.value.trim();
  if (!title) {
    showError(form, "Заголовок не может быть пустым.");
    form.elements.title.focus();
    return false;
  }
  try {
    const saved = await request("PUT", `/api/notes/${editingId}`, { title, content: form.elements.content.value });
    notes = notes.map((n) => (n.id === saved.id ? saved : n));
    closeEditor();
    toast("Сохранено");
    return true;
  } catch (err) {
    toast(err.message, { error: true });
    return false;
  }
}

// ---------- Новая заметка ----------

function openComposer() {
  composer.classList.add("is-open");
  autosize(newContent);
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: newTitle.value, content: newContent.value }));
}

function restoreDraft() {
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  if (!draft || (!draft.title && !draft.content)) return;
  newTitle.value = draft.title;
  newContent.value = draft.content;
  openComposer();
}

// Сворачиваем только по Esc: если сворачивать при потере фокуса, список
// прыгает вверх прямо под курсором и клик по заметке промахивается.
composer.addEventListener("focusin", openComposer);
composer.oninput = () => {
  saveDraft();
  autosize(newContent);
  showError(composer, "");
};
composer.onkeydown = (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) composer.requestSubmit();
  if (e.key === "Escape") {
    document.activeElement.blur(); // черновик остаётся
    if (!newTitle.value && !newContent.value) composer.classList.remove("is-open");
  }
};
composer.onsubmit = async (e) => {
  e.preventDefault();
  const title = newTitle.value.trim();
  if (!title) {
    showError(composer, "Сначала напишите заголовок.");
    newTitle.focus();
    return;
  }
  try {
    const note = await request("POST", "/api/notes", { title, content: newContent.value });
    notes.unshift(note);
    composer.reset();
    localStorage.removeItem(DRAFT_KEY);
    newContent.style.height = "";
    render(note.id);
    toast("Заметка добавлена");
    newTitle.focus();
  } catch (err) {
    toast(err.message, { error: true });
  }
};

// ---------- Удаление с отменой ----------

function remove(note) {
  const next = list.querySelector(`[data-id="${note.id}"]`)?.nextElementSibling;
  editingId = null;
  notes = notes.filter((n) => n.id !== note.id);
  render();
  (next ? list.querySelector(`[data-id="${next.dataset.id}"] .note-open`) : search)?.focus();

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

// ---------- Уведомление ----------

let toastTimer;
function toast(message, { error = false, action, onAction } = {}) {
  const el = $("#toast");
  const button = $("#toast-action");
  $("#toast-text").textContent = message;
  button.hidden = !action;
  button.textContent = action || "";
  button.onclick = () => { hideToast(); onAction(); };
  el.classList.toggle("is-error", error);
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? UNDO_MS : error ? 6000 : 2500);
}

function hideToast() {
  $("#toast").classList.remove("is-visible");
}

// ---------- Поиск и горячие клавиши ----------

search.addEventListener("input", applyFilter);
search.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (search.value) { search.value = ""; applyFilter(); } else search.blur();
});
$("#clear-search").onclick = () => { search.value = ""; applyFilter(); search.focus(); };
$("#retry").onclick = load;

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea");
  if (e.key === "/" && !typing) {
    e.preventDefault();
    search.focus();
  }
});

restoreDraft();
load();
