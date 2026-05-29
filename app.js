const STORAGE_KEY = "alex-app-state-v1";

const emptyState = {
  finances: [],
  tasks: [],
  meetings: [],
  notes: [],
};

let state = loadState();
let deferredInstallPrompt = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const formatMoney = (value) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(value || 0);

const formatDate = (value) => {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...emptyState, ...JSON.parse(saved) } : structuredClone(emptyState);
  } catch {
    return structuredClone(emptyState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $("#storage-status").textContent = `Guardado local · ${new Date().toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function setDefaultDates() {
  $$('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = todayISO();
  });
}

function switchView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  $$(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  $("#view-title").textContent = {
    dashboard: "Inicio",
    finances: "Finanzas",
    tasks: "Tareas",
    meetings: "Reuniones",
    notes: "Notas",
  }[viewId];
}

function render() {
  renderDashboard();
  renderFinances();
  renderTasks();
  renderMeetings();
  renderNotes();
}

function renderDashboard() {
  const income = state.finances.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = state.finances.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const openTasks = state.tasks.filter((task) => !task.done);
  const todayTasks = openTasks.filter((task) => task.dueDate <= todayISO()).sort(sortTasks);
  const upcomingMeetings = state.meetings
    .filter((meeting) => `${meeting.date}T${meeting.time}` >= new Date().toISOString().slice(0, 16))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const nextMeeting = upcomingMeetings[0];

  $("#metric-balance").textContent = formatMoney(income - expenses);
  $("#metric-income-expense").textContent = `Ingresos ${formatMoney(income)} · Gastos ${formatMoney(expenses)}`;
  $("#metric-open-tasks").textContent = openTasks.length;
  $("#metric-due-tasks").textContent = `${todayTasks.length} para hoy o vencidas`;
  $("#metric-next-meeting").textContent = nextMeeting ? nextMeeting.title : "Sin reuniones";
  $("#metric-next-meeting-time").textContent = nextMeeting ? `${formatDate(nextMeeting.date)} · ${nextMeeting.time}` : "Agenda limpia";
  $("#metric-notes").textContent = state.notes.length;

  renderList("#today-tasks", todayTasks.slice(0, 5), renderTaskItem, "No hay tareas urgentes.");
  renderList("#recent-finances", [...state.finances].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), renderFinanceItem, "Aun no hay movimientos.");
  renderList("#upcoming-meetings", upcomingMeetings.slice(0, 5), renderMeetingItem, "No hay reuniones proximas.");
}

function renderFinances() {
  const income = state.finances.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = state.finances.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  $("#finance-summary").textContent = `${formatMoney(income - expenses)} disponible`;
  renderList(
    "#finance-list",
    [...state.finances].sort((a, b) => b.date.localeCompare(a.date)),
    renderFinanceItem,
    "Registra ingresos y gastos para ver tu balance."
  );
}

function renderTasks() {
  const filter = $("#task-filter").value;
  let tasks = [...state.tasks].sort(sortTasks);
  if (filter === "open") tasks = tasks.filter((task) => !task.done);
  if (filter === "done") tasks = tasks.filter((task) => task.done);
  renderList("#task-list", tasks, renderTaskItem, "Crea tareas para organizar trabajo y vida personal.");
}

function renderMeetings() {
  const sorted = [...state.meetings].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  $("#meeting-summary").textContent = `${sorted.length} registradas`;
  renderList("#meeting-list", sorted, renderMeetingItem, "Agenda reuniones y guarda notas clave.");
}

function renderNotes() {
  const query = $("#note-search").value.trim().toLowerCase();
  const notes = [...state.notes]
    .filter((note) => `${note.title} ${note.tag} ${note.body}`.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  renderList("#note-list", notes, renderNoteItem, "Guarda ideas, decisiones y seguimiento.");
}

function renderList(selector, items, renderer, emptyMessage) {
  const container = $(selector);
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<p class="empty-message">${emptyMessage}</p>`;
    return;
  }
  items.forEach((item) => container.appendChild(renderer(item)));
}

function renderFinanceItem(item) {
  const element = document.createElement("article");
  element.className = "list-item";
  element.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(item.description)}</p>
        <p class="item-meta">${escapeHTML(item.category)} · ${formatDate(item.date)}</p>
      </div>
      <span class="${item.type === "income" ? "amount-income" : "amount-expense"}">
        ${item.type === "income" ? "+" : "-"}${formatMoney(item.amount)}
      </span>
    </div>
    <div class="item-actions">
      <button class="danger-button" data-delete="finances" data-id="${item.id}" type="button">Eliminar</button>
    </div>
  `;
  return element;
}

function renderTaskItem(task) {
  const element = document.createElement("article");
  element.className = `list-item ${task.done ? "done" : ""}`;
  element.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(task.title)}</p>
        <p class="item-meta">${escapeHTML(task.area)} · ${formatDate(task.dueDate)}</p>
      </div>
      <span class="pill ${task.priority === "Alta" ? "warn" : "blue"}">${escapeHTML(task.priority)}</span>
    </div>
    <div class="item-actions">
      <button class="secondary-button" data-toggle-task="${task.id}" type="button">${task.done ? "Reabrir" : "Completar"}</button>
      <button class="danger-button" data-delete="tasks" data-id="${task.id}" type="button">Eliminar</button>
    </div>
  `;
  return element;
}

function renderMeetingItem(meeting) {
  const element = document.createElement("article");
  element.className = "list-item";
  element.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(meeting.title)}</p>
        <p class="item-meta">${formatDate(meeting.date)} · ${meeting.time} · ${escapeHTML(meeting.people || "Sin participantes")}</p>
      </div>
      <span class="pill blue">Agenda</span>
    </div>
    ${meeting.notes ? `<p class="item-meta">${escapeHTML(meeting.notes)}</p>` : ""}
    <div class="item-actions">
      <button class="danger-button" data-delete="meetings" data-id="${meeting.id}" type="button">Eliminar</button>
    </div>
  `;
  return element;
}

function renderNoteItem(note) {
  const element = document.createElement("article");
  element.className = "list-item";
  element.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(note.title)}</p>
        <p class="item-meta">${escapeHTML(note.tag || "Sin etiqueta")} · ${new Date(note.createdAt).toLocaleDateString("es-PE")}</p>
      </div>
      <span class="pill">${escapeHTML(note.tag || "Nota")}</span>
    </div>
    <p class="item-meta">${escapeHTML(note.body)}</p>
    <div class="item-actions">
      <button class="danger-button" data-delete="notes" data-id="${note.id}" type="button">Eliminar</button>
    </div>
  `;
  return element;
}

function sortTasks(a, b) {
  const priority = { Alta: 0, Media: 1, Baja: 2 };
  return a.done - b.done || a.dueDate.localeCompare(b.dueDate) || priority[a.priority] - priority[b.priority];
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function handleSubmit(formId, collection, mapper) {
  $(formId).addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form).entries());
    state[collection].push({ id: uid(), ...mapper(formData) });
    form.reset();
    setDefaultDates();
    saveState();
    render();
  });
}

function seedDemoData() {
  state = {
    finances: [
      { id: uid(), type: "income", description: "Ingreso principal", category: "Trabajo", amount: 4200, date: todayISO() },
      { id: uid(), type: "expense", description: "Alquiler", category: "Casa", amount: 1350, date: todayISO() },
      { id: uid(), type: "expense", description: "Supermercado", category: "Comida", amount: 260, date: todayISO() },
    ],
    tasks: [
      { id: uid(), title: "Enviar reporte semanal", area: "Trabajo", priority: "Alta", dueDate: todayISO(), done: false },
      { id: uid(), title: "Revisar presupuesto del mes", area: "Finanzas", priority: "Media", dueDate: todayISO(), done: false },
      { id: uid(), title: "Ordenar documentos personales", area: "Personal", priority: "Baja", dueDate: todayISO(), done: true },
    ],
    meetings: [
      { id: uid(), title: "Planificacion de proyecto", people: "Equipo", date: todayISO(), time: "10:30", notes: "Definir prioridades y responsables." },
    ],
    notes: [
      { id: uid(), title: "Meta del mes", tag: "Personal", body: "Separar ahorro antes de gastos variables.", createdAt: new Date().toISOString() },
    ],
  };
  saveState();
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alex-app-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $$(".nav-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("#task-filter").addEventListener("change", renderTasks);
  $("#note-search").addEventListener("input", renderNotes);
  $("#seed-demo").addEventListener("click", seedDemoData);
  $("#export-data").addEventListener("click", exportData);

  document.body.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete]");
    const toggleTaskButton = event.target.closest("[data-toggle-task]");

    if (deleteButton) {
      const collection = deleteButton.dataset.delete;
      state[collection] = state[collection].filter((item) => item.id !== deleteButton.dataset.id);
      saveState();
      render();
    }

    if (toggleTaskButton) {
      const task = state.tasks.find((item) => item.id === toggleTaskButton.dataset.toggleTask);
      if (task) task.done = !task.done;
      saveState();
      render();
    }
  });

  handleSubmit("#finance-form", "finances", (data) => ({
    type: data.type,
    description: data.description.trim(),
    category: data.category.trim(),
    amount: Number(data.amount),
    date: data.date,
  }));

  handleSubmit("#task-form", "tasks", (data) => ({
    title: data.title.trim(),
    area: data.area,
    priority: data.priority,
    dueDate: data.dueDate,
    done: false,
  }));

  handleSubmit("#meeting-form", "meetings", (data) => ({
    title: data.title.trim(),
    people: data.people.trim(),
    date: data.date,
    time: data.time,
    notes: data.notes.trim(),
  }));

  handleSubmit("#note-form", "notes", (data) => ({
    title: data.title.trim(),
    tag: data.tag.trim(),
    body: data.body.trim(),
    createdAt: new Date().toISOString(),
  }));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#install-app").classList.remove("hidden");
  });

  $("#install-app").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#install-app").classList.add("hidden");
  });
}

$("#today-label").textContent = new Date().toLocaleDateString("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

setDefaultDates();
bindEvents();
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
