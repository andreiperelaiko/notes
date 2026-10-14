const $ = (id) => document.getElementById(id);
const form = $("form");
const title = $("title");
const content = $("content");

let notes = [];       // все заметки, загруженные с бэкенда
let editingId = null; // id редактируемой заметки или null, если создаём новую

// ---------- Работа с API ----------

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("Ошибка сервера: " + res.status);
  return res.status === 204 ? null : res.json();
}

async function load() {
  try {
    notes = await request("GET", "/api/notes");
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- Отрисовка ----------

function render() {
  const query = $("search").value.trim().toLowerCase();
  const visible = notes.filter(
    (n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)
  );

  $("count").textContent = notes.length;
  $("empty").hidden = visible.length > 0;
  $("empty").textContent = query ? "Ничего не нашлось 🔍" : "Пока пусто — напишите первую заметку ✨";

  const list = $("notes");
  list.innerHTML = "";
  for (const note of visible) list.append(card(note));
}

function card(note) {
  const div = document.createElement("article");
  div.className = "note";
  div.innerHTML = `
    <h3></h3>
    <p></p>
    <footer><time></time><button class="delete" title="Удалить">🗑</button></footer>`;
  // textContent, а не innerHTML — чтобы HTML из заметки не выполнялся (защита от XSS)
  div.querySelector("h3").textContent = note.title;
  div.querySelector("p").textContent = note.content;
  div.querySelector("time").textContent = timeAgo(note.updated_at);
  div.querySelector("time").title = new Date(note.updated_at).toLocaleString("ru-RU");

  div.onclick = () => startEdit(note);
  div.querySelector(".delete").onclick = (e) => {
    e.stopPropagation(); // чтобы клик по корзине не открыл редактирование
    remove(note);
  };
  return div;
}

function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function toast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = "toast"), 2000);
}

// ---------- Действия ----------

function startEdit(note) {
  editingId = note.id;
  title.value = note.title;
  content.value = note.content;
  form.classList.add("editing");
  $("submit").textContent = "Сохранить";
  $("cancel").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  title.focus();
}

function resetForm() {
  editingId = null;
  form.reset();
  form.classList.remove("editing");
  $("submit").textContent = "Добавить";
  $("cancel").hidden = true;
}

async function save(e) {
  e.preventDefault();
  if (!title.value.trim()) return title.focus();
  const note = { title: title.value.trim(), content: content.value };
  try {
    if (editingId) await request("PUT", "/api/notes/" + editingId, note);
    else await request("POST", "/api/notes", note);
    toast(editingId ? "Сохранено" : "Заметка добавлена");
    resetForm();
    load();
  } catch (err) {
    toast(err.message, true);
  }
}

async function remove(note) {
  if (!confirm(`Удалить «${note.title}»?`)) return;
  try {
    await request("DELETE", "/api/notes/" + note.id);
    if (editingId === note.id) resetForm();
    toast("Заметка удалена");
    load();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- Обработчики ----------

form.onsubmit = save;
$("cancel").onclick = resetForm;
$("search").oninput = render;
form.onkeydown = (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  if (e.key === "Escape") resetForm();
};

load();
