const scopes = ["day", "week", "month"];
const views = ["day", "week", "month", "done", "overdue"];
const labels = { day: "Day", week: "Week", month: "Month", overdue: "Overdue", done: "Done" };
const initialTasks = { day: [], week: [], month: [] };

let activeView = localStorage.getItem("todoActiveView") || "day";
let tasks = initialTasks;
let todoDataPath = "";
let isSaving = false;

const statusEl = document.querySelector("#status");
const inputEl = document.querySelector("#task-input");

document.querySelector("#add-task").addEventListener("click", addTask);
document.querySelector("#calendar").addEventListener("click", () => {
  window.todoField.openLink("https://calendar.google.com/calendar/u/0/r");
});
document.querySelector("#hide").addEventListener("click", () => window.todoField.windowAction("close"));
document.querySelector("#pin").addEventListener("click", async () => {
  const pinned = await window.todoField.windowAction("toggle-pin");
  document.querySelector("#pin").style.color = pinned ? "var(--yellow)" : "var(--text)";
});
inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTask();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeView = tab.dataset.view;
    localStorage.setItem("todoActiveView", activeView);
    render();
  });
});

async function save() {
  isSaving = true;
  try {
    const data = await window.todoField.writeData({ tasks });
    todoDataPath = data.path || todoDataPath;
  } catch (error) {
    console.error(error);
    setStatus(`Save failed: ${error.message}`);
  } finally {
    isSaving = false;
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function nowStamp() {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function weekNumber(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

function periodKey(scope, date = new Date()) {
  const year = date.getFullYear();
  if (scope === "day") return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (scope === "week") return `${year}-W${pad(weekNumber(date))}`;
  return `${year}-${pad(date.getMonth() + 1)}`;
}

function currentScope() {
  return scopes.includes(activeView) ? activeView : "day";
}

function ensureTasks() {
  for (const scope of scopes) {
    if (!Array.isArray(tasks[scope])) tasks[scope] = [];
    tasks[scope] = tasks[scope].map((task) => ({
      id: task.id || crypto.randomUUID(),
      title: task.title || "Untitled task",
      done: Boolean(task.done),
      overdue: Boolean(task.overdue),
      createdAt: task.createdAt || nowStamp(),
      doneAt: task.doneAt || null,
      periodKey: task.periodKey || periodKey(scope)
    }));
  }
}

async function loadTasks({ migrateLocal = false } = {}) {
  try {
    const data = await window.todoField.readData();
    todoDataPath = data.path || todoDataPath;
    const remoteTasks = data.tasks || initialTasks;
    const legacyTasks = migrateLocal ? JSON.parse(localStorage.getItem("todoTasks") || "null") : null;
    const hasRemoteTasks = scopes.some((scope) => Array.isArray(remoteTasks[scope]) && remoteTasks[scope].length);
    const hasLegacyTasks = legacyTasks && scopes.some((scope) => Array.isArray(legacyTasks[scope]) && legacyTasks[scope].length);
    tasks = !hasRemoteTasks && hasLegacyTasks ? legacyTasks : remoteTasks;
    ensureTasks();
    if (!hasRemoteTasks && hasLegacyTasks) await save();
  } catch (error) {
    console.error(error);
    tasks = JSON.parse(localStorage.getItem("todoTasks") || "null") || initialTasks;
    ensureTasks();
    setStatus(`Using local fallback: ${error.message}`);
  }
}

function refreshPeriodStatus() {
  let changed = false;
  for (const scope of scopes) {
    const currentKey = periodKey(scope);
    for (const task of tasks[scope]) {
      const shouldOverdue = !task.done && task.periodKey !== currentKey;
      if (task.overdue !== shouldOverdue) {
        task.overdue = shouldOverdue;
        changed = true;
      }
    }
  }
  if (changed) save();
}

function addTask() {
  const title = inputEl.value.trim();
  if (!title) return;
  const scope = currentScope();
  tasks[scope].unshift({
    id: crypto.randomUUID(),
    title,
    done: false,
    overdue: false,
    createdAt: nowStamp(),
    doneAt: null,
    periodKey: periodKey(scope)
  });
  inputEl.value = "";
  save();
  setStatus(`Added to ${scope}`);
  render();
}

function findTask(id) {
  for (const scope of scopes) {
    const task = tasks[scope].find((item) => item.id === id);
    if (task) return { scope, task };
  }
  return null;
}

function toggleTask(id) {
  const found = findTask(id);
  if (!found) return;
  found.task.done = !found.task.done;
  found.task.doneAt = found.task.done ? nowStamp() : null;
  found.task.overdue = !found.task.done && found.task.periodKey !== periodKey(found.scope);
  save();
  render();
}

function deleteTask(id) {
  for (const scope of scopes) {
    tasks[scope] = tasks[scope].filter((task) => task.id !== id);
  }
  save();
  render();
}

function restoreTask(id) {
  const found = findTask(id);
  if (!found) return;
  found.task.periodKey = periodKey(found.scope);
  found.task.overdue = false;
  found.task.done = false;
  found.task.doneAt = null;
  save();
  setStatus(`Restored to ${labels[found.scope]}`);
  render();
}

function taskNode(task, scope) {
  const node = document.createElement("article");
  node.className = `task-card${task.overdue ? " overdue" : ""}${task.done ? " done" : ""}`;
  node.innerHTML = `
    <button class="check-dot" title="${task.done ? "Mark open" : "Mark done"}">${task.done ? "✓" : ""}</button>
    <div>
      <div class="task-title"></div>
      <div class="task-meta"><span class="scope-badge">${labels[scope]}</span> | ${task.done ? `Done ${task.doneAt}` : task.overdue ? `Overdue from ${task.periodKey}` : `Added ${task.createdAt}`}</div>
    </div>
    <div class="task-actions">
      ${task.overdue && !task.done ? `<button class="task-action restore-action" title="Restore to ${labels[scope]}">R</button>` : ""}
      <button class="task-action delete-action" title="Delete">&times;</button>
    </div>
  `;
  node.querySelector(".task-title").textContent = task.title;
  node.querySelector(".check-dot").addEventListener("click", () => toggleTask(task.id));
  node.querySelector(".restore-action")?.addEventListener("click", () => restoreTask(task.id));
  node.querySelector(".delete-action").addEventListener("click", () => deleteTask(task.id));
  return node;
}

function renderList(selector, list, emptyText) {
  const target = document.querySelector(selector);
  target.textContent = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    target.append(empty);
    return;
  }
  list.forEach(({ task, scope }) => target.append(taskNode(task, scope)));
}

function entriesForScope(scope) {
  return (tasks[scope] || []).map((task) => ({ task, scope }));
}

function entriesAcrossTerms() {
  return scopes.flatMap((scope) => entriesForScope(scope));
}

function counts(view) {
  if (scopes.includes(view)) return entriesForScope(view).filter(({ task }) => !task.done && !task.overdue).length;
  if (view === "overdue") return entriesAcrossTerms().filter(({ task }) => !task.done && task.overdue).length;
  return entriesAcrossTerms().filter(({ task }) => task.done).length;
}

function currentEntries() {
  if (scopes.includes(activeView)) {
    return entriesForScope(activeView).filter(({ task }) => !task.done && !task.overdue);
  }
  if (activeView === "overdue") {
    return entriesAcrossTerms().filter(({ task }) => !task.done && task.overdue);
  }
  return entriesAcrossTerms().filter(({ task }) => task.done);
}

function renderTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    const view = tab.dataset.view;
    tab.classList.toggle("active", view === activeView);
    tab.textContent = `${labels[view]} ${counts(view)}`;
  });
}

function render() {
  if (!views.includes(activeView)) activeView = "day";
  refreshPeriodStatus();
  renderTabs();

  const entries = currentEntries();
  document.querySelector("#primary-title").textContent = labels[activeView];
  document.querySelector("#remaining-count").textContent = String(entries.length);
  document.querySelector(".task-grid").classList.add("single-view");
  renderList("#remaining-list", entries, `No ${labels[activeView].toLowerCase()} tasks.`);

  const totalOverdue = counts("overdue");
  const totalDone = counts("done");
  setStatus(`${labels[activeView]} ${entries.length} | overdue ${totalOverdue} | done ${totalDone}${todoDataPath ? " | synced" : ""}`);
}

async function refreshFromDisk() {
  if (isSaving) return;
  const previous = JSON.stringify(tasks);
  await loadTasks();
  refreshPeriodStatus();
  if (JSON.stringify(tasks) !== previous) render();
}

async function init() {
  await loadTasks({ migrateLocal: true });
  refreshPeriodStatus();
  await save();
  render();
}

init();
setInterval(render, 60 * 1000);
setInterval(refreshFromDisk, 15 * 1000);
