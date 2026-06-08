// ── Constants ──
const STORAGE_KEY = "alex-app-state-v1";

const DEFAULT_CONTEXTS = [
  { id: "trabajo",  label: "Trabajo",  emoji: "💼", dot: "#e63946", bg: "#2a1215", color: "#ff6b6b" },
  { id: "personal", label: "Personal", emoji: "🏠", dot: "#4dabf7", bg: "#0d2137", color: "#74c0fc" },
];

const PALETTE = [
  { dot: "#e63946", bg: "#2a1215", color: "#ff6b6b" },
  { dot: "#4dabf7", bg: "#0d2137", color: "#74c0fc" },
  { dot: "#2ecc71", bg: "#0d2318", color: "#6ee7b7" },
  { dot: "#f4a261", bg: "#2a1a0d", color: "#fbbf24" },
  { dot: "#9775fa", bg: "#1a1230", color: "#c084fc" },
  { dot: "#f472b6", bg: "#2a0d1a", color: "#f9a8d4" },
  { dot: "#38bdf8", bg: "#0d1f2a", color: "#7dd3fc" },
  { dot: "#a3e635", bg: "#0f2200", color: "#bef264" },
];

const GCAL_COLOR  = { bg: "#0d1f3a", color: "#74c0fc", dot: "#4285f4" };
const DEFAULT_COLOR = { bg: "#1c1c1c", color: "#999", dot: "#666" };

const emptyState = {
  finances: [],
  tasks: [],
  meetings: [],
  notes: [],
  contexts: DEFAULT_CONTEXTS,
  gym: [],
  workLogs: [],
  goals: [],
  savings: [],
  investments: [],
  jobs: [
    { id: "job1", name: "", amount: 0, payDay: 15 },
    { id: "job2", name: "", amount: 0, payDay: 30 },
  ],
  budgets: {},
  userName: "",
  health: [],
  water: {},
  mood: {},
  debts: [],
  recurringExpenses: [],
  mentalLogs: [],
};

let state = loadState();
let deferredInstallPrompt = null;

// ── Pomodoro state ──
const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;
const POMO_LONG = 15 * 60;
let pomoMode = "work";   // "work" | "break" | "long"
let pomoTime = POMO_WORK;
let pomoInterval = null;
let pomoRunning = false;
let pomoSessions = 0;    // completed work sessions today

// ── Chart instances ──
let chartBar = null;
let chartDonut = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ── Security helpers ──
// Validates CSS color values — only allows safe hex colors or CSS vars
const HEX_RE = /^#[0-9A-Fa-f]{3,8}$/;
function safeColor(val, fallback = "#666") {
  if (typeof val === "string" && (HEX_RE.test(val.trim()) || val.trim().startsWith("var(--"))) return val.trim();
  return fallback;
}

// ── Formatters ──
const formatMoney = (v) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(v || 0);
const formatDate  = (v) => { if (!v) return ""; return new Date(`${v}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); };
const todayISO    = () => new Date().toISOString().slice(0, 10);
const uid         = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ── State ──
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...emptyState, ...parsed, jobs: parsed.jobs || emptyState.jobs };
    }
    return structuredClone(emptyState);
  } catch { return structuredClone(emptyState); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const el = $("#storage-status");
  if (el) el.textContent = `Guardado · ${new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
  renderContextSelects();
  renderGoalSelects();
}

function setDefaultDates() {
  $$('input[type="date"]').forEach((i) => { if (!i.value) i.value = todayISO(); });
}

// ── Views ──
function switchView(viewId) {
  $$(".view").forEach((v) => v.classList.toggle("active-view", v.id === viewId));
  const activeView = document.getElementById(viewId);
  if (activeView) {
    activeView.classList.remove("view-enter");
    void activeView.offsetWidth; // restart animation
    activeView.classList.add("view-enter");
  }
  $$(".nav-tab, .mbn-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === viewId));
  const titles = {
    dashboard: "Inicio", finances: "Finanzas", organizer: "Actividades",
    meetings: "Reuniones", performance: "Metas", calendar: "Calendario",
  };
  $("#view-title").textContent = titles[viewId] || viewId;
  renderContextSelects();
  renderGoalSelects();
  if (viewId === "calendar") renderCalendar();
  if (viewId === "performance") { renderGoals(); renderGoalHistory(); renderGym(); renderWorkLog(); }
  if (viewId === "meetings") { renderMeetings(); renderNotes(); }
  if (viewId === "organizer") renderTasks();
}

function switchOrgTab(tabId) {
  // legacy — no longer used but kept for safety
  $("#organizer").querySelectorAll(".org-panel").forEach((p) => p.classList.add("hidden"));
  $("#organizer").querySelectorAll(".org-tab").forEach((t) => t.classList.toggle("active", t.dataset.org === tabId));
  const el = $(`#org-${tabId}`); if (el) el.classList.remove("hidden");
}

function switchMeetTab(tabId) {
  $("#meetings").querySelectorAll(".org-panel").forEach((p) => p.classList.add("hidden"));
  $("#meetings").querySelectorAll(".org-tab").forEach((t) => t.classList.toggle("active", t.dataset.meet === tabId));
  $(`#meet-${tabId}`).classList.remove("hidden");
  if (tabId === "notes") renderNotes();
  if (tabId === "meetings") renderMeetings();
}

function switchFinTab(tabId) {
  $("#finances").querySelectorAll(".org-panel").forEach((p) => p.classList.add("hidden"));
  $("#finances").querySelectorAll(".org-tab").forEach((t) => t.classList.toggle("active", t.dataset.fin === tabId));
  $(`#fin-${tabId}`).classList.remove("hidden");
}

function switchPerfTab(tabId) {
  $("#performance").querySelectorAll(".org-panel").forEach((p) => p.classList.add("hidden"));
  $("#performance").querySelectorAll(".org-tab").forEach((t) => t.classList.toggle("active", t.dataset.perf === tabId));
  $(`#perf-${tabId}`).classList.remove("hidden");
  if (tabId === "stats") { renderGym(); renderWorkLog(); }
  if (tabId === "goals") renderGoals();
  if (tabId === "history") renderGoalHistory();
  if (tabId === "mental") renderMental();
}

// ── Contexts ──
function getContextById(id) { return state.contexts.find((c) => c.id === id) || null; }

function getEventColor(ev) {
  if (ev.kind === "gcal") return GCAL_COLOR;
  const ctx = getContextById(ev.context);
  return ctx ? { bg: ctx.bg, color: ctx.color, dot: ctx.dot } : DEFAULT_COLOR;
}

function renderContextSelects() {
  const opts = state.contexts.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.emoji)} ${escapeHTML(c.label)}</option>`).join("");
  $$("select[name='context']").forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = opts;
    if (cur && sel.querySelector(`option[value="${cur}"]`)) sel.value = cur;
  });
}

function renderGoalSelects() {
  const goals = state.goals || [];
  const noLink = `<option value="">Sin meta</option>`;
  const noLinkAll = `<option value="all">Todas las metas</option>`;
  const opts = goals.map((g) => {
    const cat = CAT_CONFIG[g.category || g.type] || {};
    return `<option value="${g.id}">${g.emoji || "🎯"} ${escapeHTML(g.title)}</option>`;
  }).join("");

  // Task form link dropdown
  const taskGoalSel = $("#task-goal-select");
  if (taskGoalSel) { const cur = taskGoalSel.value; taskGoalSel.innerHTML = noLink + opts; if (cur) taskGoalSel.value = cur; }

  // Task list filter dropdown
  const taskGoalFilter = $("#task-goal-filter");
  if (taskGoalFilter) { const cur = taskGoalFilter.value; taskGoalFilter.innerHTML = noLinkAll + opts; if (cur) taskGoalFilter.value = cur; }
}

function renderCalFilters() {
  const bar = $("#cal-filters");
  bar.innerHTML = `
    <span class="cal-filter-label">Ver:</span>
    <button class="cal-filter${calFilter === "all" ? " active" : ""}" data-ctx="all">Todos</button>
    ${state.contexts.map((c) => `<button class="cal-filter${calFilter === c.id ? " active" : ""}" data-ctx="${escapeHTML(c.id)}">${escapeHTML(c.emoji)} ${escapeHTML(c.label)}</button>`).join("")}
    ${gcalIsConnected() ? `<button class="cal-filter${calFilter === "gcal" ? " active" : ""}" data-ctx="gcal">🔵 Google</button>` : ""}
    <button class="cal-filter-manage" id="btn-manage-ctx" type="button">⚙️ Gestionar</button>`;

  $$(".cal-filter").forEach((btn) => btn.addEventListener("click", () => {
    $$(".cal-filter").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    calFilter = btn.dataset.ctx;
    renderCalendar();
  }));

  $("#btn-manage-ctx").addEventListener("click", () => {
    const p = $("#ctx-manager");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) renderContextManager();
  });
}

function renderContextManager() {
  const panel = $("#ctx-manager");
  panel.innerHTML = `
    <div class="ctx-manager-header">
      <h3>Gestionar contextos</h3>
      <button class="secondary-button" id="ctx-close" type="button">Cerrar</button>
    </div>
    <div class="ctx-list" id="ctx-list">
      ${state.contexts.map((c) => `
        <div class="ctx-row" data-id="${escapeHTML(c.id)}">
          <span class="ctx-swatch" style="background:${safeColor(c.dot)}"></span>
          <input class="ctx-emoji-input" value="${escapeHTML(c.emoji)}" maxlength="2" data-field="emoji" data-id="${escapeHTML(c.id)}" />
          <input class="ctx-label-input" value="${escapeHTML(c.label)}" data-field="label" data-id="${escapeHTML(c.id)}" />
          <div class="ctx-palette">
            ${PALETTE.map((p, pi) => `<button class="ctx-color-swatch${c.dot === p.dot ? " selected" : ""}" style="background:${safeColor(p.dot)}" data-palette="${pi}" data-id="${escapeHTML(c.id)}" type="button"></button>`).join("")}
          </div>
          <button class="danger-button ctx-delete" data-id="${c.id}" type="button">Eliminar</button>
        </div>`).join("")}
    </div>
    <div class="ctx-add-row">
      <input id="ctx-new-emoji" placeholder="🏷️" maxlength="2" class="ctx-emoji-input" />
      <input id="ctx-new-label" placeholder="Nuevo contexto..." class="ctx-label-input" />
      <button class="primary-button" id="ctx-add-btn" type="button">+ Agregar</button>
    </div>`;

  $("#ctx-close").addEventListener("click", () => panel.classList.add("hidden"));

  panel.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const ctx = state.contexts.find((c) => c.id === input.dataset.id);
      if (ctx) { ctx[input.dataset.field] = input.value; saveState(); renderCalFilters(); renderCalendar(); }
    });
  });

  panel.querySelectorAll(".ctx-color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ctx = state.contexts.find((c) => c.id === btn.dataset.id);
      const p = PALETTE[btn.dataset.palette];
      if (ctx && p) { Object.assign(ctx, p); saveState(); renderContextManager(); renderCalFilters(); renderCalendar(); }
    });
  });

  panel.querySelectorAll(".ctx-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.contexts.length <= 1) { alert("Debe quedar al menos un contexto."); return; }
      state.contexts = state.contexts.filter((c) => c.id !== btn.dataset.id);
      saveState(); renderContextManager(); renderCalFilters(); renderCalendar();
    });
  });

  $("#ctx-add-btn").addEventListener("click", () => {
    const emoji = $("#ctx-new-emoji").value.trim() || "🏷️";
    const label = $("#ctx-new-label").value.trim();
    if (!label) return;
    const p = PALETTE[state.contexts.length % PALETTE.length];
    state.contexts.push({ id: uid(), label, emoji, ...p });
    saveState(); renderContextManager(); renderCalFilters(); renderCalendar();
    $("#ctx-new-label").value = ""; $("#ctx-new-emoji").value = "";
  });
}

// ── Escaping ──
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function escapeHTML(v) {
  return String(v || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

// ── Render helpers ──
function renderList(selector, items, renderer, emptyMsg) {
  const el = $(selector);
  el.innerHTML = "";
  if (!items.length) { el.innerHTML = `<p class="empty-message">${emptyMsg}</p>`; return; }
  items.forEach((item) => el.appendChild(renderer(item)));
}

// ── Dashboard ──
// ── Reactive mascot: a small companion that reflects today's progress ──
let _lastMascotStage = null;
function renderMascot() {
  const emojiEl = $("#mascot-emoji"), msgEl = $("#mascot-msg"), subEl = $("#mascot-sub"), card = $("#mascot-card");
  if (!emojiEl || !msgEl) return;
  const today = todayISO();
  const tasksToday = (state.tasks || []).filter((t) => t.dueDate === today);
  const doneToday = tasksToday.filter((t) => t.done).length;
  const totalToday = tasksToday.length;
  const gymToday = (state.gym || []).some((g) => g.date === today);
  const mentalToday = (state.mentalLogs || []).some((l) => l.date === today);
  const score = doneToday + (gymToday ? 1 : 0) + (mentalToday ? 1 : 0);
  const max = Math.max(1, totalToday + 2);
  const ratio = score / max;

  let stage, emoji, msg, sub;
  if (totalToday === 0 && score === 0) {
    stage = "idle"; emoji = "🌱"; msg = "Un nuevo día, un lienzo en blanco";
    sub = "Agrega una tarea o registra algo para empezar";
  } else if (ratio >= 1) {
    stage = "fire"; emoji = "🔥"; msg = "¡Día perfecto! Estás imparable";
    sub = `${doneToday}/${totalToday || "—"} tareas · todo registrado hoy`;
  } else if (ratio >= 0.6) {
    stage = "happy"; emoji = "🤩"; msg = "¡Vas muy bien hoy!";
    sub = `${doneToday}/${totalToday} tareas completadas`;
  } else if (ratio > 0) {
    stage = "ok"; emoji = "🙂"; msg = "Buen avance, sigue así";
    sub = `${doneToday}/${totalToday} tareas · cada paso cuenta`;
  } else {
    stage = "sleepy"; emoji = "😴"; msg = "Aún no hay actividad hoy";
    sub = "Tu compañero te espera — ¡anímate a avanzar algo!";
  }
  msgEl.textContent = msg;
  if (subEl) subEl.textContent = sub;
  emojiEl.textContent = emoji;
  if (stage !== _lastMascotStage) {
    emojiEl.classList.remove("mascot-react");
    void emojiEl.offsetWidth;
    emojiEl.classList.add("mascot-react");
    if (stage === "fire" && _lastMascotStage && _lastMascotStage !== "fire" && !prefersReducedMotion()) celebrate(card);
    _lastMascotStage = stage;
  }
}

function renderDashboard() {
  const income = state.finances.filter((i) => i.type === "income").reduce((s, i) => s + i.amount, 0);
  const expenses = state.finances.filter((i) => i.type === "expense").reduce((s, i) => s + i.amount, 0);
  const jobIncome = (state.jobs || []).reduce((s, j) => s + (Number(j.amount) || 0), 0);
  const totalIncome = income + jobIncome;
  const openTasks = state.tasks.filter((t) => !t.done);
  const todayTasks = openTasks.filter((t) => t.dueDate <= todayISO()).sort(sortTasks);

  // Gym streak
  const streak = calcGymStreak();
  const gymWeekDays = gymDaysThisWeek();

  // Goals
  const activeGoals = (state.goals || []).filter((g) => Number(g.current) < Number(g.target));

  const balanceEl = $("#metric-balance");
  if (balanceEl) {
    const newVal = formatMoney(totalIncome - expenses);
    if (balanceEl.textContent !== newVal) { balanceEl.textContent = newVal; bumpCounter(balanceEl); }
  }
  $("#metric-income-expense").textContent = `Ingresos ${formatMoney(totalIncome)} · Gastos ${formatMoney(expenses)}`;
  $("#metric-open-tasks").textContent = openTasks.length;
  $("#metric-due-tasks").textContent = `${todayTasks.length} para hoy o vencidas`;
  $("#metric-gym-streak").textContent = `${streak} días`;
  $("#metric-gym-week").textContent = `Esta semana: ${gymWeekDays} días`;
  $("#metric-goals").textContent = activeGoals.length;
  $("#metric-goals-sub").textContent = activeGoals.length ? `${activeGoals[0].emoji || "🎯"} ${activeGoals[0].title}` : "Sin metas activas";

  renderList("#today-tasks", todayTasks.slice(0, 5), renderTaskItem, "No hay tareas urgentes.");
  renderMascot();
  renderList("#recent-finances", [...state.finances].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), renderFinanceItem, "Sin movimientos.");

  const goalsEl = $("#dash-goals");
  goalsEl.innerHTML = "";
  if (!activeGoals.length) { goalsEl.innerHTML = `<p class="empty-message">Sin metas activas.</p>`; }
  else {
    activeGoals.slice(0, 4).forEach((g) => {
      const gcurrent = calcLinkedProgress(g);
      const pct = Math.min(100, Math.round((gcurrent / Number(g.target)) * 100));
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML = `
        <div class="item-main">
          <p class="item-title">${g.emoji || "🎯"} ${escapeHTML(g.title)}</p>
          <span class="item-meta">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="item-meta">${escapeHTML(String(gcurrent))} / ${escapeHTML(String(g.target))} ${escapeHTML(g.unit)}</p>`;
      goalsEl.appendChild(div);
    });
  }
}

// ── Finances ──
function renderFinances() {
  const job1 = state.jobs?.[0] || {};
  const job2 = state.jobs?.[1] || {};
  const extras = state.finances.filter((i) => i.type === "income" && i.subtype === "extra");
  const expenses = state.finances.filter((i) => i.type === "expense");

  const totalJob1 = Number(job1.amount) || 0;
  const totalJob2 = Number(job2.amount) || 0;
  const totalExtra = extras.reduce((s, i) => s + i.amount, 0);
  const totalExpense = expenses.reduce((s, i) => s + i.amount, 0);
  const totalIncome = totalJob1 + totalJob2 + totalExtra;

  // Jobs display
  if (job1.name || job1.amount) {
    $("#job1-name").value = job1.name || "";
    $("#job1-amount").value = job1.amount || "";
    $("#job1-payday").value = job1.payDay || "";
    $("#job1-display").innerHTML = job1.name ? `<div class="list-item"><div class="item-main"><p class="item-title">${escapeHTML(job1.name)}</p><span class="amount-income">${formatMoney(job1.amount)}</span></div><p class="item-meta">Día de pago: ${job1.payDay || "—"}</p></div>` : "";
  }
  if (job2.name || job2.amount) {
    $("#job2-name").value = job2.name || "";
    $("#job2-amount").value = job2.amount || "";
    $("#job2-payday").value = job2.payDay || "";
    $("#job2-display").innerHTML = job2.name ? `<div class="list-item"><div class="item-main"><p class="item-title">${escapeHTML(job2.name)}</p><span class="amount-income">${formatMoney(job2.amount)}</span></div><p class="item-meta">Día de pago: ${job2.payDay || "—"}</p></div>` : "";
  }

  $("#job1-summary").textContent = formatMoney(totalJob1);
  $("#job2-summary").textContent = formatMoney(totalJob2);
  $("#extra-summary").textContent = formatMoney(totalExtra);
  $("#expense-summary").textContent = `Total: ${formatMoney(totalExpense)}`;
  $("#income-total").textContent = formatMoney(totalIncome);

  renderList("#extra-list", [...extras].sort((a, b) => b.date.localeCompare(a.date)), renderFinanceItem, "Sin ingresos extras.");
  renderList("#expense-list", [...expenses].sort((a, b) => b.date.localeCompare(a.date)), renderFinanceItem, "Sin gastos registrados.");

  // Savings
  renderSavings();
  // Investments
  renderInvestments();
}

function renderSavings() {
  const list = $("#savings-list");
  if (!list) return;
  list.innerHTML = "";
  if (!(state.savings || []).length) { list.innerHTML = `<p class="empty-message">Sin metas de ahorro.</p>`; return; }
  state.savings.forEach((s) => {
    const pct = Math.min(100, Math.round((Number(s.current) / Number(s.target)) * 100));
    const div = document.createElement("div");
    div.className = "savings-goal";
    div.innerHTML = `
      <div class="item-main">
        <div>
          <p class="savings-name">${s.emoji || "🏦"} ${escapeHTML(s.name)}</p>
          ${s.deadline ? `<p class="item-meta">Límite: ${formatDate(s.deadline)}</p>` : ""}
        </div>
        <button class="danger-button" data-delete-saving="${s.id}" type="button">✕</button>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="savings-meta">
        <span>Progreso: <strong>${formatMoney(s.current)}</strong></span>
        <span>Meta: <strong>${formatMoney(s.target)}</strong> · ${pct}%</span>
      </div>`;
    list.appendChild(div);
  });
}

function renderInvestments() {
  const list = $("#investment-list");
  if (!list) return;
  list.innerHTML = "";
  if (!(state.investments || []).length) { list.innerHTML = `<p class="empty-message">Sin inversiones registradas.</p>`; return; }
  state.investments.forEach((inv) => {
    const div = document.createElement("div");
    div.className = "investment-card";
    div.innerHTML = `
      <div>
        <p class="investment-name">${escapeHTML(inv.name)}</p>
        <p class="investment-meta">${escapeHTML(inv.type)} · ${formatDate(inv.date)}</p>
        ${inv.notes ? `<p class="investment-meta">${escapeHTML(inv.notes)}</p>` : ""}
      </div>
      <div style="text-align:right">
        <p class="investment-amount">${formatMoney(inv.amount)}</p>
        <button class="danger-button" data-delete-inv="${inv.id}" style="margin-top:6px" type="button">✕</button>
      </div>`;
    list.appendChild(div);
  });
}

// ── Tasks ──
function renderTasks() {
  const filter = $("#task-filter")?.value || "all";
  const goalFilter = $("#task-goal-filter")?.value || "all";
  let tasks = [...state.tasks].sort(sortTasks);
  if (filter === "open") tasks = tasks.filter((t) => !t.done);
  if (filter === "done") tasks = tasks.filter((t) => t.done);
  if (goalFilter !== "all") tasks = tasks.filter((t) => t.goalId === goalFilter);
  renderList("#task-list", tasks, renderTaskItem, "Sin tareas. Agrega una o crea una desde una meta.");
  renderTaskBento();
}

// ── Bento-style stats strip for the task dashboard ──
function renderTaskBento() {
  const el = $("#task-bento");
  if (!el) return;
  const all = state.tasks || [];
  const today = todayISO();
  const pending = all.filter((t) => !t.done);
  const overdue = pending.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = pending.filter((t) => t.dueDate === today);
  const completedToday = all.filter((t) => t.done && t.dueDate === today).length;
  const highPrio = pending.filter((t) => t.priority === "alta").length;
  const nextTask = [...pending].sort(sortTasks)[0];

  el.innerHTML = `
    <div class="bento-cell glow-card bento-span-2 bento-row-2">
      <span class="bento-label">📌 Próxima tarea</span>
      <p class="bento-big">${nextTask ? escapeHTML(nextTask.title) : "¡Todo al día! 🎉"}</p>
      ${nextTask ? `<span class="bento-sub">${formatDate(nextTask.dueDate)} · prioridad ${escapeHTML(nextTask.priority || "media")}</span>` : `<span class="bento-sub">No tienes pendientes activos</span>`}
    </div>
    <div class="bento-cell glow-card">
      <span class="bento-label">⏳ Pendientes</span>
      <p class="bento-num counter-roll">${pending.length}</p>
    </div>
    <div class="bento-cell glow-card">
      <span class="bento-label">✅ Hoy completadas</span>
      <p class="bento-num counter-roll" style="color:var(--green)">${completedToday}</p>
    </div>
    <div class="bento-cell glow-card${overdue.length ? " bento-alert" : ""}">
      <span class="bento-label">⚠️ Atrasadas</span>
      <p class="bento-num counter-roll" style="color:${overdue.length ? "var(--red)" : "inherit"}">${overdue.length}</p>
    </div>
    <div class="bento-cell glow-card">
      <span class="bento-label">📅 Vencen hoy</span>
      <p class="bento-num counter-roll" style="color:var(--orange, #f4a261)">${dueToday.length}</p>
    </div>
  `;
}

function sortTasks(a, b) {
  const p = { Alta: 0, Media: 1, Baja: 2 };
  return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.dueDate || "").localeCompare(b.dueDate || "") || (p[a.priority] || 1) - (p[b.priority] || 1);
}

function renderTaskItem(task) {
  const el = document.createElement("article");
  el.className = `list-item ${task.done ? "done" : ""}`;
  el.draggable = true;
  el.dataset.taskId = task.id;
  const ctx = getContextById(task.context);
  const ctxLabel = ctx ? `${escapeHTML(ctx.emoji)} ${escapeHTML(ctx.label)}` : "";
  const ctxStyle = ctx ? `background:${safeColor(ctx.bg)};color:${safeColor(ctx.color)};border:1px solid ${safeColor(ctx.dot)}30` : "";
  const attachHTML = (task.attachments || []).map((a) =>
    a.type?.startsWith("image/")
      ? `<a href="${a.dataUrl}" target="_blank"><img src="${a.dataUrl}" class="task-thumb" /></a>`
      : `<a href="${a.dataUrl}" download="${escapeHTML(a.name)}" class="file-chip-sm">📄 ${escapeHTML(a.name)}</a>`
  ).join("");
  // Goal badge
  const linkedGoal = task.goalId ? (state.goals || []).find((g) => g.id === task.goalId) : null;
  const goalBadge = linkedGoal ? `<span class="task-goal-badge">🎯 ${escapeHTML(linkedGoal.title)}</span>` : "";
  const priorityColors = { alta: "#e63946", media: "#f4a261", baja: "#2ecc71" };
  const priorityLabel = { alta: "Alta", media: "Media", baja: "Baja" };
  const prio = task.priority || "media";
  const prioBadge = `<span class="priority-badge" style="background:${priorityColors[prio]}22;color:${priorityColors[prio]};border:1px solid ${priorityColors[prio]}44">${priorityLabel[prio]}</span>`;
  const recurBadge = task.recurrentFreq ? `<span class="recur-badge">🔄 ${task.recurrentFreq}</span>` : "";

  el.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${task.done ? `<span class="task-strike-text">${escapeHTML(task.title)}</span>` : escapeHTML(task.title)}</p>
        <p class="item-meta">${formatDate(task.dueDate)}</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${ctxLabel ? `<span class="pill" style="${ctxStyle}">${ctxLabel}</span>` : ""}
        ${goalBadge}
      </div>
    </div>
    ${task.body ? `<p class="item-meta task-body">${escapeHTML(task.body)}</p>` : ""}
    ${renderSubtasks(task)}
    ${attachHTML ? `<div class="task-attachments">${attachHTML}</div>` : ""}
    <div class="item-actions">
      ${prioBadge}${recurBadge}
      <button class="secondary-button" data-toggle-task="${task.id}" type="button">${task.done ? "Reabrir" : "Completar"}</button>
      <button class="danger-button" data-delete="tasks" data-id="${task.id}" type="button">Eliminar</button>
    </div>`;
  return el;
}

// ── Meetings ──
function renderMeetings() {
  const sorted = [...state.meetings].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const el = $("#meeting-summary");
  if (el) el.textContent = `${sorted.length} registradas`;
  renderList("#meeting-list", sorted, renderMeetingItem, "Agenda reuniones importantes.");
}

function renderMeetingItem(m) {
  const el = document.createElement("article");
  el.className = "list-item";
  const ctx = getContextById(m.context);
  const ctxLabel = ctx ? `${escapeHTML(ctx.emoji)} ${escapeHTML(ctx.label)}` : "";
  const ctxStyle = ctx ? `background:${safeColor(ctx.bg)};color:${safeColor(ctx.color)};border:1px solid ${safeColor(ctx.dot)}30` : "";
  el.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(m.title)}</p>
        <p class="item-meta">${formatDate(m.date)} · ${m.time} · ${escapeHTML(m.people || "")}</p>
      </div>
      ${ctxLabel ? `<span class="pill" style="${ctxStyle}">${ctxLabel}</span>` : ""}
    </div>
    ${m.notes ? `<p class="item-meta">${escapeHTML(m.notes)}</p>` : ""}
    <div class="item-actions">
      <button class="danger-button" data-delete="meetings" data-id="${m.id}" type="button">Eliminar</button>
    </div>`;
  return el;
}

// ── Notes ──
function renderNotes() {
  const query = ($("#note-search")?.value || "").trim().toLowerCase();
  const notes = [...state.notes]
    .filter((n) => `${n.title} ${n.tag} ${n.body}`.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  renderList("#note-list", notes, renderNoteItem, "Guarda ideas, decisiones y seguimiento.");
}

function renderNoteItem(note) {
  const el = document.createElement("article");
  el.className = "list-item";
  el.innerHTML = `
    <div class="item-main">
      <div>
        <p class="item-title">${escapeHTML(note.title)}</p>
        <p class="item-meta">${escapeHTML(note.tag || "Sin etiqueta")} · ${new Date(note.createdAt).toLocaleDateString("es-PE")}</p>
      </div>
      ${note.tag ? `<span class="pill">${escapeHTML(note.tag)}</span>` : ""}
    </div>
    <p class="item-meta task-body">${escapeHTML(note.body)}</p>
    <div class="item-actions">
      <button class="danger-button" data-delete="notes" data-id="${note.id}" type="button">Eliminar</button>
    </div>`;
  return el;
}

// ── Finance item ──
function renderFinanceItem(item) {
  const el = document.createElement("article");
  el.className = "list-item";
  const safeReceiptUrl = typeof item.receiptDataUrl === "string" && /^data:image\//.test(item.receiptDataUrl)
    ? escapeHTML(item.receiptDataUrl)
    : null;
  const receiptThumb = safeReceiptUrl
    ? `<a href="${safeReceiptUrl}" target="_blank" title="Ver recibo" class="receipt-thumb-wrap">
         <img src="${safeReceiptUrl}" class="receipt-thumb" alt="Recibo" />
         <span class="receipt-thumb-badge">🧾</span>
       </a>`
    : "";
  el.innerHTML = `
    <div class="item-main">
      <div style="display:flex;align-items:center;gap:10px;flex:1">
        ${receiptThumb}
        <div>
          <p class="item-title">${escapeHTML(item.description)}</p>
          <p class="item-meta">${escapeHTML(item.category || "")} · ${formatDate(item.date)}</p>
        </div>
      </div>
      <span class="${item.type === "income" ? "amount-income" : "amount-expense"}">
        ${item.type === "income" ? "+" : "-"}${formatMoney(item.amount)}
      </span>
    </div>
    <div class="item-actions">
      <button class="danger-button" data-delete="finances" data-id="${item.id}" type="button">Eliminar</button>
    </div>`;
  return el;
}

// ══ GYM ══
function gymDaysThisWeek() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekStart = startOfWeek.toISOString().slice(0, 10);
  const weekEnd = todayISO();
  return (state.gym || []).filter((d) => d.date >= weekStart && d.date <= weekEnd).length;
}

function calcGymStreak() {
  const dates = new Set((state.gym || []).map((d) => d.date));
  let streak = 0;
  let d = new Date();
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (dates.has(iso)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function renderGym() {
  const streak = calcGymStreak();
  const weekDays = gymDaysThisWeek();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDates = new Set((state.gym || []).map((d) => d.date));
  const monthCount = [...monthDates].filter((d) => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`)).length;

  const s = $("#gym-streak");
  if (s) {
    s.textContent = streak;
    const fireIntensity = Math.min(3, Math.floor(streak / 3));
    s.style.filter = fireIntensity ? `saturate(${1 + fireIntensity * 0.3}) brightness(${1 + fireIntensity * 0.08})` : "";
    s.classList.toggle("streak-hot", streak >= 7);
  }
  const w = $("#gym-week");   if (w) w.textContent = weekDays;
  const m = $("#gym-month");  if (m) m.textContent = monthCount;

  const cal = $("#gym-calendar");
  if (!cal) return;
  cal.innerHTML = "";
  const firstDay = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    cal.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const went = monthDates.has(iso);
    const isToday = iso === todayISO();
    const div = document.createElement("div");
    div.className = `gym-day${went ? " went" : ""}${isToday ? " today" : ""}`;
    div.dataset.date = iso;
    div.innerHTML = `<span class="gym-day-num">${d}</span>${went ? '<span class="gym-check">✓</span>' : ""}`;
    cal.appendChild(div);
  }

  renderList("#gym-list", [...(state.gym || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    (g) => {
      const el = document.createElement("div");
      el.className = "list-item";
      el.innerHTML = `<div class="item-main"><p class="item-title">✓ ${formatDate(g.date)}</p>${g.note ? `<p class="item-meta">${escapeHTML(g.note)}</p>` : ""}<button class="danger-button" data-delete-gym="${g.id}" type="button">✕</button></div>`;
      return el;
    }, "Sin registros de gym.");
}

// ── Work Log ──
function renderWorkLog() {
  const logs = state.workLogs || [];
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;

  const hoursWeek  = logs.filter((l) => l.date >= weekStart.toISOString().slice(0,10)).reduce((s,l) => s + Number(l.hours), 0);
  const hoursMonth = logs.filter((l) => l.date >= monthStart).reduce((s,l) => s + Number(l.hours), 0);
  const sessMonth  = logs.filter((l) => l.date >= monthStart).length;

  const hw = $("#work-hours-week");  if (hw) hw.textContent = `${hoursWeek}h`;
  const hm = $("#work-hours-month"); if (hm) hm.textContent = `${hoursMonth}h`;
  const sm = $("#work-sessions");    if (sm) sm.textContent = sessMonth;

  renderList("#worklog-list", [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15),
    (l) => {
      const el = document.createElement("div");
      el.className = "list-item";
      el.innerHTML = `<div class="item-main"><div><p class="item-title">${escapeHTML(l.project)}</p><p class="item-meta">${formatDate(l.date)}${l.notes ? ` · ${escapeHTML(l.notes)}` : ""}</p></div><span class="pill">${l.hours}h</span></div>
        <div class="item-actions"><button class="danger-button" data-delete-log="${l.id}" type="button">Eliminar</button></div>`;
      return el;
    }, "Sin sesiones registradas.");
}

// ── Linked goal progress ──
function calcLinkedProgress(goal) {
  if (!goal.linkedTo) return Number(goal.current);
  if (goal.linkedTo === "gym_days") {
    return (state.gym || []).length;
  }
  if (goal.linkedTo === "work_hours") {
    return (state.workLogs || []).reduce((s, l) => s + Number(l.hours), 0);
  }
  if (goal.linkedTo === "work_sessions") {
    return (state.workLogs || []).length;
  }
  return Number(goal.current);
}

// ── Repetitive goal auto-renewal ──
function calcNextDeadline(frequency, fromDate) {
  const d = new Date(`${fromDate}T00:00:00`);
  if (frequency === "semanal")   d.setDate(d.getDate() + 7);
  else if (frequency === "quincenal") d.setDate(d.getDate() + 15);
  else if (frequency === "mensual")   d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function checkRepetitiveGoals() {
  const today = todayISO();
  let changed = false;
  (state.goals || []).forEach((g) => {
    if (!g.repetitive || !g.deadline || g.frequency === "unica") return;
    if (today > g.deadline) {
      // Archive current period as a log (optional: could store history)
      g.deadline = calcNextDeadline(g.frequency, g.deadline);
      g.current = 0; // reset progress
      // Reset linked tasks completion
      (state.tasks || []).filter((t) => t.goalId === g.id).forEach((t) => { t.done = false; });
      changed = true;
    }
  });
  if (changed) saveState();
}


// ── Goals ──
const CAT_CONFIG = {
  ejercicio:  { label: "💪 Ejercicio",  color: "#e63946" },
  trabajo:    { label: "🧠 Trabajo",    color: "#4dabf7" },
  personal:   { label: "🏠 Personal",   color: "#f4a261" },
  financiero: { label: "💰 Financiero", color: "#2ecc71" },
  // backward compat
  financiera: { label: "💰 Financiero", color: "#2ecc71" },
};

function renderGoals() {
  const container = $("#goals-list");
  if (!container) return;
  container.innerHTML = "";
  let goals = state.goals || [];
  if (goalCatFilter !== "all") {
    goals = goals.filter((g) => (g.category || g.type) === goalCatFilter);
  }
  if (!goals.length) {
    container.innerHTML = `<p class="empty-message">${goalCatFilter === "all" ? "Crea tu primera meta arriba." : "Sin metas en esta categoría."}</p>`;
    return;
  }

  goals.forEach((g) => {
    const current = calcLinkedProgress(g);
    const pct = Math.min(100, Math.round((current / Number(g.target)) * 100));
    const done = pct >= 100;
    const cat = g.category || g.type || "personal";
    const catInfo = CAT_CONFIG[cat] || { label: cat, color: "#999" };
    const linkedTasks = (state.tasks || []).filter((t) => t.goalId === g.id);

    const card = document.createElement("div");
    card.className = `goal-card${done ? " goal-done" : ""}`;
    card.innerHTML = `
      <div class="goal-header">
        <div>
          <span class="goal-cat-badge" style="color:${catInfo.color}">${catInfo.label}${g.linkedTo ? " · 🔗 Auto" : ""}${g.repetitive ? " · 🔄 Repetitiva" : ""}</span>
          <p class="goal-title">${escapeHTML(g.title)}</p>
          ${g.frequency && g.frequency !== "unica" ? `<p class="item-meta goal-freq-badge">${{ semanal:"Semanal", quincenal:"Quincenal", mensual:"Mensual" }[g.frequency] || g.frequency}</p>` : ""}
          ${g.deadline ? `<p class="item-meta">📅 ${g.repetitive ? "Renovación:" : "Límite:"} ${formatDate(g.deadline)}</p>` : ""}
        </div>
        ${done ? `<span class="goal-done-badge">✅ Completada</span>` : ""}
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;${done ? "background:var(--green)" : ""}"></div></div>
      <div class="goal-progress-text">
        <span><strong>${current}</strong> ${escapeHTML(g.unit)}</span>
        <span>${pct}% · meta <strong>${escapeHTML(String(g.target))}</strong> ${escapeHTML(g.unit)}</span>
      </div>

      <div class="goal-activities">
        <div class="goal-activities-header">
          <span class="goal-activities-title">Actividades (${linkedTasks.length})</span>
          <button class="goal-add-task-btn" data-goal-id="${g.id}" type="button">+ Agregar</button>
        </div>
        <div class="goal-task-add-form" id="goal-add-form-${g.id}" style="display:none">
          <input class="goal-task-input" placeholder="Describe la actividad..." data-goal="${g.id}" />
          <input type="date" class="goal-task-date-input" data-goal="${g.id}" value="${todayISO()}" />
          <button class="primary-button goal-task-submit" data-goal="${g.id}" type="button">✓</button>
        </div>
        <div class="goal-task-list">
          ${linkedTasks.length
            ? linkedTasks.map((t) => `
              <div class="goal-task-item${t.done ? " done" : ""}">
                <button class="goal-task-check" data-toggle-task="${t.id}" type="button">${t.done ? "✅" : "⬜"}</button>
                <span class="goal-task-label">${escapeHTML(t.title)}</span>
                <span class="goal-task-meta">${formatDate(t.dueDate)}</span>
                <button class="danger-button" data-delete="tasks" data-id="${t.id}" type="button" style="padding:2px 8px;font-size:0.72rem;min-height:unset">✕</button>
              </div>`).join("")
            : `<p class="empty-message" style="font-size:0.8rem;padding:6px 0;margin:0">Sin actividades aún.</p>`
          }
        </div>
      </div>

      <div class="goal-actions">
        ${g.linkedTo
          ? `<span class="item-meta" style="flex:1">🔗 Auto desde ${g.linkedTo === "gym_days" ? "gym" : "trabajo"}</span>`
          : `<input class="goal-input" type="number" min="0" placeholder="Actualizar progreso..." data-goal-id="${g.id}" />
             <button class="primary-button" style="min-height:36px;padding:0 12px" data-update-goal="${g.id}" type="button">OK</button>`
        }
        <button class="danger-button" data-delete-goal="${g.id}" type="button">✕</button>
      </div>`;
    container.appendChild(card);
    // Celebrate the moment a goal first reaches 100% — confetti + glow pulse, once per goal
    if (done && !celebratedGoals.has(g.id)) {
      celebratedGoals.add(g.id);
      if (!prefersReducedMotion()) {
        card.classList.add("goal-celebrate");
        celebrate(card);
      }
    }
  });
}

// ══ Google Calendar ══
const GCAL_CLIENT_ID = "528665201579-nj98p7onvq28ts2voumljgoa5p7c9rc0.apps.googleusercontent.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";
const GCAL_STORAGE_KEY = "gcal-token-v1";

let gcalToken = null;
let gcalEvents = [];

function gcalSaveToken(t) { gcalToken = t; localStorage.setItem(GCAL_STORAGE_KEY, JSON.stringify(t)); }
function gcalLoadToken() { try { const s = localStorage.getItem(GCAL_STORAGE_KEY); if (s) gcalToken = JSON.parse(s); } catch {} }
function gcalIsConnected() { return gcalToken && gcalToken.access_token; }

function gcalUpdateUI() {
  if (gcalIsConnected()) {
    $("#gcal-connect").style.display = "none";
    $("#gcal-connected-label").style.display = "flex";
  } else {
    $("#gcal-connect").style.display = "";
    $("#gcal-connected-label").style.display = "none";
  }
}

async function gcalFetchEvents() {
  if (!gcalIsConnected()) return;
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=200`,
      { headers: { Authorization: `Bearer ${gcalToken.access_token}` } });
    if (res.status === 401) { gcalDisconnect(); return; }
    const data = await res.json();
    if (data.error) return;
    gcalEvents = (data.items || []).map((e) => ({
      id: e.id, title: e.summary || "Sin título",
      date: (e.start.dateTime || e.start.date || "").slice(0, 10),
      time: e.start.dateTime ? e.start.dateTime.slice(11, 16) : "", kind: "gcal",
    }));
    renderCalendar();
  } catch {}
}

async function gcalCreateEvent(item, type) {
  if (!gcalIsConnected()) return null;
  try {
    const body = { summary: item.title || item.description, description: item.body || item.notes || "" };
    if (type === "meeting" && item.time) {
      const start = `${item.date}T${item.time}:00`;
      const end = new Date(`${item.date}T${item.time}:00`);
      end.setHours(end.getHours() + 1);
      body.start = { dateTime: start, timeZone: "America/Lima" };
      body.end   = { dateTime: end.toISOString().slice(0, 19), timeZone: "America/Lima" };
    } else {
      body.start = { date: item.date || item.dueDate };
      body.end   = { date: item.date || item.dueDate };
    }
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${gcalToken.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { gcalDisconnect(); return null; }
    const data = await res.json();
    return data.id || null;
  } catch { return null; }
}

async function gcalDeleteEvent(gcalId) {
  if (!gcalIsConnected() || !gcalId) return;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${gcalToken.access_token}` },
    });
  } catch {}
}

function gcalConnect() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID, scope: GCAL_SCOPE,
    callback: async (response) => {
      if (response.error) return;
      gcalSaveToken({ access_token: response.access_token });
      gcalUpdateUI();
      await gcalFetchEvents();
    },
  });
  client.requestAccessToken();
}

function gcalDisconnect() {
  try { if (gcalToken?.access_token && typeof google !== "undefined") google.accounts.oauth2.revoke(gcalToken.access_token, () => {}); } catch {}
  gcalToken = null; gcalEvents = [];
  localStorage.removeItem(GCAL_STORAGE_KEY);
  gcalUpdateUI(); renderCalendar();
}

function bindGcalEvents() {
  $("#gcal-connect").addEventListener("click", gcalConnect);
  $("#gcal-disconnect").addEventListener("click", gcalDisconnect);
}

// ══ Calendar ══
let calendarDate = new Date();
let calView = "week";
let calFilter = "all";
let goalCatFilter = "all";
const celebratedGoals = new Set((state.goals || []).filter((g) => Math.min(100, Math.round((calcLinkedProgress(g) / Number(g.target || 1)) * 100)) >= 100).map((g) => g.id));

function buildEventsByDate() {
  const map = {};
  const push = (date, ev) => { if (!map[date]) map[date] = []; map[date].push(ev); };

  state.meetings.forEach((m) => {
    if (calFilter !== "all" && m.context !== calFilter) return;
    push(m.date, { kind: "meeting", label: m.title, time: m.time, context: m.context });
  });
  state.tasks.filter((t) => !t.done).forEach((t) => {
    if (calFilter !== "all" && t.context !== calFilter) return;
    push(t.dueDate, { kind: "task", label: t.title, time: "", context: t.context });
  });
  if (calFilter === "all" || calFilter === "gcal") {
    gcalEvents.forEach((e) => push(e.date, { kind: "gcal", label: e.title, time: e.time, context: null }));
  }
  return map;
}

function renderCalendar() {
  renderCalFilters();
  renderContextSelects();
  if (calView === "month") renderMonthView();
  else renderWeekView();
  $("#cal-day-detail").classList.add("hidden");
}

function renderMonthView() {
  const year = calendarDate.getFullYear(), month = calendarDate.getMonth();
  $("#cal-month-label").textContent = new Date(year, month, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayISO();
  const evByDate = buildEventsByDate();
  const grid = $("#calendar-grid");
  grid.innerHTML = "";
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell cal-empty";
    grid.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const events = evByDate[iso] || [];
    const cell = document.createElement("div");
    cell.className = `cal-cell${iso === today ? " cal-today" : ""}`;
    cell.dataset.date = iso;
    const dots = events.slice(0,3).map((e) => { const c = getEventColor(e); return `<span class="cal-dot" style="background:${safeColor(c.dot)}"></span>`; }).join("");
    const labels = events.slice(0,2).map((e) => { const c = getEventColor(e); return `<span class="cal-event-label" style="background:${safeColor(c.bg)};color:${safeColor(c.color)}">${escapeHTML(e.label)}</span>`; }).join("");
    const more = events.length > 2 ? `<span class="cal-more">+${events.length-2}</span>` : "";
    cell.innerHTML = `<span class="cal-day-num">${d}</span><div class="cal-dots">${dots}</div><div class="cal-labels">${labels}${more}</div>`;
    grid.appendChild(cell);
  }
}

function renderWeekView() {
  const d = new Date(calendarDate);
  const sunday = new Date(d); sunday.setDate(d.getDate() - d.getDay());
  const today = todayISO();
  const evByDate = buildEventsByDate();
  const weekEnd = new Date(sunday); weekEnd.setDate(sunday.getDate() + 6);
  $("#cal-month-label").textContent =
    sunday.toLocaleDateString("es-PE", { day: "numeric", month: "short" }) + " – " +
    weekEnd.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

  const grid = $("#week-grid");
  grid.innerHTML = "";
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  for (let i = 0; i < 7; i++) {
    const date = new Date(sunday); date.setDate(sunday.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const events = (evByDate[iso] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const isToday = iso === today;
    const col = document.createElement("div");
    col.className = `week-col${isToday ? " week-today" : ""}`;
    col.dataset.date = iso;
    const evHTML = events.length
      ? events.map((e) => { const c = getEventColor(e); return `<div class="week-event" style="background:${safeColor(c.bg)};border-left-color:${safeColor(c.dot)}">${e.time ? `<span class="week-event-time">${e.time}</span>` : ""}<span class="week-event-title" style="color:${safeColor(c.color)}">${escapeHTML(e.label)}</span></div>`; }).join("")
      : `<p class="week-empty">Sin eventos</p>`;
    col.innerHTML = `<div class="week-col-header"><span class="week-day-name">${dayNames[i]}</span><span class="week-day-num${isToday ? " week-today-num" : ""}">${date.getDate()}</span></div><div class="week-col-events">${evHTML}</div>`;
    grid.appendChild(col);
  }
}

function showDayDetail(date, events) {
  const detail = $("#cal-day-detail");
  $("#cal-detail-title").textContent = formatDate(date);
  const container = $("#cal-detail-items");
  container.innerHTML = "";
  if (!events.length) { container.innerHTML = `<p class="empty-message">Sin eventos este día.</p>`; }
  else {
    [...events].sort((a, b) => (a.time || "").localeCompare(b.time || "")).forEach((e) => {
      const el = document.createElement("div");
      el.className = "list-item";
      const c = getEventColor(e);
      const ctx = e.kind !== "gcal" ? getContextById(e.context) : null;
      const label = e.kind === "gcal" ? "📅 Google" : (ctx ? `${escapeHTML(ctx.emoji)} ${escapeHTML(ctx.label)}` : "");
      el.style.borderLeft = `3px solid ${safeColor(c.dot)}`;
      el.innerHTML = `<div class="item-main"><div><p class="item-title">${escapeHTML(e.label)}</p>${e.time ? `<p class="item-meta">${e.time}</p>` : ""}</div>${label ? `<span class="pill" style="background:${safeColor(c.bg)};color:${safeColor(c.color)}">${escapeHTML(label)}</span>` : ""}</div>`;
      container.appendChild(el);
    });
  }
  detail.classList.remove("hidden");
}

function bindCalendarEvents() {
  $("#cal-prev").addEventListener("click", () => {
    if (calView === "month") calendarDate.setMonth(calendarDate.getMonth() - 1);
    else calendarDate.setDate(calendarDate.getDate() - 7);
    renderCalendar();
  });
  $("#cal-next").addEventListener("click", () => {
    if (calView === "month") calendarDate.setMonth(calendarDate.getMonth() + 1);
    else calendarDate.setDate(calendarDate.getDate() + 7);
    renderCalendar();
  });
  $("#cal-detail-close").addEventListener("click", () => $("#cal-day-detail").classList.add("hidden"));
  $("#cal-view-month").addEventListener("click", () => {
    calView = "month";
    $("#cal-month-view").classList.remove("hidden"); $("#cal-week-view").classList.add("hidden");
    $("#cal-view-month").classList.add("active"); $("#cal-view-week").classList.remove("active");
    renderCalendar();
  });
  $("#cal-view-week").addEventListener("click", () => {
    calView = "week";
    $("#cal-week-view").classList.remove("hidden"); $("#cal-month-view").classList.add("hidden");
    $("#cal-view-week").classList.add("active"); $("#cal-view-month").classList.remove("active");
    renderCalendar();
  });
  document.body.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-cell:not(.cal-empty), .week-col");
    if (!cell || !cell.dataset.date) return;
    showDayDetail(cell.dataset.date, buildEventsByDate()[cell.dataset.date] || []);
  });
}

// ── Attachments ──
let pendingTaskAttachments = [];

function bindAttachments() {
  const fileInput = $("#task-file");
  const box = $("#task-attach-box");
  const listEl = $("#task-file-list");

  function readFiles(files) {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => { pendingTaskAttachments.push({ name: file.name, dataUrl: e.target.result, type: file.type }); renderFileList(); };
      reader.readAsDataURL(file);
    });
  }

  function renderFileList() {
    listEl.innerHTML = pendingTaskAttachments.map((f, i) => `
      <div class="file-chip">
        ${f.type.startsWith("image/") ? `<img src="${f.dataUrl}" class="file-thumb" />` : `<span class="file-icon">📄</span>`}
        <span class="file-name">${escapeHTML(f.name)}</span>
        <button class="file-remove" data-idx="${i}" type="button">✕</button>
      </div>`).join("");
    listEl.querySelectorAll(".file-remove").forEach((btn) => btn.addEventListener("click", () => { pendingTaskAttachments.splice(Number(btn.dataset.idx), 1); renderFileList(); }));
    $("#task-attach-placeholder").style.display = pendingTaskAttachments.length ? "none" : "";
  }

  fileInput.addEventListener("change", () => { readFiles(fileInput.files); fileInput.value = ""; });
  box.addEventListener("click", (e) => { if (!e.target.closest(".file-chip")) fileInput.click(); });
  box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("drag-over"); });
  box.addEventListener("dragleave", () => box.classList.remove("drag-over"));
  box.addEventListener("drop", (e) => { e.preventDefault(); box.classList.remove("drag-over"); readFiles(e.dataTransfer.files); });
}

// ── Form submit ──
function handleSubmit(formId, collection, mapper, gcalType) {
  const form = $(formId);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const item = { id: uid(), ...mapper(data) };
    state[collection].push(item);
    form.reset(); setDefaultDates(); saveState(); render();
    if (gcalType && gcalIsConnected()) {
      const gcalId = await gcalCreateEvent(item, gcalType);
      if (gcalId) { item.gcalId = gcalId; saveState(); }
      gcalFetchEvents();
    }
  });
}


function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `alex-app-backup-${todayISO()}.json`; a.click();
  URL.revokeObjectURL(url);
}

// ── Render all ──
function render() {
  renderContextSelects();
  renderGoalSelects();
  renderUserName();
  renderDashboard();
  renderWeeklySummary();
  renderFinances();
  renderDebts();
  renderRecurring();
  renderTasks();
  renderMeetings();
  renderNotes();
  renderGoals();
  renderGoalHistory();
  renderGym();
  renderWorkLog();
  renderWater();
  renderMood();
  renderHealth();
  pomoUpdateUI();
}

// ── Pre-form tasks (tasks added before creating the goal) ──
let pendingGoalTasks = []; // [{title, dueDate}]

function renderPreformTasks() {
  const list = $("#goal-preform-list");
  if (!list) return;
  list.innerHTML = "";
  pendingGoalTasks.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "goal-task-item";
    div.innerHTML = `
      <span class="goal-task-check">⬜</span>
      <span class="goal-task-label">${escapeHTML(t.title)}</span>
      <span class="goal-task-meta">${formatDate(t.dueDate)}</span>
      <button class="danger-button" data-remove-preform="${i}" type="button" style="padding:2px 8px;font-size:0.72rem;min-height:unset">✕</button>`;
    list.appendChild(div);
  });
}

// ── Events ──
// ── Motion helpers: cursor-follow glow + confetti celebration ──
function initGlowCards() {
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".glow-card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}
function celebrate(originEl) {
  if (typeof confetti !== "function") return;
  let x = 0.5, y = 0.5;
  if (originEl) {
    const r = originEl.getBoundingClientRect();
    x = (r.left + r.width / 2) / window.innerWidth;
    y = (r.top + r.height / 2) / window.innerHeight;
  }
  confetti({
    particleCount: 70, spread: 65, startVelocity: 38, gravity: 1.1, scalar: 0.85,
    origin: { x, y }, colors: ["#e63946", "#f4a261", "#7c5cff", "#4dabf7", "#2ecc71"],
  });
}
function bumpCounter(el) {
  if (!el) return;
  el.classList.remove("counter-bump");
  void el.offsetWidth;
  el.classList.add("counter-bump");
}

function bindEvents() {
  $$(".nav-tab, .mbn-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $$(".org-tab[data-org]").forEach((tab) => tab.addEventListener("click", () => switchOrgTab(tab.dataset.org)));
  $$(".org-tab[data-fin]").forEach((tab) => tab.addEventListener("click", () => switchFinTab(tab.dataset.fin)));
  $$(".org-tab[data-perf]").forEach((tab) => tab.addEventListener("click", () => switchPerfTab(tab.dataset.perf)));
  $$(".org-tab[data-meet]").forEach((tab) => tab.addEventListener("click", () => switchMeetTab(tab.dataset.meet)));

  $("#task-filter")?.addEventListener("change", renderTasks);
  $("#task-goal-filter")?.addEventListener("change", renderTasks);
  $("#note-search")?.addEventListener("input", renderNotes);
  $("#theme-toggle")?.addEventListener("click", toggleTheme);

  // Goal templates
  document.body.addEventListener("click", (e) => {
    const tplBtn = e.target.closest(".goal-tpl-btn");
    if (tplBtn) applyGoalTemplate(tplBtn.dataset.tpl);
  });

  // Pre-form: toggle add form
  $("#goal-preform-add")?.addEventListener("click", () => {
    const f = $("#goal-preform-form");
    if (f) { f.style.display = f.style.display === "none" ? "flex" : "none"; if (f.style.display === "flex") { setDefaultDates(); $("#goal-preform-title")?.focus(); } }
  });
  // Pre-form: submit activity (stays open to add more)
  $("#goal-preform-submit")?.addEventListener("click", () => {
    const titleEl = $("#goal-preform-title");
    const dateEl  = $("#goal-preform-date");
    const title   = titleEl?.value?.trim();
    if (!title) return;
    pendingGoalTasks.push({ title, dueDate: dateEl?.value || todayISO() });
    if (titleEl) { titleEl.value = ""; titleEl.focus(); }
    renderPreformTasks();
  });

  // Pre-form: also submit on Enter key
  $("#goal-preform-title")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("#goal-preform-submit")?.click(); }
  });
  $("#export-data")?.addEventListener("click", exportData);

  // Gym today
  $("#gym-today-btn")?.addEventListener("click", () => {
    const today = todayISO();
    if ((state.gym || []).find((g) => g.date === today)) return;
    state.gym = state.gym || [];
    state.gym.push({ id: uid(), date: today, note: "" });
    saveState(); renderGym(); renderDashboard();
  });

  // Gym calendar click
  document.body.addEventListener("click", (e) => {
    const gymDay = e.target.closest(".gym-day");
    if (gymDay) {
      const date = gymDay.dataset.date;
      if (!date) return;
      state.gym = state.gym || [];
      const existing = state.gym.findIndex((g) => g.date === date);
      if (existing >= 0) state.gym.splice(existing, 1);
      else state.gym.push({ id: uid(), date, note: "" });
      saveState(); renderGym(); renderDashboard();
    }

    // Remove pre-form pending task
    const removePreform = e.target.closest("[data-remove-preform]");
    if (removePreform) {
      pendingGoalTasks.splice(Number(removePreform.dataset.removePreform), 1);
      renderPreformTasks();
    }

    // Goal category filter
    const catBtn = e.target.closest(".goal-cat-btn");
    if (catBtn) {
      goalCatFilter = catBtn.dataset.cat;
      $$(".goal-cat-btn").forEach((b) => b.classList.toggle("active", b.dataset.cat === goalCatFilter));
      renderGoals();
    }

    // Toggle goal task add form
    const addTaskBtn = e.target.closest(".goal-add-task-btn");
    if (addTaskBtn) {
      const formEl = $(`#goal-add-form-${addTaskBtn.dataset.goalId}`);
      if (formEl) formEl.style.display = formEl.style.display === "none" ? "flex" : "none";
    }

    // Submit quick goal task
    const submitGoalTask = e.target.closest(".goal-task-submit");
    if (submitGoalTask) {
      const goalId = submitGoalTask.dataset.goal;
      const input = document.querySelector(`.goal-task-input[data-goal="${goalId}"]`);
      const dateEl = document.querySelector(`.goal-task-date-input[data-goal="${goalId}"]`);
      const title = input?.value?.trim();
      if (!title) return;
      const task = {
        id: uid(), title,
        body: "", dueDate: dateEl?.value || todayISO(),
        context: state.contexts[0]?.id || "",
        goalId,
        done: false, attachments: [],
      };
      state.tasks.push(task);
      if (input) input.value = "";
      saveState(); renderGoals(); renderDashboard();
    }

    const delGym = e.target.closest("[data-delete-gym]");
    if (delGym) {
      state.gym = (state.gym || []).filter((g) => g.id !== delGym.dataset.deleteGym);
      saveState(); renderGym(); renderDashboard();
    }

    const delLog = e.target.closest("[data-delete-log]");
    if (delLog) {
      state.workLogs = (state.workLogs || []).filter((l) => l.id !== delLog.dataset.deleteLog);
      saveState(); renderWorkLog();
    }

    const delGoal = e.target.closest("[data-delete-goal]");
    if (delGoal) {
      state.goals = (state.goals || []).filter((g) => g.id !== delGoal.dataset.deleteGoal);
      saveState(); renderGoals(); renderDashboard();
    }

    const updateGoal = e.target.closest("[data-update-goal]");
    if (updateGoal) {
      const goalId = updateGoal.dataset.updateGoal;
      const input = document.querySelector(`input[data-goal-id="${goalId}"]`);
      if (input && input.value !== "") {
        const goal = state.goals.find((g) => g.id === goalId);
        if (goal) { goal.current = Number(input.value); saveState(); renderGoals(); renderDashboard(); }
      }
    }

    const delSaving = e.target.closest("[data-delete-saving]");
    if (delSaving) { state.savings=(state.savings||[]).filter((s)=>s.id!==delSaving.dataset.deleteSaving); saveState(); renderSavings(); }

    const delInv = e.target.closest("[data-delete-inv]");
    if (delInv) { state.investments=(state.investments||[]).filter((i)=>i.id!==delInv.dataset.deleteInv); saveState(); renderInvestments(); }

    const delDebt = e.target.closest("[data-delete-debt]");
    if (delDebt) { state.debts=(state.debts||[]).filter((d)=>d.id!==delDebt.dataset.deleteDebt); saveState(); renderDebts(); }

    const settleDebt = e.target.closest("[data-settle-debt]");
    if (settleDebt) { state.debts=(state.debts||[]).filter((d)=>d.id!==settleDebt.dataset.settleDebt); saveState(); renderDebts(); }

    const delRecurring = e.target.closest("[data-delete-recurring]");
    if (delRecurring) { state.recurringExpenses=(state.recurringExpenses||[]).filter((r)=>r.id!==delRecurring.dataset.deleteRecurring); saveState(); renderRecurring(); }

    const delHealth = e.target.closest("[data-delete-health]");
    if (delHealth) { state.health=(state.health||[]).filter((h)=>h.id!==delHealth.dataset.deleteHealth); saveState(); renderHealth(); }

    const removeSubtask = e.target.closest("[data-remove-subtask]");
    if (removeSubtask) { pendingSubtasks.splice(Number(removeSubtask.dataset.removeSubtask),1); renderSubtaskPreformList(); }

    const toggleSubtask = e.target.closest("[data-toggle-subtask]");
    if (toggleSubtask) {
      const task = state.tasks.find((t) => t.id === toggleSubtask.dataset.toggleSubtask);
      const sub = task?.subtasks?.find((s) => s.id === toggleSubtask.dataset.subtaskId);
      if (sub) { sub.done = !sub.done; saveState(); renderTasks(); }
    }

    const deleteButton = e.target.closest("[data-delete]");
    if (deleteButton) {
      const collection = deleteButton.dataset.delete;
      const item = state[collection].find((i) => i.id === deleteButton.dataset.id);
      if (item?.gcalId) gcalDeleteEvent(item.gcalId);
      state[collection] = state[collection].filter((i) => i.id !== deleteButton.dataset.id);
      saveState(); render();
    }

    const toggleTask = e.target.closest("[data-toggle-task]");
    if (toggleTask) {
      const task = state.tasks.find((t) => t.id === toggleTask.dataset.toggleTask);
      if (task) {
        const completing = !task.done; // becoming done now
        const card = toggleTask.closest(".list-item");
        const finish = () => {
          task.done = !task.done;
          // Auto-create next occurrence for recurring tasks
          if (task.done && task.recurrentFreq) {
            const base = new Date(`${task.dueDate}T00:00:00`);
            if (task.recurrentFreq === "diario")   base.setDate(base.getDate() + 1);
            if (task.recurrentFreq === "semanal")  base.setDate(base.getDate() + 7);
            if (task.recurrentFreq === "mensual")  base.setMonth(base.getMonth() + 1);
            state.tasks.push({ ...task, id: uid(), done: false, dueDate: base.toISOString().slice(0,10), subtasks: (task.subtasks||[]).map((s) => ({...s, done: false})) });
          }
          saveState(); render();
        };
        // Satisfying collapse-and-fade animation when marking a task as done
        if (completing && card && !prefersReducedMotion()) {
          card.classList.add("task-completing");
          card.addEventListener("animationend", finish, { once: true });
        } else {
          finish();
        }
      }
    }
  });

  // Jobs save
  ["job1", "job2"].forEach((jobId, idx) => {
    $(`#${jobId}-save`)?.addEventListener("click", () => {
      state.jobs = state.jobs || emptyState.jobs;
      state.jobs[idx] = {
        id: jobId,
        name: $(`#${jobId}-name`)?.value?.trim() || "",
        amount: Number($(`#${jobId}-amount`)?.value) || 0,
        payDay: Number($(`#${jobId}-payday`)?.value) || 15,
      };
      saveState(); renderFinances();
    });
  });

  // Forms
  handleSubmit("#extra-form", "finances", (data) => ({
    type: "income", subtype: "extra",
    description: data.description.trim(), category: "Extra",
    amount: Number(data.amount), date: data.date,
  }));

  handleSubmit("#expense-form", "finances", (data) => ({
    type: "expense",
    description: data.description.trim(), category: data.category.trim(),
    amount: Number(data.amount), date: data.date,
    receiptDataUrl: window._pendingReceiptDataUrl || null,
  }));

  // Clear receipt after submit
  document.querySelector("#expense-form")?.addEventListener("submit", () => {
    window._pendingReceiptDataUrl = null;
    clearReceiptPreview();
  });

  bindReceiptScanner();

  handleSubmit("#savings-form", "savings", (data) => ({
    name: data.name.trim(), target: Number(data.target),
    current: Number(data.current) || 0,
    deadline: data.deadline || "", emoji: data.emoji || "🏦",
  }));

  handleSubmit("#investment-form", "investments", (data) => ({
    name: data.name.trim(), type: data.type,
    amount: Number(data.amount), date: data.date,
    notes: (data.notes || "").trim(),
  }));

  handleSubmit("#task-form", "tasks", (data) => {
    const item = {
      title: data.title.trim(), body: (data.body || "").trim(),
      dueDate: data.dueDate, context: data.context || state.contexts[0]?.id,
      goalId: data.goalId || "",
      priority: data.priority || "media",
      recurrentFreq: data.recurrentFreq || "",
      subtasks: pendingSubtasks.map((s) => ({...s})),
      attachments: pendingTaskAttachments.map((a) => ({ name: a.name, dataUrl: a.dataUrl, type: a.type })),
      done: false,
    };
    pendingTaskAttachments = [];
    pendingSubtasks = [];
    renderSubtaskPreformList();
    return item;
  }, "task");

  handleSubmit("#meeting-form", "meetings", (data) => ({
    title: data.title.trim(), people: (data.people || "").trim(),
    date: data.date, time: data.time,
    notes: (data.notes || "").trim(), context: data.context || state.contexts[0]?.id,
  }), "meeting");

  handleSubmit("#note-form", "notes", (data) => ({
    title: data.title.trim(), tag: (data.tag || "").trim(),
    body: data.body.trim(), createdAt: new Date().toISOString(),
  }));

  handleSubmit("#worklog-form", "workLogs", (data) => ({
    project: data.project.trim(), hours: Number(data.hours),
    date: data.date, notes: (data.notes || "").trim(),
  }));

  handleSubmit("#debt-form", "debts", (data) => ({
    name: data.name.trim(), debtType: data.debtType,
    person: data.person.trim(), amount: Number(data.amount),
    dueDate: data.dueDate || "", notes: (data.notes||"").trim(),
  }));

  handleSubmit("#recurring-form", "recurringExpenses", (data) => ({
    name: data.name.trim(), category: data.category.trim(),
    amount: Number(data.amount), day: Number(data.day),
  }));

  handleSubmit("#health-form", "health", (data) => ({
    weight: data.weight ? Number(data.weight) : null,
    sleep: data.sleep ? Number(data.sleep) : null,
    date: data.date,
  }));

  // Goal form — custom submit (needs to also create pending tasks)
  $("#goal-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const goalId = uid();
    const goal = {
      id: goalId,
      emoji: "🎯",
      title: data.title.trim(),
      category: data.category,
      type: data.category, // backward compat
      frequency: data.frequency || "unica",
      repetitive: !!data.repetitive,
      target: Number(data.target) || 100,
      current: 0,
      unit: data.unit?.trim() || "",
      deadline: data.deadline || "",
      linkedTo: data.linkedTo || "",
    };
    state.goals = state.goals || [];
    state.goals.push(goal);

    // Create pending activities as tasks
    pendingGoalTasks.forEach((t) => {
      state.tasks.push({
        id: uid(), title: t.title, body: "",
        dueDate: t.dueDate, context: state.contexts[0]?.id || "",
        goalId, done: false, attachments: [],
      });
    });
    pendingGoalTasks = [];

    e.target.reset(); setDefaultDates(); renderPreformTasks();
    saveState(); render();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstallPrompt = e;
    $("#install-app")?.classList.remove("hidden");
  });
  $("#install-app")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#install-app")?.classList.add("hidden");
  });
}

// ══════════════════════════════════════════
// ── USER NAME ──
// ══════════════════════════════════════════
function renderUserName() {
  const name = state.userName || "";
  const el = document.getElementById("app-user-name");
  const greet = document.getElementById("brand-greeting");
  const input = document.getElementById("user-name-input");
  if (el) el.textContent = name ? `Hola, ${name} 👋` : "Alex App";
  if (greet) greet.textContent = name ? "Centro personal" : "Centro personal";
  if (input && !input.value) input.value = name;
}
function bindUserName() {
  document.getElementById("user-name-save")?.addEventListener("click", () => {
    const v = document.getElementById("user-name-input")?.value?.trim();
    state.userName = v || "";
    saveState(); renderUserName();
  });
  document.getElementById("user-name-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("user-name-save")?.click();
  });
}

// ══════════════════════════════════════════
// ── RECEIPT SCANNER (OCR) ──
// ══════════════════════════════════════════
window._pendingReceiptDataUrl = null;

function clearReceiptPreview() {
  const previewWrap = document.getElementById("receipt-preview-wrap");
  const uploadLabel = document.getElementById("receipt-upload-label");
  const ocrStatus   = document.getElementById("receipt-ocr-status");
  const ocrResult   = document.getElementById("receipt-ocr-result");
  const fileInput   = document.getElementById("receipt-file-input");
  if (previewWrap) previewWrap.classList.add("hidden");
  if (uploadLabel) uploadLabel.classList.remove("hidden");
  if (ocrStatus)   { ocrStatus.classList.add("hidden"); ocrStatus.textContent = ""; }
  if (ocrResult)   ocrResult.classList.add("hidden");
  if (fileInput)   fileInput.value = "";
  window._pendingReceiptDataUrl = null;
}

function extractReceiptData(text) {
  // --- Amount extraction ---
  // Try: S/ 123.45, S/.123.45, S/123, 123.45 soles, 123,45
  const amountPatterns = [
    /S\/\.?\s*([\d,]+\.?\d*)/i,
    /(?:monto|total|importe|subtotal|a\s+pagar|pagar)[:\s]*S?\/?\s*([\d,]+\.?\d*)/i,
    /\b(\d{1,6}[.,]\d{2})\b/,
    /\b(\d{1,6})\b(?:\s*soles?)?/i,
  ];
  let amount = null;
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m) {
      const raw = m[1].replace(",", ".");
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0 && val < 999999) { amount = val.toFixed(2); break; }
    }
  }

  // --- Date extraction ---
  // Try: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "15 de enero de 2024"
  const monthNames = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };
  let date = null;

  // Numeric formats
  const numDatePatterns = [
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/,  // DD/MM/YYYY
    /(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})/,  // YYYY-MM-DD
    /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})/,  // DD/MM/YY
  ];
  for (const pat of numDatePatterns) {
    const m = text.match(pat);
    if (m) {
      let y, mo, d;
      if (m[1].length === 4) { [, y, mo, d] = m; }
      else if (parseInt(m[3]) > 31) { [, d, mo, y] = m; }  // DD/MM/YYYY
      else { [, d, mo, y] = m; if (y.length === 2) y = "20" + y; }
      mo = String(mo).padStart(2,"0"); d = String(d).padStart(2,"0");
      const candidate = `${y}-${mo}-${d}`;
      if (!isNaN(Date.parse(candidate))) { date = candidate; break; }
    }
  }

  // Textual format: "15 de enero de 2024"
  if (!date) {
    const mTxt = text.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/);
    if (mTxt) {
      const mo = monthNames[mTxt[2]];
      if (mo) {
        const candidate = `${mTxt[3]}-${String(mo).padStart(2,"0")}-${String(mTxt[1]).padStart(2,"0")}`;
        if (!isNaN(Date.parse(candidate))) date = candidate;
      }
    }
  }

  return { amount, date };
}

// ══════════════════════════════════════════
// ── MENTAL HEALTH MODULE ──
// ══════════════════════════════════════════

const EMOTION_CONFIG = {
  feliz:     { emoji: "😄", color: "#f4a261", label: "Feliz",     sentiment: 1 },
  tranquilo: { emoji: "😌", color: "#2ecc71", label: "Tranquilo", sentiment: 1 },
  motivado:  { emoji: "🔥", color: "#e63946", label: "Motivado",  sentiment: 1 },
  triste:    { emoji: "😢", color: "#4dabf7", label: "Triste",    sentiment: -1 },
  enojado:   { emoji: "😠", color: "#e63946", label: "Enojado",   sentiment: -1 },
  ansioso:   { emoji: "😰", color: "#9775fa", label: "Ansioso",   sentiment: -1 },
  frustrado: { emoji: "😤", color: "#f4a261", label: "Frustrado", sentiment: -1 },
  cansado:   { emoji: "😴", color: "#888888", label: "Cansado",   sentiment: 0  },
};

const EMOTION_KEYWORDS = {
  feliz:     ["feliz","alegre","contento","bien","genial","excelente","increíble","maravilloso","emocionado","agradecido","gratitud","ríe","reí","disfruté","disfrutar","logré","logro","celebré"],
  tranquilo: ["tranquilo","relajado","calmado","paz","sereno","descansado","libre","seguro","calma","equilibrio","estable"],
  motivado:  ["motivado","motivación","energía","enfocado","productivo","avancé","avanzar","logré","meta","objetivo","ganas","entusiasmo","inspirado"],
  triste:    ["triste","tristeza","mal","deprimido","decaído","melancólico","lloré","llorar","solo","soledad","vacío","nostalgia","extraño","perdí","perdida","dolor"],
  enojado:   ["enojado","enojo","molesto","frustrado","furioso","rabia","ira","irritado","fastidiado","harto","explotó","grité","pelea","discutí","discusión"],
  ansioso:   ["ansioso","ansiedad","nervioso","nerviosismo","preocupado","preocupación","estresado","estrés","angustiado","angustia","inseguro","miedo","temo","temor","incertidumbre"],
  frustrado: ["frustrado","frustración","bloqueado","atascado","sin avance","no pude","fallé","fracasé","salió mal","difícil","dificultad"],
  cansado:   ["cansado","agotado","exhausto","sin energía","dormí poco","sin dormir","fatigado","pesado","lento","somnoliento"],
};

function detectEmotions(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) found.push(emotion);
  }
  return found;
}

function getSentimentScore(emotions) {
  if (!emotions.length) return 0;
  const total = emotions.reduce((s, e) => s + (EMOTION_CONFIG[e]?.sentiment ?? 0), 0);
  return Math.round((total / emotions.length) * 10) / 10;
}

function getSentimentLabel(score) {
  if (score > 0.3)  return { label: "Positivo 🌟", color: "#2ecc71" };
  if (score < -0.3) return { label: "Difícil 🌧️",  color: "#4dabf7" };
  return { label: "Neutro ☁️", color: "#888" };
}

// ── Selected tags state ──
let mentalSelectedTags = [];

function renderMental() {
  const today = todayISO();
  const el = document.getElementById("mental-date");
  if (el && !el.value) el.value = today;

  renderMentalStats();
  renderMentalList();
  renderMentalTrend();
  renderMentalInsight();
  bindMentalForm();
  updateMentalTodayPreview();
}

function renderMentalStats() {
  const logs = state.mentalLogs || [];
  const grid = document.getElementById("mental-stats-grid");
  if (!grid) return;

  // Count by emotion
  const counts = {};
  logs.forEach((log) => (log.emotions || []).forEach((e) => { counts[e] = (counts[e] || 0) + 1; }));

  // Overall sentiment
  const scores = logs.map((l) => getSentimentScore(l.emotions || []));
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const sentiment = getSentimentLabel(avgScore);

  // Positive streak
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const log of sorted) {
    if (getSentimentScore(log.emotions || []) >= 0) streak++;
    else break;
  }

  // Top emotion
  const topEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  grid.innerHTML = `
    <div class="mental-stat-card" style="border-color:${sentiment.color}22">
      <span class="mental-stat-num" style="color:${sentiment.color}">${sentiment.label}</span>
      <span class="mental-stat-label">Estado general</span>
    </div>
    <div class="mental-stat-card">
      <span class="mental-stat-num">${logs.length}</span>
      <span class="mental-stat-label">Registros totales</span>
    </div>
    <div class="mental-stat-card" style="border-color:rgba(46,204,113,0.3)">
      <span class="mental-stat-num" style="color:var(--green)">${streak} 🔥</span>
      <span class="mental-stat-label">Racha positiva</span>
    </div>
    <div class="mental-stat-card">
      <span class="mental-stat-num">${topEmotion ? `${EMOTION_CONFIG[topEmotion[0]]?.emoji || "?"} ${topEmotion[1]}d` : "—"}</span>
      <span class="mental-stat-label">Emoción frecuente</span>
    </div>
  `;
}

function renderMentalInsight() {
  const logs = state.mentalLogs || [];
  const textEl = document.getElementById("mental-insight-text");
  const chipsEl = document.getElementById("mental-emotion-chips");
  if (!textEl || !chipsEl) return;

  if (!logs.length) {
    textEl.textContent = "Escribe tu primer registro para ver el análisis.";
    chipsEl.innerHTML = "";
    return;
  }

  // Count emotions in last 30 days
  const since = new Date(); since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString().slice(0, 10);
  const recent = logs.filter((l) => l.date >= sinceISO);
  const counts = {};
  recent.forEach((l) => (l.emotions || []).forEach((e) => { counts[e] = (counts[e] || 0) + 1; }));

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const positives = sorted.filter(([e]) => EMOTION_CONFIG[e]?.sentiment > 0);
  const negatives = sorted.filter(([e]) => EMOTION_CONFIG[e]?.sentiment < 0);
  const dominantPos = positives[0];
  const dominantNeg = negatives[0];

  let insight = "";
  if (dominantPos && dominantNeg) {
    insight = `En los últimos 30 días tu emoción más frecuente fue "${EMOTION_CONFIG[dominantPos[0]]?.label}" (${dominantPos[1]} días) aunque también hubo momentos de "${EMOTION_CONFIG[dominantNeg[0]]?.label}" (${dominantNeg[1]} días).`;
  } else if (dominantPos) {
    insight = `¡Buen mes! Tu emoción dominante fue "${EMOTION_CONFIG[dominantPos[0]]?.label}" con ${dominantPos[1]} días registrados.`;
  } else if (dominantNeg) {
    insight = `Fue un período desafiante. La emoción más registrada fue "${EMOTION_CONFIG[dominantNeg[0]]?.label}" (${dominantNeg[1]} días). Recuerda que está bien pedir apoyo.`;
  } else {
    insight = `Tienes ${recent.length} registros este mes. Sigue escribiendo para obtener un análisis más completo.`;
  }

  textEl.textContent = insight;
  chipsEl.innerHTML = sorted.slice(0, 5).map(([e, n]) => {
    const cfg = EMOTION_CONFIG[e] || {};
    return `<span class="mental-chip" style="background:${cfg.color}22;border-color:${cfg.color}44;color:${cfg.color}">${cfg.emoji || ""} ${cfg.label || e} <strong>${n}d</strong></span>`;
  }).join("");
}

function renderMentalTrend() {
  const container = document.getElementById("mental-trend-chart");
  const label = document.getElementById("mental-trend-label");
  if (!container) return;

  // Last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const logs = state.mentalLogs || [];
  const byDate = {};
  logs.forEach((l) => { byDate[l.date] = l; });

  if (label) label.textContent = "Últimos 14 días";

  container.innerHTML = `
    <div class="mental-trend-bars">
      ${days.map((day) => {
        const log = byDate[day];
        const emotions = log?.emotions || [];
        const score = getSentimentScore(emotions);
        const sentiment = getSentimentLabel(score);
        const hasLog = !!log;
        const d = new Date(day + "T00:00:00");
        const dayName = d.toLocaleDateString("es-PE", { weekday: "short" });
        const dayNum = d.getDate();
        const isToday = day === todayISO();
        const barHeight = hasLog ? Math.max(20, Math.abs(score) * 60 + 20) : 6;
        const barColor = hasLog ? sentiment.color : "var(--line)";
        const emotion = emotions[0] ? (EMOTION_CONFIG[emotions[0]]?.emoji || "") : "";
        return `
          <div class="mental-bar-col${isToday ? " mental-bar-today" : ""}">
            <span class="mental-bar-emotion">${emotion}</span>
            <div class="mental-bar-wrap">
              <div class="mental-bar" style="height:${barHeight}px;background:${barColor}" title="${hasLog ? emotions.map((e) => EMOTION_CONFIG[e]?.label || e).join(", ") : "Sin registro"}"></div>
            </div>
            <span class="mental-bar-day">${isToday ? "Hoy" : dayName}</span>
            <span class="mental-bar-num">${dayNum}</span>
          </div>`;
      }).join("")}
    </div>
  `;
}

function updateMentalTodayPreview() {
  const today = todayISO();
  const existing = (state.mentalLogs || []).find((l) => l.date === today);
  const preview = document.getElementById("mental-today-preview");
  if (!preview) return;
  if (existing) {
    const cfg0 = existing.emotions?.[0] ? EMOTION_CONFIG[existing.emotions[0]] : null;
    preview.innerHTML = `<span style="color:var(--green);font-weight:700">✓ Ya tienes un registro hoy</span>${cfg0 ? ` · ${cfg0.emoji} ${cfg0.label}` : ""}`;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
  }
}

function renderMentalList() {
  const list = document.getElementById("mental-list");
  const countEl = document.getElementById("mental-history-count");
  const logs = (state.mentalLogs || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  if (countEl) countEl.textContent = `${logs.length} entradas`;
  if (!list) return;
  list.innerHTML = "";
  if (!logs.length) {
    list.innerHTML = `<p class="empty-message">Sin registros aún. ¡Escribe cómo te fue hoy!</p>`;
    return;
  }
  logs.slice(0, 30).forEach((log) => {
    const el = document.createElement("div");
    el.className = "list-item mental-log-item";
    const score = getSentimentScore(log.emotions || []);
    const sentiment = getSentimentLabel(score);
    const chipsHtml = (log.emotions || []).map((e) => {
      const cfg = EMOTION_CONFIG[e] || {};
      return `<span class="mental-chip mental-chip-sm" style="background:${cfg.color}22;border-color:${cfg.color}44;color:${cfg.color}">${cfg.emoji || ""} ${cfg.label || e}</span>`;
    }).join("");
    el.innerHTML = `
      <div class="item-main">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span class="item-title">${formatDate(log.date)}</span>
            <span class="mental-sentiment-dot" style="color:${sentiment.color};font-size:0.78rem">${sentiment.label}</span>
          </div>
          ${chipsHtml ? `<div class="mental-chip-row">${chipsHtml}</div>` : ""}
          ${log.text ? `<p class="mental-log-text">${escapeHTML(log.text.slice(0, 180))}${log.text.length > 180 ? "…" : ""}</p>` : ""}
        </div>
        <button class="danger-button" data-delete-mental="${log.id}" type="button" style="flex-shrink:0;align-self:flex-start">✕</button>
      </div>`;
    el.querySelector("[data-delete-mental]")?.addEventListener("click", () => {
      state.mentalLogs = (state.mentalLogs || []).filter((l) => l.id !== log.id);
      saveState(); renderMental();
    });
    list.appendChild(el);
  });
}

function bindMentalForm() {
  // Tag picker
  document.querySelectorAll(".mental-tag-btn").forEach((btn) => {
    const tag = btn.dataset.tag;
    btn.classList.toggle("active", mentalSelectedTags.includes(tag));
    btn.onclick = () => {
      if (mentalSelectedTags.includes(tag)) {
        mentalSelectedTags = mentalSelectedTags.filter((t) => t !== tag);
      } else {
        mentalSelectedTags.push(tag);
      }
      btn.classList.toggle("active", mentalSelectedTags.includes(tag));
    };
  });

  // Live emotion detection as user types
  const textarea = document.getElementById("mental-text");
  const detectedWrap = document.getElementById("mental-detected-emotions");
  const detectedChips = document.getElementById("mental-detected-chips");

  if (textarea && !textarea._mentalBound) {
    textarea._mentalBound = true;
    textarea.addEventListener("input", () => {
      const text = textarea.value;
      if (text.length < 10) { detectedWrap?.classList.add("hidden"); return; }
      const emotions = detectEmotions(text);
      if (emotions.length && detectedChips && detectedWrap) {
        detectedChips.innerHTML = emotions.map((e) => {
          const cfg = EMOTION_CONFIG[e] || {};
          return `<span class="mental-chip mental-chip-sm" style="background:${cfg.color}22;border-color:${cfg.color}44;color:${cfg.color}">${cfg.emoji || ""} ${cfg.label || e}</span>`;
        }).join("");
        detectedWrap.classList.remove("hidden");
      } else {
        detectedWrap?.classList.add("hidden");
      }
    });
  }

  // Save button
  const saveBtn = document.getElementById("mental-save-btn");
  if (saveBtn && !saveBtn._mentalBound) {
    saveBtn._mentalBound = true;
    saveBtn.addEventListener("click", () => {
      const text = (document.getElementById("mental-text")?.value || "").trim();
      const date = document.getElementById("mental-date")?.value || todayISO();
      if (!text && !mentalSelectedTags.length) {
        alert("Escribe algo o selecciona al menos una emoción.");
        return;
      }
      const autoEmotions = text ? detectEmotions(text) : [];
      const allEmotions = [...new Set([...mentalSelectedTags, ...autoEmotions])];

      // Replace if same date already exists
      const existing = (state.mentalLogs || []).findIndex((l) => l.date === date);
      const entry = { id: uid(), date, text, emotions: allEmotions, createdAt: Date.now() };
      if (existing >= 0) {
        if (!confirm("Ya tienes un registro para esta fecha. ¿Reemplazarlo?")) return;
        state.mentalLogs[existing] = entry;
      } else {
        state.mentalLogs = [...(state.mentalLogs || []), entry];
      }

      saveState();
      // Reset form
      if (document.getElementById("mental-text")) document.getElementById("mental-text").value = "";
      mentalSelectedTags = [];
      document.getElementById("mental-detected-emotions")?.classList.add("hidden");
      renderMental();
    });
  }
}

function bindReceiptScanner() {
  const fileInput   = document.getElementById("receipt-file-input");
  const previewWrap = document.getElementById("receipt-preview-wrap");
  const previewImg  = document.getElementById("receipt-preview-img");
  const clearBtn    = document.getElementById("receipt-clear-btn");
  const uploadLabel = document.getElementById("receipt-upload-label");
  const ocrStatus   = document.getElementById("receipt-ocr-status");
  const ocrResult   = document.getElementById("receipt-ocr-result");
  const uploadText  = document.getElementById("receipt-upload-text");

  if (!fileInput) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      window._pendingReceiptDataUrl = dataUrl;
      previewImg.src = dataUrl;
      previewWrap.classList.remove("hidden");
      uploadLabel.classList.add("hidden");

      // Start OCR
      ocrStatus.textContent = "🔍 Analizando recibo...";
      ocrStatus.classList.remove("hidden");
      ocrResult.classList.add("hidden");

      try {
        if (typeof Tesseract === "undefined") throw new Error("Tesseract no disponible");
        const result = await Tesseract.recognize(dataUrl, "spa+eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              ocrStatus.textContent = `🔍 Analizando... ${Math.round(m.progress * 100)}%`;
            }
          },
        });

        const text = result.data.text;
        const { amount, date } = extractReceiptData(text);

        // Fill form fields
        const form = document.getElementById("expense-form");
        if (form) {
          if (amount) form.querySelector('[name="amount"]').value = amount;
          if (date)   form.querySelector('[name="date"]').value = date;
        }

        // Show result
        ocrStatus.classList.add("hidden");
        if (amount || date) {
          ocrResult.innerHTML = `
            <span class="receipt-ocr-badge">🤖 Detectado automáticamente</span>
            ${amount ? `<span class="receipt-ocr-chip">💰 S/ ${amount}</span>` : ""}
            ${date   ? `<span class="receipt-ocr-chip">📅 ${formatDate(date)}</span>` : ""}
          `;
          ocrResult.classList.remove("hidden");
        } else {
          ocrStatus.textContent = "⚠️ No se detectaron datos. Ingresa manualmente.";
          ocrStatus.classList.remove("hidden");
        }

      } catch (err) {
        ocrStatus.textContent = "⚠️ No se pudo analizar la imagen.";
        console.warn("OCR error:", err);
      }
    };
    reader.readAsDataURL(file);
  });

  clearBtn?.addEventListener("click", clearReceiptPreview);
}

// ══════════════════════════════════════════
// ── IMPORT / EXPORT PDF ──
// ══════════════════════════════════════════
function bindImportExport() {
  document.getElementById("import-data")?.addEventListener("click", () => document.getElementById("import-file")?.click());
  document.getElementById("import-file")?.addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported && typeof imported === "object" && !Array.isArray(imported)) {
          // Sanitize context colors to prevent CSS injection
          if (Array.isArray(imported.contexts)) {
            imported.contexts = imported.contexts.map((c) => ({
              ...c,
              dot: safeColor(c.dot, DEFAULT_COLOR.dot),
              bg: safeColor(c.bg, DEFAULT_COLOR.bg),
              color: safeColor(c.color, DEFAULT_COLOR.color),
              label: String(c.label || "").slice(0, 40),
              emoji: String(c.emoji || "").slice(0, 4),
              id: String(c.id || uid()).slice(0, 60),
            }));
          }
          state = { ...emptyState, ...imported };
          saveState(); render();
          alert("✅ Datos importados correctamente.");
        }
      } catch { alert("❌ Archivo inválido."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("export-pdf")?.addEventListener("click", () => {
    const today = new Date().toLocaleDateString("es-PE", { day:"numeric", month:"long", year:"numeric" });
    const jobIncome = (state.jobs||[]).reduce((s,j) => s+Number(j.amount||0),0);
    const expenses = (state.finances||[]).filter((f) => f.type==="expense").reduce((s,f) => s+f.amount,0);
    const openTasks = (state.tasks||[]).filter((t) => !t.done).length;
    const activeGoals = (state.goals||[]).length;

    const win = window.open("","_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Resumen Alex App</title>
    <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;color:#111}h1{color:#e63946}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5}.section{margin-top:28px}h2{color:#333;border-bottom:2px solid #e63946;padding-bottom:6px}</style>
    </head><body>
    <h1>📊 Resumen Alex App</h1><p>${today}</p>
    <div class="section"><h2>💰 Finanzas</h2>
    <table><tr><th>Ingresos fijos</th><td>${formatMoney(jobIncome)}</td></tr>
    <tr><th>Gastos registrados</th><td>${formatMoney(expenses)}</td></tr>
    <tr><th>Balance estimado</th><td>${formatMoney(jobIncome-expenses)}</td></tr></table></div>
    <div class="section"><h2>✅ Actividades</h2>
    <table><tr><th>Tareas pendientes</th><td>${openTasks}</td></tr>
    <tr><th>Metas activas</th><td>${activeGoals}</td></tr></table></div>
    <div class="section"><h2>💪 Gym este mes</h2><p>${(state.gym||[]).length} días registrados</p></div>
    <div class="section"><h2>🎯 Metas</h2><table>${(state.goals||[]).slice(0,10).map((g)=>`<tr><td>${escapeHTML(g.title)}</td><td>${calcLinkedProgress(g)}/${g.target} ${escapeHTML(g.unit||"")}</td></tr>`).join("")}</table></div>
    </body></html>`);
    win.document.close(); win.print();
  });
}

// ══════════════════════════════════════════
// ── SUBTASKS ──
// ══════════════════════════════════════════
let pendingSubtasks = [];

function renderSubtaskPreformList() {
  const el = document.getElementById("subtask-preform-list");
  if (!el) return;
  el.innerHTML = "";
  pendingSubtasks.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "goal-task-item";
    div.innerHTML = `<span>⬜</span><span class="goal-task-label">${escapeHTML(s.title)}</span>
      <button class="danger-button" data-remove-subtask="${i}" type="button" style="padding:2px 8px;font-size:0.72rem;min-height:unset">✕</button>`;
    el.appendChild(div);
  });
}

function bindSubtaskPreform() {
  document.getElementById("subtask-add-btn")?.addEventListener("click", () => {
    const f = document.getElementById("subtask-preform-form");
    if (f) { f.style.display = f.style.display === "none" ? "flex" : "none"; document.getElementById("subtask-title-input")?.focus(); }
  });
  document.getElementById("subtask-submit-btn")?.addEventListener("click", () => {
    const input = document.getElementById("subtask-title-input");
    const title = input?.value?.trim(); if (!title) return;
    pendingSubtasks.push({ id: uid(), title, done: false });
    if (input) input.value = "";
    renderSubtaskPreformList();
  });
  document.getElementById("subtask-title-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("subtask-submit-btn")?.click(); }
  });
}

function renderSubtasks(task) {
  if (!task.subtasks?.length) return "";
  const items = task.subtasks.map((s) => `
    <div class="subtask-item${s.done ? " done" : ""}">
      <button class="goal-task-check" data-toggle-subtask="${task.id}" data-subtask-id="${s.id}" type="button">${s.done ? "✅" : "⬜"}</button>
      <span class="goal-task-label">${escapeHTML(s.title)}</span>
    </div>`).join("");
  const done = task.subtasks.filter((s) => s.done).length;
  return `<div class="subtasks-block">
    <p class="subtasks-progress">${done}/${task.subtasks.length} subtareas</p>
    <div class="goal-task-list">${items}</div></div>`;
}

// ══════════════════════════════════════════
// ── DEBTS ──
// ══════════════════════════════════════════
function renderDebts() {
  const list = document.getElementById("debts-list");
  const summary = document.getElementById("debts-summary");
  if (!list) return;
  const debts = state.debts || [];
  const iOwe = debts.filter((d) => d.debtType === "owes").reduce((s,d) => s+d.amount, 0);
  const theyOwe = debts.filter((d) => d.debtType === "owed").reduce((s,d) => s+d.amount, 0);
  if (summary) summary.textContent = `Me deben: ${formatMoney(theyOwe)} · Debo: ${formatMoney(iOwe)}`;
  list.innerHTML = "";
  if (!debts.length) { list.innerHTML = `<p class="empty-message">Sin deudas registradas.</p>`; return; }
  debts.forEach((d) => {
    const isOwe = d.debtType === "owes";
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="item-main">
        <div>
          <p class="item-title">${isOwe ? "🔴" : "🟢"} ${escapeHTML(d.name)}</p>
          <p class="item-meta">${isOwe ? "Le debo a" : "Me debe"}: ${escapeHTML(d.person)}${d.dueDate ? ` · Vence: ${formatDate(d.dueDate)}` : ""}</p>
          ${d.notes ? `<p class="item-meta">${escapeHTML(d.notes)}</p>` : ""}
        </div>
        <span class="${isOwe ? "amount-expense" : "amount-income"}">${formatMoney(d.amount)}</span>
      </div>
      <div class="item-actions">
        <button class="secondary-button" data-settle-debt="${d.id}" type="button">✓ Saldar</button>
        <button class="danger-button" data-delete-debt="${d.id}" type="button">Eliminar</button>
      </div>`;
    list.appendChild(div);
  });
}

// ══════════════════════════════════════════
// ── RECURRING EXPENSES ──
// ══════════════════════════════════════════
function renderRecurring() {
  const list = document.getElementById("recurring-list");
  const summary = document.getElementById("recurring-summary");
  if (!list) return;
  const items = state.recurringExpenses || [];
  const total = items.reduce((s,r) => s+r.amount, 0);
  if (summary) summary.textContent = `Total fijo: ${formatMoney(total)}/mes`;
  list.innerHTML = "";
  if (!items.length) { list.innerHTML = `<p class="empty-message">Sin gastos fijos registrados.</p>`; return; }
  items.forEach((r) => {
    const today = new Date().getDate();
    const daysUntil = r.day >= today ? r.day - today : (30 - today + r.day);
    const soon = daysUntil <= 3;
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="item-main">
        <div>
          <p class="item-title">${escapeHTML(r.name)} ${soon ? "⚠️" : ""}</p>
          <p class="item-meta">${escapeHTML(r.category)} · Día ${r.day} de cada mes${soon ? ` · ¡En ${daysUntil} día${daysUntil!==1?"s":""}!` : ""}</p>
        </div>
        <span class="amount-expense">${formatMoney(r.amount)}</span>
      </div>
      <div class="item-actions">
        <button class="danger-button" data-delete-recurring="${r.id}" type="button">Eliminar</button>
      </div>`;
    list.appendChild(div);
  });
}

// ══════════════════════════════════════════
// ── WATER ──
// ══════════════════════════════════════════
const WATER_GOAL = 8;
function getWaterToday() { return (state.water || {})[todayISO()] || 0; }
function renderWater() {
  const count = getWaterToday();
  const countEl = document.getElementById("water-count"); if (countEl) countEl.textContent = count;
  const glassesEl = document.getElementById("water-glasses"); if (!glassesEl) return;
  glassesEl.innerHTML = Array.from({length: WATER_GOAL}, (_,i) =>
    `<span class="water-glass${i < count ? " filled" : ""}" title="Vaso ${i+1}">💧</span>`).join("");
}
function bindWater() {
  document.getElementById("water-add")?.addEventListener("click", () => {
    const today = todayISO(); state.water = state.water || {};
    if ((state.water[today]||0) < WATER_GOAL*2) state.water[today] = (state.water[today]||0)+1;
    saveState(); renderWater();
  });
  document.getElementById("water-reset")?.addEventListener("click", () => {
    state.water = state.water || {}; state.water[todayISO()] = 0; saveState(); renderWater();
  });
}

// ══════════════════════════════════════════
// ── MOOD ──
// ══════════════════════════════════════════
const MOOD_EMOJI = { 1:"😞",2:"😕",3:"😐",4:"🙂",5:"😄" };
function renderMood() {
  const today = todayISO();
  const todayMood = (state.mood||{})[today];
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.classList.toggle("mood-selected", todayMood && Number(btn.dataset.mood) === todayMood.score);
  });
  const hist = document.getElementById("mood-history"); if (!hist) return;
  const last7 = Array.from({length:7},(_,i) => { const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10); }).reverse();
  hist.innerHTML = last7.map((d) => {
    const m = (state.mood||{})[d]; const day = new Date(`${d}T00:00:00`).toLocaleDateString("es-PE",{weekday:"short"});
    return `<div class="mood-hist-day"><span>${day}</span><span>${m ? MOOD_EMOJI[m.score] : "·"}</span></div>`;
  }).join("");
}
function bindMood() {
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".mood-btn");
    if (!btn) return;
    state.mood = state.mood || {};
    state.mood[todayISO()] = { score: Number(btn.dataset.mood) };
    saveState(); renderMood();
  });
}

// ══════════════════════════════════════════
// ── HEALTH ──
// ══════════════════════════════════════════
function renderHealth() {
  const list = document.getElementById("health-list"); if (!list) return;
  const items = [...(state.health||[])].sort((a,b) => b.date.localeCompare(a.date)).slice(0,10);
  list.innerHTML = "";
  if (!items.length) { list.innerHTML = `<p class="empty-message">Sin registros de salud.</p>`; return; }
  items.forEach((h) => {
    const div = document.createElement("div"); div.className = "list-item";
    div.innerHTML = `<div class="item-main"><div>
      <p class="item-title">${formatDate(h.date)}</p>
      <p class="item-meta">${h.weight ? `⚖️ ${h.weight}kg` : ""}${h.sleep ? ` · 😴 ${h.sleep}h` : ""}</p>
    </div><button class="danger-button" data-delete-health="${h.id}" type="button">✕</button></div>`;
    list.appendChild(div);
  });
}

// ══════════════════════════════════════════
// ── KEYBOARD SHORTCUTS ──
// ══════════════════════════════════════════
function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
    if (e.ctrlKey || e.metaKey) {
      switch(e.key) {
        case "f": e.preventDefault(); document.getElementById("global-search")?.focus(); break;
        case "1": e.preventDefault(); switchView("dashboard"); break;
        case "2": e.preventDefault(); switchView("finances"); break;
        case "3": e.preventDefault(); switchView("organizer"); break;
        case "4": e.preventDefault(); switchView("meetings"); break;
        case "5": e.preventDefault(); switchView("performance"); break;
        case "6": e.preventDefault(); switchView("calendar"); break;
      }
    }
    if (e.key === "Escape") { document.getElementById("global-search").value=""; document.getElementById("global-search-results")?.classList.add("hidden"); }
  });
}

// ══════════════════════════════════════════
// ── THEME ──
// ══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem("alex-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeBtn(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("alex-theme", next);
  updateThemeBtn(next);
}
function updateThemeBtn(theme) {
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
}

// ══════════════════════════════════════════
// ── GLOBAL SEARCH ──
// ══════════════════════════════════════════
function initGlobalSearch() {
  const input = document.getElementById("global-search");
  const results = document.getElementById("global-search-results");
  if (!input || !results) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (q.length < 2) { results.classList.add("hidden"); return; }

    const hits = [];
    (state.tasks || []).forEach((t) => { if (`${t.title} ${t.body}`.toLowerCase().includes(q)) hits.push({ icon:"✅", label: t.title, sub: formatDate(t.dueDate), view:"organizer" }); });
    (state.meetings || []).forEach((m) => { if (`${m.title} ${m.people}`.toLowerCase().includes(q)) hits.push({ icon:"🤝", label: m.title, sub: formatDate(m.date), view:"meetings" }); });
    (state.notes || []).forEach((n) => { if (`${n.title} ${n.body} ${n.tag}`.toLowerCase().includes(q)) hits.push({ icon:"📝", label: n.title, sub: n.tag, view:"meetings" }); });
    (state.goals || []).forEach((g) => { if (g.title.toLowerCase().includes(q)) hits.push({ icon:"🎯", label: g.title, sub: CAT_CONFIG[g.category]?.label || "", view:"performance" }); });
    (state.finances || []).forEach((f) => { if (`${f.description} ${f.category}`.toLowerCase().includes(q)) hits.push({ icon: f.type==="income"?"💰":"💸", label: f.description, sub: formatMoney(f.amount), view:"finances" }); });

    if (!hits.length) { results.innerHTML = `<div class="search-hit search-empty">Sin resultados</div>`; results.classList.remove("hidden"); return; }

    hits.slice(0, 8).forEach((h) => {
      const div = document.createElement("div");
      div.className = "search-hit";
      div.innerHTML = `<span class="search-icon">${h.icon}</span><span class="search-label">${escapeHTML(h.label)}</span><span class="search-sub">${escapeHTML(h.sub || "")}</span>`;
      div.addEventListener("click", () => { switchView(h.view); input.value = ""; results.classList.add("hidden"); });
      results.appendChild(div);
    });
    results.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => { if (!e.target.closest(".global-search-wrap")) results.classList.add("hidden"); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.value = ""; results.classList.add("hidden"); } });
}

// ══════════════════════════════════════════
// ── WEEKLY SUMMARY ──
// ══════════════════════════════════════════
function renderWeeklySummary() {
  const el = document.getElementById("weekly-summary");
  const rangeEl = document.getElementById("week-range-label");
  if (!el) return;

  const now = new Date();
  const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  const weekStart = sun.toISOString().slice(0,10);
  const weekEnd = sat.toISOString().slice(0,10);

  if (rangeEl) rangeEl.textContent = `${sun.toLocaleDateString("es-PE",{day:"numeric",month:"short"})} – ${sat.toLocaleDateString("es-PE",{day:"numeric",month:"short"})}`;

  const tasksCompleted = (state.tasks||[]).filter((t) => t.done).length;
  const tasksPending   = (state.tasks||[]).filter((t) => !t.done && t.dueDate <= weekEnd).length;
  const gymDays        = (state.gym||[]).filter((g) => g.date >= weekStart && g.date <= weekEnd).length;
  const workHours      = (state.workLogs||[]).filter((l) => l.date >= weekStart && l.date <= weekEnd).reduce((s,l) => s + Number(l.hours), 0);
  const meetings       = (state.meetings||[]).filter((m) => m.date >= weekStart && m.date <= weekEnd).length;
  const expenses       = (state.finances||[]).filter((f) => f.type==="expense" && f.date >= weekStart && f.date <= weekEnd).reduce((s,f) => s+f.amount, 0);

  el.innerHTML = `
    <div class="week-stat-card"><span class="week-stat-num">${tasksCompleted}</span><span class="week-stat-label">Tareas completadas</span></div>
    <div class="week-stat-card"><span class="week-stat-num">${tasksPending}</span><span class="week-stat-label">Pendientes esta semana</span></div>
    <div class="week-stat-card"><span class="week-stat-num">${gymDays}</span><span class="week-stat-label">Días de gym 💪</span></div>
    <div class="week-stat-card"><span class="week-stat-num">${workHours}h</span><span class="week-stat-label">Horas trabajadas</span></div>
    <div class="week-stat-card"><span class="week-stat-num">${meetings}</span><span class="week-stat-label">Reuniones</span></div>
    <div class="week-stat-card"><span class="week-stat-num" style="color:var(--red)">${formatMoney(expenses)}</span><span class="week-stat-label">Gastos semana</span></div>`;
}

// ══════════════════════════════════════════
// ── FINANCIAL PROJECTION ──
// ══════════════════════════════════════════
function renderProjection() {
  const el = document.getElementById("finance-projection");
  if (!el) return;
  const jobIncome = (state.jobs||[]).reduce((s,j) => s + Number(j.amount||0), 0);
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const lastMonths = [-2,-1,0].map((i) => { const d=new Date(now.getFullYear(),now.getMonth()+i,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const avgExpense = lastMonths.reduce((s,k) => s + (state.finances||[]).filter((f) => f.type==="expense" && f.date?.startsWith(k)).reduce((ss,f) => ss+f.amount, 0), 0) / 3;
  const extraIncome = (state.finances||[]).filter((f) => f.type==="income" && f.date?.startsWith(curKey)).reduce((s,f) => s+f.amount, 0);
  const totalIncome = jobIncome + extraIncome;
  const monthlySave = totalIncome - avgExpense;
  const saveRate = totalIncome > 0 ? Math.round((monthlySave/totalIncome)*100) : 0;

  el.innerHTML = `
    <div class="proj-card"><span class="proj-num">${formatMoney(totalIncome)}</span><span class="proj-label">Ingreso mensual</span></div>
    <div class="proj-card"><span class="proj-num" style="color:var(--red)">${formatMoney(avgExpense)}</span><span class="proj-label">Gasto prom. 3 meses</span></div>
    <div class="proj-card"><span class="proj-num" style="color:${monthlySave>=0?"var(--green)":"var(--red)"}">${formatMoney(monthlySave)}</span><span class="proj-label">Ahorro estimado/mes</span></div>
    <div class="proj-card"><span class="proj-num" style="color:var(--blue)">${formatMoney(monthlySave*12)}</span><span class="proj-label">Proyección anual</span></div>
    <div class="proj-card"><span class="proj-num">${saveRate}%</span><span class="proj-label">Tasa de ahorro</span></div>
    <div class="proj-card"><span class="proj-num" style="color:var(--purple)">${formatMoney(monthlySave*6)}</span><span class="proj-label">Fondo 6 meses</span></div>`;
}

// ══════════════════════════════════════════
// ── GOAL HISTORY ──
// ══════════════════════════════════════════
function renderGoalHistory() {
  const el = document.getElementById("goals-history-list");
  const countEl = document.getElementById("history-count");
  if (!el) return;
  const completed = (state.goals||[]).filter((g) => calcLinkedProgress(g) >= Number(g.target) && Number(g.target) > 0);
  if (countEl) countEl.textContent = `${completed.length} completadas`;
  if (!completed.length) { el.innerHTML = `<p class="empty-message">Aún no has completado ninguna meta. ¡Tú puedes!</p>`; return; }
  el.innerHTML = "";
  completed.forEach((g) => {
    const cat = g.category || g.type || "personal";
    const catInfo = CAT_CONFIG[cat] || { label: cat, color: "#999" };
    const div = document.createElement("div");
    div.className = "goal-card goal-done";
    div.innerHTML = `
      <div class="goal-header">
        <div>
          <span class="goal-cat-badge" style="color:${catInfo.color}">${catInfo.label}</span>
          <p class="goal-title">${escapeHTML(g.title)}</p>
          ${g.deadline ? `<p class="item-meta">📅 ${formatDate(g.deadline)}</p>` : ""}
        </div>
        <span class="goal-done-badge">✅ Completada</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:100%;background:var(--green)"></div></div>`;
    el.appendChild(div);
  });
}

// ══════════════════════════════════════════
// ── GOAL TEMPLATES ──
// ══════════════════════════════════════════
const GOAL_TEMPLATES = {
  gym:  { title: "Ir al gym 3 veces por semana", category: "ejercicio", frequency: "semanal", repetitive: true, target: 3, unit: "días", linkedTo: "gym_days" },
  work: { title: "Trabajar 40 horas este mes", category: "trabajo", frequency: "mensual", repetitive: true, target: 40, unit: "horas", linkedTo: "work_hours" },
  save: { title: "Ahorrar 20% del sueldo", category: "financiero", frequency: "mensual", repetitive: true, target: 20, unit: "%", linkedTo: "" },
  run:  { title: "Correr 20 km este mes", category: "ejercicio", frequency: "mensual", repetitive: false, target: 20, unit: "km", linkedTo: "" },
  read: { title: "Leer 1 libro este mes", category: "personal", frequency: "mensual", repetitive: false, target: 1, unit: "libros", linkedTo: "" },
};

function applyGoalTemplate(key) {
  const tpl = GOAL_TEMPLATES[key];
  if (!tpl) return;
  const form = document.getElementById("goal-form");
  if (!form) return;
  form.querySelector("[name='title']").value = tpl.title;
  form.querySelector("[name='category']").value = tpl.category;
  form.querySelector("[name='frequency']").value = tpl.frequency;
  const repCheck = form.querySelector("[name='repetitive']");
  if (repCheck) repCheck.checked = tpl.repetitive;
  if (tpl.linkedTo) form.querySelector("[name='linkedTo']").value = tpl.linkedTo;
  form.querySelector("[name='title']").focus();
}

// ══════════════════════════════════════════
// ── DRAG & DROP TASKS ──
// ══════════════════════════════════════════
let dragSrcId = null;
let dragLastX = 0, dragLastY = 0, dragLastT = 0;

function bindDragDrop() {
  document.body.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".list-item[draggable]");
    if (!item) return;
    dragSrcId = item.dataset.taskId;
    item.classList.add("dragging");
    dragLastX = e.clientX; dragLastY = e.clientY; dragLastT = performance.now();
  });
  document.body.addEventListener("dragend", (e) => {
    document.querySelectorAll(".list-item.dragging").forEach((el) => {
      el.style.transition = "transform 0.5s var(--ease-elastic)";
      el.style.transform = "rotate(0deg) scale(1)";
      el.classList.remove("dragging");
      setTimeout(() => { el.style.transition = ""; el.style.transform = ""; }, 520);
    });
    document.querySelectorAll(".drag-over-item").forEach((el) => el.classList.remove("drag-over-item"));
  });
  // Organic "tilt" physics: card leans in the direction of movement, proportional to velocity (Cron/Amie-style)
  document.body.addEventListener("drag", (e) => {
    const dragging = document.querySelector(".list-item.dragging");
    if (!dragging || !e.clientX) return;
    const now = performance.now();
    const dt = Math.max(1, now - dragLastT);
    const vx = (e.clientX - dragLastX) / dt;
    const tilt = Math.max(-12, Math.min(12, vx * 60));
    dragging.style.transform = `rotate(${tilt}deg) scale(1.03)`;
    dragLastX = e.clientX; dragLastY = e.clientY; dragLastT = now;
  });
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    const item = e.target.closest(".list-item[draggable]");
    document.querySelectorAll(".drag-over-item").forEach((el) => el.classList.remove("drag-over-item"));
    if (item && item.dataset.taskId !== dragSrcId) item.classList.add("drag-over-item");
  });
  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target.closest(".list-item[draggable]");
    if (!target || !dragSrcId || target.dataset.taskId === dragSrcId) return;
    const tasks = state.tasks;
    const srcIdx = tasks.findIndex((t) => t.id === dragSrcId);
    const tgtIdx = tasks.findIndex((t) => t.id === target.dataset.taskId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = tasks.splice(srcIdx, 1);
    tasks.splice(tgtIdx, 0, moved);
    saveState(); renderTasks();
    dragSrcId = null;
  });
}

// ══════════════════════════════════════════
// ── POMODORO ──
// ══════════════════════════════════════════
function pomoFormatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function pomoUpdateUI() {
  const timeEl = $("#pomo-time"); if (timeEl) timeEl.textContent = pomoFormatTime(pomoTime);
  const startEl = $("#pomo-start"); if (startEl) startEl.textContent = pomoRunning ? "⏸ Pausar" : "▶ Iniciar";
  const modeEl = $("#pomo-mode-label");
  if (modeEl) {
    modeEl.textContent = pomoMode === "work" ? "Trabajo" : pomoMode === "break" ? "Descanso" : "Descanso largo";
    modeEl.className = `pomo-mode-badge${pomoMode !== "work" ? " pomo-break" : ""}`;
  }
  const sessEl = $("#pomo-sessions");
  if (sessEl) sessEl.textContent = `🍅 ${pomoSessions} sesión${pomoSessions !== 1 ? "es" : ""} hoy`;

  const total = pomoMode === "work" ? POMO_WORK : pomoMode === "break" ? POMO_BREAK : POMO_LONG;
  const pct = pomoTime / total;
  const circumference = 2 * Math.PI * 52;
  const fill = $("#pomo-ring-fill");
  if (fill) { fill.style.strokeDasharray = circumference; fill.style.strokeDashoffset = circumference * (1 - pct); }

  const focusEl = $("#pomo-focus-task");
  if (focusEl) {
    const topTask = [...(state.tasks || [])].filter((t) => !t.done).sort(sortTasks)[0];
    focusEl.textContent = topTask ? `📌 ${topTask.title}` : "";
  }
}

function pomoTick() {
  pomoTime--;
  if (pomoTime <= 0) {
    clearInterval(pomoInterval); pomoRunning = false;
    if (pomoMode === "work") {
      pomoSessions++;
      sendNotification("🍅 Pomodoro completado", "¡Tómate un descanso!");
      pomoMode = pomoSessions % 4 === 0 ? "long" : "break";
      pomoTime = pomoSessions % 4 === 0 ? POMO_LONG : POMO_BREAK;
    } else {
      sendNotification("⏱️ Descanso terminado", "¡A trabajar!");
      pomoMode = "work"; pomoTime = POMO_WORK;
    }
  }
  pomoUpdateUI();
}

function bindPomodoro() {
  $("#pomo-start")?.addEventListener("click", () => {
    if (pomoRunning) { clearInterval(pomoInterval); pomoRunning = false; }
    else { pomoInterval = setInterval(pomoTick, 1000); pomoRunning = true; }
    pomoUpdateUI();
  });
  $("#pomo-reset")?.addEventListener("click", () => {
    clearInterval(pomoInterval); pomoRunning = false;
    pomoTime = pomoMode === "work" ? POMO_WORK : pomoMode === "break" ? POMO_BREAK : POMO_LONG;
    pomoUpdateUI();
  });
  $("#pomo-skip")?.addEventListener("click", () => {
    clearInterval(pomoInterval); pomoRunning = false;
    if (pomoMode === "work") {
      pomoSessions++;
      pomoMode = pomoSessions % 4 === 0 ? "long" : "break";
      pomoTime = pomoSessions % 4 === 0 ? POMO_LONG : POMO_BREAK;
    } else { pomoMode = "work"; pomoTime = POMO_WORK; }
    pomoUpdateUI();
  });
  pomoUpdateUI();
}

// ══════════════════════════════════════════
// ── FINANCE SUMMARY ──
// ══════════════════════════════════════════
function renderFinanceSummary() {
  if (!document.getElementById("fin-summary") || document.getElementById("fin-summary").classList.contains("hidden")) return;

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleDateString("es-PE", { month: "short" }), key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` });
  }

  const jobMonthly = (state.jobs || []).reduce((s, j) => s + (Number(j.amount) || 0), 0);
  const incomes = months.map((m) => {
    const extra = (state.finances || []).filter((f) => f.type === "income" && f.date?.startsWith(m.key)).reduce((s, f) => s + f.amount, 0);
    return extra + jobMonthly;
  });
  const expenses = months.map((m) =>
    (state.finances || []).filter((f) => f.type === "expense" && f.date?.startsWith(m.key)).reduce((s, f) => s + f.amount, 0)
  );

  const barCtx = document.getElementById("chart-bar");
  if (barCtx && typeof Chart !== "undefined") {
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: months.map((m) => m.label),
        datasets: [
          { label: "Ingresos", data: incomes, backgroundColor: "rgba(46,204,113,0.75)", borderRadius: 6 },
          { label: "Gastos",   data: expenses, backgroundColor: "rgba(230,57,70,0.75)", borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#bbbbbb" } } },
        scales: {
          x: { ticks: { color: "#888" }, grid: { color: "#2a2a2a" } },
          y: { ticks: { color: "#888", callback: (v) => `S/${v}` }, grid: { color: "#2a2a2a" } },
        },
      },
    });
  }

  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const ml = document.getElementById("chart-month-label");
  if (ml) ml.textContent = now.toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  const monthExpenses = (state.finances || []).filter((f) => f.type === "expense" && f.date?.startsWith(curKey));
  const catMap = {};
  monthExpenses.forEach((f) => { const k = f.category || "Otro"; catMap[k] = (catMap[k] || 0) + f.amount; });
  const catLabels = Object.keys(catMap);
  const catValues = Object.values(catMap);
  const palette = ["#e63946","#4dabf7","#2ecc71","#f4a261","#9775fa","#f472b6","#38bdf8","#a3e635"];

  const donutCtx = document.getElementById("chart-donut");
  if (donutCtx && typeof Chart !== "undefined") {
    if (chartDonut) chartDonut.destroy();
    if (catLabels.length) {
      chartDonut = new Chart(donutCtx, {
        type: "doughnut",
        data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: palette.slice(0, catLabels.length), borderWidth: 0 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "right", labels: { color: "#bbbbbb", padding: 12, font: { size: 12 } } } },
          cutout: "65%",
        },
      });
    } else {
      donutCtx.parentElement.innerHTML = `<p class="empty-message" style="padding:40px 0">Sin gastos este mes.</p>`;
    }
  }

  renderBudgets();
}

function renderBudgets() {
  const list = document.getElementById("budget-list");
  if (!list) return;
  const budgets = state.budgets || {};
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthExpenses = (state.finances || []).filter((f) => f.type === "expense" && f.date?.startsWith(curKey));

  list.innerHTML = "";
  const cats = Object.keys(budgets);
  if (!cats.length) {
    list.innerHTML = `<p class="empty-message">Agrega una categoría para ver tu presupuesto mensual.</p>`;
    return;
  }
  cats.forEach((cat) => {
    const budget = Number(budgets[cat]);
    const spent = monthExpenses.filter((f) => (f.category || "Otro") === cat).reduce((s, f) => s + f.amount, 0);
    const pct = Math.min(100, Math.round((spent / budget) * 100));
    const over = spent > budget;
    const div = document.createElement("div");
    div.className = "budget-row";
    div.innerHTML = `
      <div class="budget-row-header">
        <span class="budget-cat">${escapeHTML(cat)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="budget-amounts${over ? " over-budget" : ""}">${formatMoney(spent)} / ${formatMoney(budget)}</span>
          <button class="danger-button" data-delete-budget="${escapeHTML(cat)}" type="button" style="padding:2px 8px;font-size:0.72rem;min-height:unset">✕</button>
        </div>
      </div>
      <div class="progress-bar" style="margin:6px 0 2px">
        <div class="progress-fill" style="width:${pct}%;background:${over ? "var(--red)" : pct > 80 ? "var(--amber)" : "var(--green)"}"></div>
      </div>
      <p class="item-meta">${pct}% usado${over ? " · ⚠️ Excedido" : ""}</p>`;
    list.appendChild(div);
  });
}

function bindBudget() {
  document.getElementById("budget-add-btn")?.addEventListener("click", () => {
    const f = document.getElementById("budget-add-form");
    if (f) f.style.display = f.style.display === "none" ? "flex" : "none";
  });
  document.getElementById("budget-save-btn")?.addEventListener("click", () => {
    const cat = document.getElementById("budget-cat-input")?.value?.trim();
    const amt = Number(document.getElementById("budget-amount-input")?.value);
    if (!cat || !amt) return;
    state.budgets = state.budgets || {};
    state.budgets[cat] = amt;
    document.getElementById("budget-cat-input").value = "";
    document.getElementById("budget-amount-input").value = "";
    const f = document.getElementById("budget-add-form"); if (f) f.style.display = "none";
    saveState(); renderBudgets();
  });
  document.body.addEventListener("click", (e) => {
    const delBudget = e.target.closest("[data-delete-budget]");
    if (delBudget) { delete state.budgets[delBudget.dataset.deleteBudget]; saveState(); renderBudgets(); }
  });
}

// ══════════════════════════════════════════
// ── NOTIFICATIONS ──
// ══════════════════════════════════════════
function sendNotification(title, body) {
  if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon-192.png" });
}

function requestNotifPermission() {
  if (!("Notification" in window)) return;
  Notification.requestPermission().then((perm) => {
    updateNotifBtn();
    if (perm === "granted") scheduleNotifications();
  });
}

function scheduleNotifications() {
  if (Notification.permission !== "granted") return;
  const today = todayISO();
  const now = new Date();
  const dueTasks = (state.tasks || []).filter((t) => !t.done && t.dueDate <= today);
  if (dueTasks.length) {
    setTimeout(() => sendNotification(
      `📋 ${dueTasks.length} tarea${dueTasks.length > 1 ? "s" : ""} pendiente${dueTasks.length > 1 ? "s" : ""}`,
      dueTasks.slice(0, 3).map((t) => t.title).join(", ")
    ), 3000);
  }
  (state.meetings || []).forEach((m) => {
    if (m.date !== today || !m.time) return;
    const [h, min] = m.time.split(":").map(Number);
    const meetingMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min).getTime();
    const diff = meetingMs - now.getTime() - 10 * 60 * 1000;
    if (diff > 0 && diff < 3600000) setTimeout(() => sendNotification("🤝 Reunión en 10 min", m.title), diff);
  });
}

function updateNotifBtn() {
  const btn = document.getElementById("notif-btn");
  if (!btn) return;
  if (!("Notification" in window)) { btn.style.display = "none"; return; }
  const granted = Notification.permission === "granted";
  btn.textContent = granted ? "🔔" : "🔕";
  btn.title = granted ? "Recordatorios activos" : "Activar recordatorios";
  btn.style.opacity = granted ? "1" : "0.6";
}

// ── Init ──
initTheme();
$("#today-label").textContent = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
setDefaultDates();
checkRepetitiveGoals();
gcalLoadToken();
gcalUpdateUI();
if (gcalIsConnected()) gcalFetchEvents();
bindEvents();
bindCalendarEvents();
bindGcalEvents();
bindAttachments();
bindPomodoro();
bindBudget();
bindDragDrop();
bindUserName();
bindImportExport();
bindSubtaskPreform();
bindWater();
bindMood();
bindKeyboardShortcuts();
initGlobalSearch();
initGlowCards();
updateNotifBtn();
if (Notification.permission === "granted") scheduleNotifications();

document.getElementById("notif-btn")?.addEventListener("click", requestNotifPermission);
document.body.addEventListener("click", (e) => {
  if (e.target.closest("[data-fin='summary']")) setTimeout(() => { renderFinanceSummary(); renderProjection(); }, 50);
});

render();

// Handle ?view= URL param (PWA shortcuts)
const urlView = new URLSearchParams(location.search).get("view");
const validViews = ["dashboard","finances","organizer","meetings","performance","calendar"];
if (urlView && validViews.includes(urlView)) switchView(urlView);
else switchView("dashboard");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
