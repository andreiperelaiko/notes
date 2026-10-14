// Фронтенд обращается к API по относительному пути /api — nginx проксирует его на бэкенд.
const API = "/api";

const state = {
  notebooks: [],
  filter: "all", // "all" | "none" | <notebook id>
  search: "",
  notes: [],
  current: null, // открытая заметка или {id: null} для новой
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let msg = data && data.detail ? data.detail : res.statusText;
    if (Array.isArray(msg)) msg = msg.map((e) => e.msg).join("; ");
    throw new Error(msg);
  }
  return data;
}

function toast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (isError ? " error" : "");
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2500);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// ---------- Блокноты ----------

async function loadNotebooks() {
  state.notebooks = await api("/notebooks");
  renderNotebooks();
  renderNotebookSelect();
}

function renderNotebooks() {
  const list = $("notebooks");
  list.innerHTML = "";
  const item = (key, name, extra = []) => {
    const li = el("li", { onclick: () => selectFilter(key) }, el("span", { class: "name" }, name), ...extra);
    if (String(state.filter) === String(key)) li.classList.add("active");
    return li;
  };
  list.append(item("all", "Все заметки"), item("none", "Без блокнота"));
  for (const nb of state.notebooks) {
    const rename = el("button", { class: "icon", title: "Переименовать", onclick: (e) => { e.stopPropagation(); renameNotebook(nb); } }, "✎");
    const remove = el("button", { class: "icon", title: "Удалить", onclick: (e) => { e.stopPropagation(); deleteNotebook(nb); } }, "✕");
    list.append(item(nb.id, nb.name, [el("span", { class: "count" }, String(nb.notes_count)), rename, remove]));
  }
}

function renderNotebookSelect() {
  const select = $("note-notebook");
  const value = select.value;
  select.innerHTML = "";
  select.append(el("option", { value: "" }, "Без блокнота"));
  for (const nb of state.notebooks) select.append(el("option", { value: nb.id }, nb.name));
  select.value = value;
}

async function createNotebook(e) {
  e.preventDefault();
  const input = $("notebook-name");
  try {
    await api("/notebooks", { method: "POST", body: { name: input.value } });
    input.value = "";
    await loadNotebooks();
  } catch (err) {
    toast(err.message, true);
  }
}

async function renameNotebook(nb) {
  const name = prompt("Новое название блокнота", nb.name);
  if (!name || name === nb.name) return;
  try {
    await api(`/notebooks/${nb.id}`, { method: "PUT", body: { name } });
    await loadNotebooks();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteNotebook(nb) {
  if (!confirm(`Удалить блокнот «${nb.name}»? Заметки останутся без блокнота.`)) return;
  try {
    await api(`/notebooks/${nb.id}`, { method: "DELETE" });
    if (String(state.filter) === String(nb.id)) state.filter = "all";
    await Promise.all([loadNotebooks(), loadNotes()]);
  } catch (err) {
    toast(err.message, true);
  }
}

function selectFilter(key) {
  state.filter = key;
  renderNotebooks();
  loadNotes();
}

// ---------- Заметки ----------

async function loadNotes() {
  const params = new URLSearchParams();
  if (state.filter === "none") params.set("without_notebook", "true");
  else if (state.filter !== "all") params.set("notebook_id", state.filter);
  if (state.search) params.set("q", state.search);
  try {
    state.notes = await api(`/notes?${params}`);
  } catch (err) {
    toast(err.message, true);
    state.notes = [];
  }
  renderNotes();
}

function renderNotes() {
  const list = $("notes");
  list.innerHTML = "";
  if (!state.notes.length) {
    list.append(el("li", { class: "empty-list" }, "Заметок нет"));
    return;
  }
  for (const n of state.notes) {
    const li = el(
      "li",
      { onclick: () => openNote(n) },
      el("div", { class: "title" }, (n.pinned ? "📌 " : "") + n.title),
      el("div", { class: "preview" }, n.content.slice(0, 120) || "—"),
    );
    if (state.current && state.current.id === n.id) li.classList.add("active");
    list.append(li);
  }
}

function openNote(note) {
  state.current = note;
  $("empty").hidden = true;
  $("note-form").hidden = false;
  $("note-title").value = note.title || "";
  $("note-content").value = note.content || "";
  $("note-pinned").checked = !!note.pinned;
  $("note-notebook").value = note.notebook_id ?? "";
  $("note-updated").textContent = note.updated_at
    ? "Изменено " + new Date(note.updated_at).toLocaleString("ru-RU")
    : "Новая заметка";
  $("delete-note").hidden = !note.id;
  renderNotes();
  $("note-title").focus();
}

function newNote() {
  const notebookId = ["all", "none"].includes(String(state.filter)) ? null : Number(state.filter);
  openNote({ id: null, title: "", content: "", pinned: false, notebook_id: notebookId });
}

async function saveNote(e) {
  e.preventDefault();
  const notebookValue = $("note-notebook").value;
  const body = {
    title: $("note-title").value,
    content: $("note-content").value,
    pinned: $("note-pinned").checked,
    notebook_id: notebookValue ? Number(notebookValue) : null,
  };
  try {
    const saved = state.current.id
      ? await api(`/notes/${state.current.id}`, { method: "PATCH", body })
      : await api("/notes", { method: "POST", body });
    toast("Сохранено");
    await Promise.all([loadNotes(), loadNotebooks()]);
    openNote(saved);
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteNote() {
  if (!state.current || !state.current.id) return;
  if (!confirm("Удалить заметку?")) return;
  try {
    await api(`/notes/${state.current.id}`, { method: "DELETE" });
    state.current = null;
    $("note-form").hidden = true;
    $("empty").hidden = false;
    await Promise.all([loadNotes(), loadNotebooks()]);
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- Инициализация ----------

let searchTimer;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    loadNotes();
  }, 250);
});
$("notebook-form").addEventListener("submit", createNotebook);
$("new-note").addEventListener("click", newNote);
$("note-form").addEventListener("submit", saveNote);
$("delete-note").addEventListener("click", deleteNote);

loadNotebooks().then(loadNotes).catch((err) => toast(err.message, true));
