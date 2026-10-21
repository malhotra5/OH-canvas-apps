// task-manager — Canvas Extension entrypoint
// Single page with internal view switching (Tasks / Reviews / PRs / Prompts / Settings).
// Secrets are stored in Canvas agent-server (via host.agentServer.request).

const DAEMON = "http://127.0.0.1:7420";

const SECRET_NAMES = {
  linear: "LINEAR_API_KEY",
  github: "GITHUB_PERSONAL_ACCESS_TOKEN",
  posthog: "POSTHOG_API_KEY",
};

const SECRET_HEADERS = {
  linear: "X-Linear-Key",
  github: "X-GitHub-Key",
  posthog: "X-Posthog-Key",
};

// Action keys → human labels (shown on Settings action-map editor)
const ACTIONS = [
  { key: "create-ticket", label: "🎫 Create linked ticket", description: "PR with no linked issue — search for existing or create new" },
  { key: "fix-ci", label: "🔧 Fix failing CI", description: "PR with failing checks — diagnose and fix" },
  { key: "resolve-threads", label: "💬 Resolve review comments", description: "PR with unresolved review threads" },
  { key: "prompt-helper", label: "🚀 Launch prompt helper", description: "Prompts page — launches an agent to help write prompt templates" },
];

const STYLES = `
.tm-root {
  --tm-bg: var(--oh-color-base, #111);
  --tm-text: var(--oh-text-primary, #fff);
  --tm-muted: var(--oh-text-secondary, rgba(255,255,255,0.6));
  --tm-border: var(--oh-border-subtle, rgba(255,255,255,0.1));
  --tm-accent: var(--oh-accent, #4f9eff);
  --tm-card: var(--oh-color-elevated, #1a1a1a);
  --tm-danger: #f87171;
  --tm-success: #4ade80;
  --tm-warn: #fbbf24;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--tm-text);
  background: var(--tm-bg);
  font-family: var(--oh-font-sans, system-ui, sans-serif);
}
.tm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.5rem; border-bottom: 1px solid var(--tm-border); flex-shrink: 0;
}
.tm-title { font-size: 1.1rem; font-weight: 600; }
.tm-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.tm-tab {
  padding: 0.4rem 0.8rem; font-size: 0.8rem; border: none; border-radius: 6px;
  background: transparent; color: var(--tm-muted); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tm-tab:hover { color: var(--tm-text); background: rgba(255,255,255,0.05); }
.tm-tab.active { color: var(--tm-accent); background: rgba(79,158,255,0.12); }
.tm-refresh-btn { padding: 0.3rem 0.7rem; font-size: 0.72rem; }
.tm-view { flex: 1; overflow-y: auto; padding: 1.5rem; }

.tm-card { border: 1px solid var(--tm-border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; background: var(--tm-card); }
.tm-card-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; }

/* Linear relations */
.tm-item-sub { margin-left: 1.5rem; border-left: 2px solid var(--tm-border); }
.badge-sub { color: #b8860b; border-color: #b8860b; }
.badge-inprogress { color: #4caf50; border-color: #4caf50; }
.badge-state-in-progress { color: var(--tm-warn); border-color: var(--tm-warn); }
.badge-state-under-review { color: var(--tm-success); border-color: var(--tm-success); }
.badge-no-issue { color: #f85149; border-color: #f85149; }
.badge-unresolved { color: var(--tm-danger); border-color: var(--tm-danger); }
.badge-resolved { color: var(--tm-success); border-color: var(--tm-success); }

/* PR action buttons + prompt editing */
.tm-btn-sm { padding: 0.25rem 0.6rem; font-size: 0.7rem; }
.tm-prompt-edit {
  width: 100%; margin-top: 0.4rem; padding: 0.5rem; font-size: 0.72rem; font-family: inherit;
  background: var(--tm-card); color: var(--tm-text); border: 1px solid var(--tm-border);
  border-radius: 6px; resize: vertical; box-sizing: border-box;
}
.tm-prompt-field {
  padding: 0.35rem 0.5rem; font-size: 0.72rem; font-family: inherit; flex: 1; min-width: 8rem;
  background: var(--tm-card); color: var(--tm-text); border: 1px solid var(--tm-border);
  border-radius: 6px; box-sizing: border-box;
}
.tm-del-btn { padding: 0.1rem 0.4rem; font-size: 0.72rem; border-radius: 6px; }
.tm-del-btn:hover { color: var(--tm-danger); border-color: var(--tm-danger); }
.tm-badge.tmpl-id { font-size: 0.62rem; color: var(--tm-muted); border-color: var(--tm-border); opacity: 0.7; }
.tm-action-map-row {
  display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0;
  border-bottom: 1px solid var(--tm-border); font-size: 0.8rem;
}
.tm-action-map-row .action-label { font-weight: 500; flex: 1; }
.tm-action-map-row .action-desc { font-size: 0.68rem; color: var(--tm-muted); }
.tm-action-map-select {
  padding: 0.3rem 0.5rem; font-size: 0.72rem; background: var(--tm-card); color: var(--tm-text);
  border: 1px solid var(--tm-border); border-radius: 6px; font-family: inherit; min-width: 14rem;
}
.tm-actions-row { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; align-items: center; }
.tm-action-btn {
  padding: 0.25rem 0.7rem; font-size: 0.72rem; font-weight: 500; border: 1px solid var(--tm-border);
  border-radius: 12px; background: transparent; color: var(--tm-muted); cursor: pointer; transition: all 0.15s;
}
.tm-action-btn:hover { color: var(--tm-text); border-color: var(--tm-accent); }
.tm-action-btn:disabled { opacity: 0.4; cursor: default; }
.tm-action-msg { font-size: 0.7rem; color: var(--tm-muted); }
.tm-action-msg.ok { color: var(--tm-success); }
.tm-action-msg.err { color: var(--tm-danger); }
.tm-tracker-choice {
  display: flex; gap: 0.5rem; align-items: center; margin-top: 0.4rem;
  font-size: 0.72rem; color: var(--tm-muted);
}
.tm-tracker-choice button {
  padding: 0.2rem 0.6rem; font-size: 0.7rem; border: 1px solid var(--tm-border);
  border-radius: 12px; background: transparent; color: var(--tm-muted); cursor: pointer;
}
.tm-tracker-choice button:hover { color: var(--tm-accent); border-color: var(--tm-accent); }

/* Filter chips */
.tm-filter-chips { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.tm-chip {
  padding: 0.25rem 0.75rem; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--tm-border); background: transparent; color: var(--tm-muted);
  font-size: 0.75rem; transition: background 0.15s, color 0.15s;
}
.tm-chip:hover { color: var(--tm-text); background: rgba(255,255,255,0.05); }
.tm-chip.active { color: var(--tm-accent); border-color: var(--tm-accent); background: rgba(79,158,255,0.12); }

/* PR → issue links */
.tm-item-issue-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.tm-issue-link {
  font-size: 0.75rem; color: var(--tm-accent); text-decoration: none;
  padding: 0.1rem 0.5rem; border: 1px solid var(--tm-border); border-radius: 4px;
}
.tm-issue-link:hover { border-color: var(--tm-accent); text-decoration: underline; }
.tm-issue-link.closes { color: #4caf50; border-color: rgba(76,175,80,0.4); }
.tm-item-parent { font-size: 0.75rem; color: var(--tm-muted); margin-top: 0.25rem; }
.tm-item-parent a { color: var(--tm-accent); text-decoration: none; }
.tm-item-parent a:hover { text-decoration: underline; }
.tm-item-subs { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-size: 0.75rem; margin-top: 0.25rem; }
.tm-item-subs-label { color: var(--tm-muted); }
.tm-item-subs a { color: var(--tm-accent); text-decoration: none; padding: 0.1rem 0.4rem; border: 1px solid var(--tm-border); border-radius: 4px; }
.tm-item-subs a:hover { border-color: var(--tm-accent); text-decoration: underline; }
.tm-item-gh-links { margin-top: 0.25rem; }
.tm-item-gh-links a { display: inline-block; font-size: 0.75rem; color: #8b949e; text-decoration: none; margin-right: 0.75rem; }
.tm-item-gh-links a:hover { color: var(--tm-accent); text-decoration: underline; }

.tm-item {
  display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem 1rem;
  border: 1px solid var(--tm-border); border-radius: 8px; margin-bottom: 0.5rem;
  background: var(--tm-card); transition: border-color 0.15s;
}
.tm-item:hover { border-color: var(--tm-accent); }
.tm-item-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 0.4rem; flex-shrink: 0; }
.tm-item-body { flex: 1; min-width: 0; }
.tm-item-title { font-size: 0.85rem; font-weight: 500; margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-item-title a { color: var(--tm-accent); text-decoration: none; }
.tm-item-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: 0.7rem; color: var(--tm-muted); }

.tm-badge { display: inline-block; padding: 0.1rem 0.4rem; font-size: 0.65rem; border-radius: 4px; background: rgba(255,255,255,0.08); color: var(--tm-muted); }
.tm-badge.source-linear { background: rgba(94,106,210,0.2); color: #a5b4fc; }
.tm-badge.source-github-issue { background: rgba(255,255,255,0.08); color: #d1d5db; }
.tm-badge.source-github-review { background: rgba(34,197,94,0.2); color: #4ade80; }
.tm-badge.source-github-pr { background: rgba(79,158,255,0.2); color: var(--tm-accent); }
.tm-badge.ci-success { background: rgba(74,222,128,0.15); color: var(--tm-success); }
.tm-badge.ci-failure { background: rgba(248,113,113,0.15); color: var(--tm-danger); }
.tm-badge.ci-pending { background: rgba(251,191,36,0.15); color: var(--tm-warn); }
.tm-badge.review-approved { background: rgba(74,222,128,0.15); color: var(--tm-success); }
.tm-badge.review-changes_requested { background: rgba(248,113,113,0.15); color: var(--tm-danger); }
.tm-badge.review-re-requested { background: rgba(251,191,36,0.15); color: var(--tm-warn); }
.tm-badge.review-reviewed { background: rgba(79,158,255,0.15); color: var(--tm-accent); }
.tm-badge.review-no_reviews { background: rgba(255,255,255,0.08); color: var(--tm-muted); }
.tm-badge.draft { background: rgba(255,255,255,0.08); color: var(--tm-muted); }

.tm-field { margin-bottom: 1rem; }
.tm-label { display: block; font-size: 0.75rem; font-weight: 500; margin-bottom: 0.3rem; color: var(--tm-muted); }
.tm-input { width: 100%; padding: 0.5rem 0.7rem; font-size: 0.8rem; font-family: monospace; border: 1px solid var(--tm-border); border-radius: 6px; background: var(--tm-bg); color: var(--tm-text); outline: none; box-sizing: border-box; }
.tm-input:focus { border-color: var(--tm-accent); }
.tm-btn { padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 500; border: none; border-radius: 6px; background: var(--tm-accent); color: #fff; cursor: pointer; transition: opacity 0.15s; }
.tm-btn:hover { opacity: 0.85; }
.tm-btn:disabled { opacity: 0.4; cursor: default; }
.tm-btn-secondary { background: transparent; border: 1px solid var(--tm-border); color: var(--tm-muted); }
.tm-btn-secondary:hover { color: var(--tm-text); border-color: var(--tm-muted); }

.tm-key-status { display: flex; align-items: center; gap: 0.4rem; font-size: 0.7rem; margin-top: 0.3rem; }
.tm-key-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tm-key-dot.on { background: var(--tm-success); }
.tm-key-dot.off { background: var(--tm-muted); }
.tm-key-masked { color: var(--tm-muted); font-family: monospace; }

.tm-msg { padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.75rem; margin-bottom: 1rem; }
.tm-msg.ok { background: rgba(74,222,128,0.1); color: var(--tm-success); border: 1px solid rgba(74,222,128,0.2); }
.tm-msg.err { background: rgba(248,113,113,0.1); color: var(--tm-danger); border: 1px solid rgba(248,113,113,0.2); }
.tm-msg.info { background: rgba(79,158,255,0.1); color: var(--tm-accent); border: 1px solid rgba(79,158,255,0.2); }
.tm-empty { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
.tm-loading { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
.tm-priority-0 { background: var(--tm-danger); }
.tm-priority-1 { background: var(--tm-warn); }
.tm-priority-2 { background: var(--tm-accent); }
.tm-priority-3 { background: var(--tm-muted); }
.tm-priority-4 { background: rgba(255,255,255,0.15); }

/* State-colored dots: gray=not started, yellow=in progress, green=under review */
.tm-state-not-started { background: var(--tm-muted); }
.tm-state-in-progress { background: var(--tm-warn); }
.tm-state-under-review { background: var(--tm-success); }
`;

const VIEWS = [
  { id: "tasks", label: "Tasks" },
  { id: "reviews", label: "Reviews" },
  { id: "prs", label: "PRs" },
  { id: "prompts", label: "Prompts" },
  { id: "settings", label: "Settings" },
];

// ── Canvas API ──────────────────────────────────────────────────────────

async function canvasListSecrets(host) {
  const raw = await host.agentServer.request({ path: "/api/settings/secrets" });
  return raw?.secrets || [];
}

async function canvasGetSecret(host, name) {
  try {
    const raw = await host.agentServer.request({ path: `/api/settings/secrets/${encodeURIComponent(name)}` });
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && raw.value) return raw.value;
    return String(raw || "");
  } catch { return null; }
}

async function canvasSetSecret(host, name, value) {
  await host.agentServer.request({
    method: "PUT", path: "/api/settings/secrets",
    headers: { "Content-Type": "application/json" },
    body: { name, value },
  });
}

async function readSecrets(host) {
  const result = { linear: null, github: null, posthog: null };
  for (const [provider, secretName] of Object.entries(SECRET_NAMES)) {
    result[provider] = await canvasGetSecret(host, secretName);
  }
  return result;
}

// ── Daemon API ──────────────────────────────────────────────────────────

async function daemonFetch(path, opts = {}) {
  const resp = await fetch(`${DAEMON}${path}`, { headers: { "Content-Type": "application/json", ...opts.headers }, ...opts });
  if (!resp.ok) { const text = await resp.text().catch(() => ""); throw new Error(`${resp.status}: ${text || resp.statusText}`); }
  return resp.json();
}

// Client-side cache: reuse a fetch made within the last 60s unless forced.
// (The daemon separately caches provider results for 5 minutes.)
const taskCache = { data: null, fetchedAt: 0 };
const TASK_CACHE_MS = 60_000;

async function fetchTasks(host, { refresh = false } = {}) {
  if (!refresh && taskCache.data && Date.now() - taskCache.fetchedAt < TASK_CACHE_MS) {
    return taskCache.data;
  }
  const secrets = await readSecrets(host);
  const headers = {};
  for (const [provider, val] of Object.entries(secrets)) {
    if (val) headers[SECRET_HEADERS[provider]] = val;
  }
  const data = await daemonFetch(`/tasks?refresh=${refresh ? "true" : "false"}`, { headers });
  taskCache.data = data;
  taskCache.fetchedAt = Date.now();
  return data;
}

/** Create a Canvas conversation via host.agentServer */
async function createConversation(host, message, title) {
  const body = {
    workspace: { kind: "LocalWorkspace", working_dir: "workspace/feedback" },
    worktree: false,
    secrets_encrypted: true,
    initial_message: { role: "user", content: [{ type: "text", text: message }], run: true },
    max_iterations: 500,
    autotitle: !title,
    tags: { source: "task-manager-prompts" },
  };
  // host.agentServer.request serializes the body itself — pass objects, not pre-stringified JSON
  const created = await host.agentServer.request({
    method: "POST", path: "/api/conversations",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const convId = created.id || created.app_conversation_id;
  if (title && convId) {
    try {
      await host.agentServer.request({
        method: "PATCH", path: `/api/conversations/${convId}`,
        headers: { "Content-Type": "application/json" },
        body: { title },
      });
    } catch {}
  }
  return { id: convId, url: `/conversations/${convId}` };
}

/**
 * Render a prompt template ({{var}} substitution) + dispatch an agent conversation for an item.
 * Loads the active prompt set + action map from the daemon, resolves the action's
 * assigned template id, renders it with the item's fields, and creates a conversation.
 */
async function dispatchPromptForItem(host, item, actionKey, { extraVars = {}, title = "", tracker = null } = {}) {
  const data = await daemonFetch("/prompts");
  const activeSet = (data.sets || []).find((s) => s.id === data.active_set_id) || (data.sets || [])[0];
  const actionMap = data.action_map || {};
  const templateId = actionMap[actionKey] || actionKey;
  const tmpl = (activeSet?.templates || []).find((t) => t.id === templateId);
  if (!tmpl) throw new Error(`No template assigned to action "${actionKey}" (looked for id "${templateId}" in set "${activeSet?.name}"). Set it in Settings.`);

  // Variables available to templates
  const vars = {
    title: item.title || "",
    url: item.url || "",
    repo: item.repo || "",
    identifier: item.identifier || "",
    body: item.body || "",
    source: item.source,
    state: item.state || "",
    ...extraVars,
  };
  if (tracker) vars.tracker = tracker;

  // Render {{var}} placeholders
  let rendered = tmpl.body;
  for (const [k, v] of Object.entries(vars)) {
    rendered = rendered.split(`{{${k}}}`).join(String(v));
  }

  return createConversation(host, rendered, title);
}

// ── Shared render helpers ───────────────────────────────────────────────

function loadingEl(text) { const el = document.createElement("div"); el.className = "tm-loading"; el.textContent = text; return el; }
function emptyEl(text) { const el = document.createElement("div"); el.className = "tm-empty"; el.textContent = text; return el; }
function msgEl(kind, text) { const el = document.createElement("div"); el.className = `tm-msg ${kind}`; el.textContent = text; return el; }
function errorEl(title, detail) { const el = document.createElement("div"); el.className = "tm-msg err"; el.textContent = `${title} — ${detail}`; return el; }

function itemLink(item) {
  const link = document.createElement("a");
  link.href = item.url; link.target = "_blank"; link.rel = "noopener";
  link.textContent = item.title;
  return link;
}

function badge(text, className) {
  const b = document.createElement("span");
  b.className = `tm-badge ${className}`;
  b.textContent = text;
  return b;
}

function sectionHeader(count, label) {
  const h = document.createElement("div");
  h.style.cssText = "display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.75rem;";
  h.innerHTML = `<span style="font-size:0.85rem;font-weight:600;">${count} ${label}</span>`;
  return h;
}

// ── Tasks view (issues + linear, no reviews/prs) ────────────────────────

// ISO date strings compare lexicographically, so descending is just b.localeCompare(a)
const dateDesc = (a, b) => (b?.created_at || b?.updated_at || "").localeCompare(a?.created_at || a?.updated_at || "");

// In-progress classification: Linear 'started' state type, or any non-closed GitHub issue label heuristics
const IN_PROGRESS_STATES = ["started", "in progress", "in-progress", "under review"];
function isInProgress(item) {
  if (item.source === "linear") return item.state_type === "started";
  const st = (item.state || "").toLowerCase();
  return IN_PROGRESS_STATES.some((s) => st.includes(s));
}

// Task state classification for dot coloring + filters:
//   not-started (gray) | in-progress (yellow) | under-review (green)
function taskState(item) {
  if (item.source === "linear") {
    if (isUnderReview(item)) return "under-review";
    return item.state_type === "started" ? "in-progress" : "not-started";
  }
  const st = (item.state || "").toLowerCase();
  if (st.includes("under review") || st.includes("in review")) return "under-review";
  if (IN_PROGRESS_STATES.some((s) => st.includes(s))) return "in-progress";
  return "not-started";
}

function isUnderReview(item) {
  const st = (item.state || "").toLowerCase();
  return st.includes("under review") || st.includes("in review");
}

// Filter chip state for the tasks view ("all" | "in-progress" | "not-started")
let taskFilter = "all";

function filterChips(counts) {
  const wrap = document.createElement("div");
  wrap.className = "tm-filter-chips";
  const chips = [
    { id: "all", label: `All (${counts.all})` },
    { id: "in-progress", label: `In progress (${counts.inProgress})` },
    { id: "not-started", label: `Not started (${counts.notStarted})` },
  ];
  for (const c of chips) {
    const btn = document.createElement("button");
    btn.className = "tm-chip" + (taskFilter === c.id ? " active" : "");
    btn.textContent = c.label;
    btn.addEventListener("click", () => { taskFilter = c.id; renderTasks.lastView?.(); });
    wrap.append(btn);
  }
  return wrap;
}

async function renderTasks(view, host) {
  renderTasks.lastView = () => renderTasks(view, host);
  view.replaceChildren(loadingEl("Fetching tasks…"));
  let data;
  try { data = await fetchTasks(host); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach the task daemon. Is it running on port 7420?", e.message)); return; }

  const { items = [], errors, message } = data;
  if (message) { view.replaceChildren(msgEl("info", message), emptyEl("Configure your API keys in the Settings tab to see tasks.")); return; }

  const frag = document.createDocumentFragment();
  if (errors?.length) frag.append(msgEl("err", errors.map((e) => `${e.source}: ${e.error}`).join("; ")));

  // Only show issues and linear items (not reviews or PRs)
  const issues = items.filter((i) => i.source === "linear" || i.source === "github-issue");

  const counts = {
    all: issues.length,
    inProgress: issues.filter((i) => taskState(i) !== "not-started").length,
    notStarted: issues.filter((i) => taskState(i) === "not-started").length,
  };
  frag.append(filterChips(counts));

  // Apply state filter, then sort: priority asc, most recently opened first
  const filtered = issues
    .filter((i) => taskFilter === "all" || (taskFilter === "in-progress") === (taskState(i) !== "not-started"))
    .sort((a, b) => a.priority - b.priority || dateDesc(a, b));

  if (filtered.length === 0) {
    frag.append(emptyEl("No assigned issues found."));
  } else {
    frag.append(sectionHeader(filtered.length, "assigned issues"));
    for (const item of filtered) frag.append(taskRow(item));
  }
  view.replaceChildren(frag);
}

function taskRow(item) {
  const row = document.createElement("div");
  row.className = "tm-item" + (item.is_subticket ? " tm-item-sub" : "");
  const dot = document.createElement("div");
  // State-colored dot: gray=not started, yellow=in progress, green=under review
  dot.className = `tm-item-dot tm-state-${taskState(item)}`;
  dot.title = item.state || taskState(item);
  const body = document.createElement("div");
  body.className = "tm-item-body";
  const title = document.createElement("div");
  title.className = "tm-item-title";
  title.append(itemLink(item));
  const meta = document.createElement("div");
  meta.className = "tm-item-meta";
  if (item.is_subticket) meta.append(badge("sub-issue", "badge-sub"));
  const st = taskState(item);
  if (st !== "not-started") meta.append(badge(st.replace("-", " "), `badge-state-${st}`));
  meta.append(badge(item.source.replace("github-", "gh-"), `source-${item.source}`));
  if (item.identifier) meta.append(badge(item.identifier, ""));
  if (item.state) { const s = document.createElement("span"); s.textContent = `· ${item.state}`; meta.append(s); }
  if (item.repo) { const s = document.createElement("span"); s.textContent = item.repo; meta.append(s); }
  if (item.team) { const s = document.createElement("span"); s.textContent = `· ${item.team}`; meta.append(s); }
  body.append(title, meta);

  // Parent context for sub-tickets
  if (item.is_subticket && item.parent) {
    const parentEl = document.createElement("div");
    parentEl.className = "tm-item-parent";
    parentEl.append("↳ part of ");
    const a = document.createElement("a");
    a.href = item.parent.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${item.parent.identifier}: ${item.parent.title}`;
    parentEl.append(a);
    body.append(parentEl);
  }

  // Child sub-tickets listed under the parent
  if (item.subtickets?.length) {
    const subsEl = document.createElement("div");
    subsEl.className = "tm-item-subs";
    const label = document.createElement("span");
    label.className = "tm-item-subs-label";
    label.textContent = `Sub-issues (${item.subtickets.length}):`;
    subsEl.append(label);
    for (const sub of item.subtickets) {
      const a = document.createElement("a");
      a.href = sub.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = sub.identifier;
      a.title = sub.title;
      subsEl.append(a);
    }
    body.append(subsEl);
  }

  // GitHub cross-links from Linear attachments
  if (item.github_links?.length) {
    const ghEl = document.createElement("div");
    ghEl.className = "tm-item-gh-links";
    for (const link of item.github_links) {
      const a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = `⚙ ${link.title}`;
      a.title = link.url;
      ghEl.append(a);
    }
    body.append(ghEl);
  }

  row.append(dot, body);
  return row;
}

// ── Reviews view ────────────────────────────────────────────────────────

async function renderReviews(view, host) {
  view.replaceChildren(loadingEl("Fetching reviews…"));
  let data;
  try { data = await fetchTasks(host); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach the task daemon.", e.message)); return; }

  const { items = [], errors, message } = data;
  if (message) { view.replaceChildren(msgEl("info", message), emptyEl("Configure your API keys in Settings.")); return; }

  const frag = document.createDocumentFragment();
  if (errors?.length) frag.append(msgEl("err", errors.map((e) => `${e.source}: ${e.error}`).join("; ")));

  const reviews = items
    .filter((i) => i.source === "github-review")
    .sort(dateDesc); // most recently requested first
  if (reviews.length === 0) {
    frag.append(emptyEl("No pending reviews."));
  } else {
    frag.append(sectionHeader(reviews.length, "pending reviews"));
    for (const item of reviews) frag.append(reviewRow(item));
  }
  view.replaceChildren(frag);
}

function reviewRow(item) {
  const row = document.createElement("div");
  row.className = "tm-item";
  const dot = document.createElement("div");
  dot.className = "tm-item-dot tm-priority-2";
  const body = document.createElement("div");
  body.className = "tm-item-body";
  const title = document.createElement("div");
  title.className = "tm-item-title";
  title.append(itemLink(item));
  const meta = document.createElement("div");
  meta.className = "tm-item-meta";
  meta.append(badge("review", "source-github-review"));
  if (item.identifier) meta.append(badge(item.identifier, ""));
  if (item.repo) { const s = document.createElement("span"); s.textContent = item.repo; meta.append(s); }
  body.append(title, meta);
  row.append(dot, body);
  return row;
}

// ── PRs view ────────────────────────────────────────────────────────────

async function renderPRs(view, host) {
  view.replaceChildren(loadingEl("Fetching PRs…"));
  let data;
  try { data = await fetchTasks(host); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach the task daemon.", e.message)); return; }

  const { items = [], errors, message } = data;
  if (message) { view.replaceChildren(msgEl("info", message), emptyEl("Configure your API keys in Settings.")); return; }

  const frag = document.createDocumentFragment();
  if (errors?.length) frag.append(msgEl("err", errors.map((e) => `${e.source}: ${e.error}`).join("; ")));

  const prs = items
    .filter((i) => i.source === "github-pr")
    .sort(dateDesc); // most recently opened first
  if (prs.length === 0) {
    frag.append(emptyEl("No open PRs."));
  } else {
    frag.append(sectionHeader(prs.length, "open PRs"));
    for (const item of prs) frag.append(prRow(item, host));
  }
  view.replaceChildren(frag);
}

function prRow(item, host) {
  const row = document.createElement("div");
  row.className = "tm-item";
  const dot = document.createElement("div");
  // Color dot by CI status: red=failure, yellow=pending, green=success
  const ciClass = item.ci_status === "success" ? "tm-priority-1" : item.ci_status === "failure" ? "tm-priority-0" : "tm-priority-2";
  dot.className = `tm-item-dot ${ciClass}`;

  const body = document.createElement("div");
  body.className = "tm-item-body";

  const title = document.createElement("div");
  title.className = "tm-item-title";
  title.append(itemLink(item));

  const meta = document.createElement("div");
  meta.className = "tm-item-meta";
  meta.append(badge("PR", "source-github-pr"));
  if (item.identifier) meta.append(badge(`#${item.identifier}`, ""));
  if (item.repo) { const s = document.createElement("span"); s.textContent = item.repo; meta.append(s); }
  if (item.state === "draft") meta.append(badge("draft", "draft"));

  // CI badge
  const ciText = item.ci_status === "success" ? "✓ CI passing"
    : item.ci_status === "failure" ? "✗ CI failing"
    : item.ci_status === "no_checks" ? "no CI checks"
    : "⏳ CI pending";
  meta.append(badge(ciText, `ci-${item.ci_status}`));

  // Review status badge
  const rs = item.review_status;
  const rsText = {
    approved: "✓ Approved",
    changes_requested: "✗ Changes requested",
    re_requesteded: "⚠ Re-review requested",
    reviewed: "Reviewed",
    no_reviews: "No reviews yet",
  }[rs] || rs;
  meta.append(badge(rsText, `review-${rs}`));

  // Unresolved review comment threads
  if (item.unresolved_threads > 0) {
    meta.append(badge(`💬 ${item.unresolved_threads} unresolved`, "badge-unresolved"));
  } else if ((item.reviewers_completed || []).length) {
    meta.append(badge("💬 threads resolved", "badge-resolved"));
  }

  // Reviewers
  if (item.reviewers_requested?.length) {
    const s = document.createElement("span");
    s.textContent = `Requested: ${item.reviewers_requested.join(", ")}`;
    meta.append(s);
  }
  const completed = item.reviewers_completed || [];
  if (completed.length) {
    const reviewers = completed.map((r) => `${r.author} (${r.state.toLowerCase().replace("_", " ")})`).join(", ");
    const s = document.createElement("span");
    s.textContent = `Reviewed by: ${reviewers}`;
    meta.append(s);
  }

  body.append(title, meta);

  // Linked issue associations: closing keywords render as "→ closes", bare mentions as "→ references"
  const linked = item.linked_issues || [];
  if (linked.length) {
    const linksEl = document.createElement("div");
    linksEl.className = "tm-item-issue-links";
    for (const ref of linked) {
      const [repoPart, numPart] = ref.ref.includes("/") ? ref.ref.split("#") : [item.repo, ref.number];
      const link = document.createElement("a");
      link.href = `https://github.com/${repoPart}/issues/${numPart}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = ref.closes ? "tm-issue-link closes" : "tm-issue-link";
      link.textContent = `${ref.closes ? "→ closes" : "→ references"} ${ref.ref}`;
      linksEl.append(link);
    }
    body.append(linksEl);
  } else {
    // Flag PRs with no issue association
    meta.append(badge("⚠ no linked issue", "badge-no-issue"));
  }

  row.append(dot, body);

  // ── Status-driven action buttons ──────────────────────────────────
  const actions = document.createElement("div");
  actions.className = "tm-actions-row";
  const msg = document.createElement("span");
  msg.className = "tm-action-msg";
  let launched = false;

  function disableAll() {
    actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
  }

  function launch(prom, okText) {
    disableAll();
    msg.className = "tm-action-msg";
    msg.textContent = "Launching agent conversation…";
    prom.then((result) => {
      msg.className = "tm-action-msg ok";
      msg.replaceChildren(document.createTextNode(okText + " "));
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.style.cssText = "color:var(--tm-accent);";
      link.textContent = "Open →";
      msg.append(link);
      launched = true;
      // navigate to the conversation after a beat
      setTimeout(() => host.navigate(result.url), 800);
    }).catch((e) => {
      msg.className = "tm-action-msg err";
      msg.textContent = e.message;
      actions.querySelectorAll("button").forEach((b) => (b.disabled = false));
    });
  }

  // 1) No linked issue → create-ticket (with tracker choice)
  if (!linked.length) {
    const btn = document.createElement("button");
    btn.className = "tm-action-btn";
    btn.textContent = "🎫 Create ticket";
    btn.addEventListener("click", () => {
      if (launched) return;
      // Replace the button row with the tracker choice UI
      actions.replaceChildren();
      const choice = document.createElement("div");
      choice.className = "tm-tracker-choice";
      const label = document.createElement("span");
      label.textContent = "Where should the ticket go?";
      const linBtn = document.createElement("button");
      linBtn.textContent = "Linear only";
      const ghBtn = document.createElement("button");
      ghBtn.textContent = "GitHub (auto-syncs to Linear)";
      choice.append(label, linBtn, ghBtn);
      actions.append(choice, msg);
      const pick = (tracker) => {
        launch(
          dispatchPromptForItem(host, item, "create-ticket", {
            tracker,
            title: `🎫 Create ticket for ${item.repo}#${item.identifier}`,
          }),
          "Ticket agent launched.",
        );
      };
      linBtn.addEventListener("click", () => pick("linear"));
      ghBtn.addEventListener("click", () => pick("github"));
    });
    actions.append(btn);
  }

  // 2) CI failing → fix-ci
  if (item.ci_status === "failure") {
    const btn = document.createElement("button");
    btn.className = "tm-action-btn";
    btn.textContent = "🔧 Fix CI";
    btn.addEventListener("click", () => {
      if (launched) return;
      launch(
        dispatchPromptForItem(host, item, "fix-ci", {
          title: `🔧 Fix CI on ${item.repo}#${item.identifier}`,
        }),
        "CI-fix agent launched.",
      );
    });
    actions.append(btn);
  }

  // 3) Unresolved review threads → resolve-threads
  if (item.unresolved_threads > 0) {
    const btn = document.createElement("button");
    btn.className = "tm-action-btn";
    btn.textContent = `💬 Resolve ${item.unresolved_threads} thread${item.unresolved_threads > 1 ? "s" : ""}`;
    btn.addEventListener("click", () => {
      if (launched) return;
      launch(
        dispatchPromptForItem(host, item, "resolve-threads", {
          extraVars: { count_phrase: `are ${item.unresolved_threads}` },
          title: `💬 Resolve review threads on ${item.repo}#${item.identifier}`,
        }),
        "Thread-resolver agent launched.",
      );
    });
    actions.append(btn);
  }

  if (actions.childElementCount > 0) {
    actions.append(msg);
    body.append(actions);
  }

  return row;
}

// ── Settings view ───────────────────────────────────────────────────────

async function renderSettings(view, host) {
  view.replaceChildren(loadingEl("Loading…"));
  let canvasSecrets;
  try { canvasSecrets = await canvasListSecrets(host); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach Canvas agent-server.", e.message)); return; }

  const secretNames = new Set(canvasSecrets.map((s) => s.name));
  const secrets = await readSecrets(host);
  const frag = document.createDocumentFragment();

  // Status card
  const statusCard = document.createElement("div");
  statusCard.className = "tm-card";
  statusCard.append(Object.assign(document.createElement("div"), { className: "tm-card-title", textContent: "Connection status" }));

  for (const [provider, secretName] of Object.entries(SECRET_NAMES)) {
    const row = document.createElement("div");
    row.className = "tm-key-status";
    const hasKey = secretNames.has(secretName) && secrets[provider];
    const dot = document.createElement("span");
    dot.className = `tm-key-dot ${hasKey ? "on" : "off"}`;
    const label = document.createElement("span");
    label.textContent = `${provider} (${secretName})`;
    if (hasKey) {
      const val = secrets[provider];
      const masked = val.length > 8 ? val.slice(0, 4) + "…" + val.slice(-4) : "…";
      const m = document.createElement("span");
      m.className = "tm-key-masked";
      m.textContent = masked;
      row.append(dot, label, m);
    } else {
      const off = document.createElement("span");
      off.style.color = "var(--tm-muted)";
      off.textContent = "not set";
      row.append(dot, label, off);
    }
    statusCard.append(row);
  }

  const note = document.createElement("p");
  note.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0.75rem 0 0;";
  note.textContent = "Keys stored in Canvas secrets. GitHub also falls back to `gh auth token` automatically.";
  statusCard.append(note);
  frag.append(statusCard);

  // Key input card
  const formCard = document.createElement("div");
  formCard.className = "tm-card";
  formCard.append(Object.assign(document.createElement("div"), { className: "tm-card-title", textContent: "API keys" }));
  const desc = document.createElement("p");
  desc.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0 0 1rem;";
  desc.textContent = "Paste keys and click Save. They will be stored as Canvas secrets.";
  formCard.append(desc);

  const fields = [
    { provider: "linear", label: "Linear API key", placeholder: "lin_api_…" },
    { provider: "github", label: "GitHub personal access token", placeholder: "github_pat_… or ghp_…" },
    { provider: "posthog", label: "PostHog API key", placeholder: "phx_…" },
  ];
  const inputs = {};
  for (const f of fields) {
    const field = document.createElement("div");
    field.className = "tm-field";
    const label = document.createElement("label");
    label.className = "tm-label";
    label.textContent = f.label;
    const input = document.createElement("input");
    input.className = "tm-input";
    input.type = "password";
    input.placeholder = f.placeholder;
    inputs[f.provider] = input;
    field.append(label, input);
    formCard.append(field);
  }

  const msgArea = document.createElement("div");
  formCard.append(msgArea);
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:0.5rem;";
  const saveBtn = document.createElement("button");
  saveBtn.className = "tm-btn";
  saveBtn.textContent = "Save keys";
  const refreshBtn = document.createElement("button");
  refreshBtn.className = "tm-btn tm-btn-secondary";
  refreshBtn.textContent = "Refresh tasks";
  btnRow.append(saveBtn, refreshBtn);
  formCard.append(btnRow);

  // ── Action → prompt mapping card ───────────────────────────────
  let promptData = null;
  try { promptData = await daemonFetch("/prompts"); }
  catch { /* daemon may be down — skip the card */ }

  if (promptData) {
    const activeSet = (promptData.sets || []).find((s) => s.id === promptData.active_set_id) || (promptData.sets || [])[0];
    const allTemplates = activeSet?.templates || [];
    const actionMap = promptData.action_map || {};

    const mapCard = document.createElement("div");
    mapCard.className = "tm-card";
    mapCard.append(Object.assign(document.createElement("div"), {
      className: "tm-card-title",
      textContent: "Action → prompt mapping",
    }));
    const mapDesc = document.createElement("p");
    mapDesc.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0 0 0.75rem;";
    mapDesc.textContent = `Controls which prompt template is used when each PR action button is clicked. Active set: ${activeSet?.name || "none"}.`;
    mapCard.append(mapDesc);

    for (const action of ACTIONS) {
      const row = document.createElement("div");
      row.className = "tm-action-map-row";
      const left = document.createElement("div");
      left.style.cssText = "flex:1;";
      left.append(Object.assign(document.createElement("div"), { className: "action-label", textContent: action.label }));
      left.append(Object.assign(document.createElement("div"), { className: "action-desc", textContent: action.description }));
      const select = document.createElement("select");
      select.className = "tm-action-map-select";
      const currentTid = actionMap[action.key] || "";
      for (const t of allTemplates) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.title} (${t.id})`;
        if (t.id === currentTid) opt.selected = true;
        select.append(opt);
      }
      if (!currentTid || !allTemplates.some((t) => t.id === currentTid)) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "— unassigned —";
        opt.selected = true;
        select.prepend(opt);
      }
      const statusMsg = document.createElement("span");
      statusMsg.style.cssText = "font-size:0.68rem;color:var(--tm-muted);";
      select.addEventListener("change", async () => {
        statusMsg.textContent = "Saving…";
        try {
          await daemonFetch(`/prompts/action-map/${action.key}`, {
            method: "PUT",
            body: JSON.stringify({ template_id: select.value }),
          });
          statusMsg.textContent = "✓";
          setTimeout(() => { statusMsg.textContent = ""; }, 2000);
        } catch (e) {
          statusMsg.textContent = `✗ ${e.message}`;
        }
      });
      row.append(left, select, statusMsg);
      mapCard.append(row);
    }
    frag.append(mapCard);
  }

  frag.append(formCard);
  view.replaceChildren(frag);

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Saving to Canvas…"));
    try {
      const toSave = [];
      for (const [provider, input] of Object.entries(inputs)) {
        if (input.value.trim()) toSave.push({ provider, value: input.value.trim() });
      }
      if (!toSave.length) { msgArea.replaceChildren(msgEl("err", "Enter at least one key.")); saveBtn.disabled = false; return; }
      const results = [];
      for (const { provider, value } of toSave) {
        await canvasSetSecret(host, SECRET_NAMES[provider], value);
        const masked = value.length > 8 ? value.slice(0, 4) + "…" + value.slice(-4) : "…";
        results.push(`${provider}: ✓ ${masked}`);
      }
      for (const input of Object.values(inputs)) input.value = "";
      msgArea.replaceChildren(msgEl("ok", `Saved to Canvas. ${results.join(" · ")}`));
      renderSettings(view, host);
    } catch (e) { msgArea.replaceChildren(msgEl("err", e.message)); }
    saveBtn.disabled = false;
  });

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Fetching tasks…"));
    try {
      const data = await fetchTasks(host);
      const count = data.items?.length ?? 0;
      const errs = data.errors?.length ?? 0;
      if (data.message) msgArea.replaceChildren(msgEl("info", data.message));
      else if (errs > 0) msgArea.replaceChildren(msgEl("err", `${count} tasks, ${errs} error(s): ${data.errors.map((e) => e.error).join("; ")}`));
      else msgArea.replaceChildren(msgEl("ok", `${count} items fetched.`));
    } catch (e) { msgArea.replaceChildren(msgEl("err", e.message)); }
    refreshBtn.disabled = false;
  });
}

// ── Prompts view ────────────────────────────────────────────────────────

async function renderPrompts(view, host) {
  let data;
  try { data = await daemonFetch("/prompts"); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach the task daemon.", e.message)); return; }

  const frag = document.createDocumentFragment();

  // Launch helper button
  const launchCard = document.createElement("div");
  launchCard.className = "tm-card";
  const launchTitle = document.createElement("div");
  launchTitle.className = "tm-card-title";
  launchTitle.textContent = "Prompt helper";
  launchCard.append(launchTitle);

  const launchDesc = document.createElement("p");
  launchDesc.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0 0 0.75rem;";
  launchDesc.textContent = "Launch an agent conversation to help you write and refine prompt templates for your task workflows.";
  launchCard.append(launchDesc);

  const launchBtn = document.createElement("button");
  launchBtn.className = "tm-btn";
  launchBtn.textContent = "🚀 Launch prompt helper agent";
  launchCard.append(launchBtn);

  const launchMsg = document.createElement("div");
  launchCard.append(launchMsg);

  frag.append(launchCard);

  // Prompt sets
  for (const set of data.sets || []) {
    const card = document.createElement("div");
    card.className = "tm-card";
    const title = document.createElement("div");
    title.className = "tm-card-title";
    const isActive = set.id === data.active_set_id;
    title.textContent = set.name + (isActive ? " (active)" : "");
    card.append(title);

    if (set.templates?.length) {
      for (const tmpl of set.templates) {
        const row = document.createElement("div");
        row.style.cssText = "padding:0.5rem 0;border-bottom:1px solid var(--tm-border);font-size:0.8rem;";

        // Header row: title + template id badge + delete + collapse toggle
        const header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;gap:0.5rem;cursor:pointer;";
        const name = document.createElement("div");
        name.style.cssText = "font-weight:500;flex:1;";
        name.textContent = tmpl.title;
        const idBadge = badge(`id: ${tmpl.id}`, "tmpl-id");
        const delBtn = document.createElement("button");
        delBtn.className = "tm-action-btn tm-del-btn";
        delBtn.textContent = "🗑";
        delBtn.title = "Delete template";
        const caret = document.createElement("span");
        caret.style.cssText = "font-size:0.7rem;color:var(--tm-muted);";
        caret.textContent = "▸";
        header.append(caret, name, idBadge, delBtn);
        row.append(header);

        // Collapsible details
        const details = document.createElement("div");
        details.style.cssText = "display:none;flex-direction:column;gap:0.4rem;margin-top:0.4rem;";
        header.addEventListener("click", (e) => {
          if (e.target === delBtn) return;
          const open = details.style.display === "none";
          details.style.display = open ? "flex" : "none";
          caret.textContent = open ? "▾" : "▸";
        });

        // Editable title
        const editMeta = document.createElement("div");
        editMeta.style.cssText = "display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.value = tmpl.title;
        titleInput.className = "tm-prompt-field";
        titleInput.placeholder = "Template title";
        editMeta.append(titleInput);

        // Editable body
        const bodyArea = document.createElement("textarea");
        bodyArea.className = "tm-prompt-edit";
        bodyArea.value = tmpl.body;
        bodyArea.rows = Math.min(12, Math.max(4, Math.ceil(tmpl.body.length / 60)));

        // Save only (no reset)
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:0.5rem;margin-top:0.4rem;align-items:center;";
        const saveBtn = document.createElement("button");
        saveBtn.className = "tm-btn tm-btn-sm";
        saveBtn.textContent = "Save";
        const statusMsg = document.createElement("span");
        statusMsg.style.cssText = "font-size:0.7rem;color:var(--tm-muted);";
        actions.append(saveBtn, statusMsg);

        saveBtn.addEventListener("click", async () => {
          saveBtn.disabled = true;
          statusMsg.textContent = "Saving…";
          try {
            await daemonFetch(`/prompts/sets/${set.id}/templates/${tmpl.id}`, {
              method: "PUT",
              body: JSON.stringify({
                title: titleInput.value.trim() || tmpl.title,
                body: bodyArea.value,
              }),
            });
            statusMsg.textContent = "✓ Saved";
            setTimeout(() => { statusMsg.textContent = ""; }, 2500);
          } catch (e) {
            statusMsg.textContent = `✗ ${e.message}`;
          }
          saveBtn.disabled = false;
        });

        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete template "${tmpl.title}"? This cannot be undone.`)) return;
          delBtn.disabled = true;
          try {
            await daemonFetch(`/prompts/sets/${set.id}/templates/${tmpl.id}`, { method: "DELETE" });
            renderPrompts(view, host);
          } catch (err) {
            alert(`Delete failed: ${err.message}`);
            delBtn.disabled = false;
          }
        });

        details.append(editMeta, bodyArea, actions);
        row.append(details);
        card.append(row);
      }
    } else {
      card.append(emptyEl("No templates"));
    }

    // ── New template form ─────────────────────────────────────────
    const newForm = document.createElement("div");
    newForm.style.cssText = "margin-top:0.75rem;padding-top:0.75rem;border-top:1px dashed var(--tm-border);";
    const newToggle = document.createElement("button");
    newToggle.className = "tm-btn tm-btn-secondary tm-btn-sm";
    newToggle.textContent = "＋ New template";
    newForm.append(newToggle);

    const newFields = document.createElement("div");
    newFields.style.cssText = "display:none;margin-top:0.6rem;flex-direction:column;gap:0.4rem;";
    const newId = document.createElement("input");
    newId.type = "text";
    newId.placeholder = "Template ID (e.g. my-custom-prompt)";
    newId.className = "tm-prompt-field";
    const newTitle = document.createElement("input");
    newTitle.type = "text";
    newTitle.placeholder = "Template title";
    newTitle.className = "tm-prompt-field";
    const newBody = document.createElement("textarea");
    newBody.placeholder = "Prompt body — supports {{title}}, {{url}}, {{repo}}, {{identifier}}, {{body}}, {{source}}, {{state}} and custom vars";
    newBody.className = "tm-prompt-edit";
    newBody.rows = 6;
    const newActions = document.createElement("div");
    newActions.style.cssText = "display:flex;gap:0.5rem;align-items:center;";
    const newSaveBtn = document.createElement("button");
    newSaveBtn.className = "tm-btn tm-btn-sm";
    newSaveBtn.textContent = "Create template";
    const newCancelBtn = document.createElement("button");
    newCancelBtn.className = "tm-btn tm-btn-secondary tm-btn-sm";
    newCancelBtn.textContent = "Cancel";
    const newStatus = document.createElement("span");
    newStatus.style.cssText = "font-size:0.7rem;color:var(--tm-muted);";
    newActions.append(newSaveBtn, newCancelBtn, newStatus);
    newFields.append(newId, newTitle, newBody, newActions);
    newForm.append(newFields);

    newToggle.addEventListener("click", () => {
      const show = newFields.style.display === "none";
      newFields.style.display = show ? "flex" : "none";
      newToggle.textContent = show ? "－ Cancel" : "＋ New template";
      if (show) newId.focus();
    });
    newCancelBtn.addEventListener("click", () => {
      newFields.style.display = "none";
      newToggle.textContent = "＋ New template";
      newId.value = ""; newTitle.value = ""; newBody.value = ""; newStatus.textContent = "";
    });

    newSaveBtn.addEventListener("click", async () => {
      if (!newTitle.value.trim() || !newBody.value.trim()) {
        newStatus.textContent = "Title and body are required.";
        return;
      }
      if (!newId.value.trim()) {
        newStatus.textContent = "Template ID is required.";
        return;
      }
      newSaveBtn.disabled = true;
      newStatus.textContent = "Creating…";
      try {
        const created = await daemonFetch(`/prompts/sets/${set.id}/templates`, {
          method: "POST",
          body: JSON.stringify({
            title: newTitle.value.trim(),
            body: newBody.value,
          }),
        });
        // If the user specified a custom ID, rename the auto-generated one via replace_all
        const desiredId = newId.value.trim();
        if (desiredId && created.id !== desiredId) {
          const all = await daemonFetch("/prompts");
          for (const s of all.sets || []) {
            for (const t of s.templates || []) {
              if (t.id === created.id) t.id = desiredId;
            }
          }
          await daemonFetch("/prompts", { method: "PUT", body: JSON.stringify(all) });
        }
        renderPrompts(view, host);
      } catch (e) {
        newStatus.textContent = `✗ ${e.message}`;
        newSaveBtn.disabled = false;
      }
    });

    card.append(newForm);
    frag.append(card);
  }

  view.replaceChildren(frag);

  // Wire up launch button
  launchBtn.addEventListener("click", async () => {
    launchBtn.disabled = true;
    launchMsg.replaceChildren(loadingEl("Launching agent conversation…"));
    try {
      const result = await dispatchPromptForItem(host, { source: "prompt-helper" }, "prompt-helper", {
        extraVars: { sets_json: JSON.stringify(data.sets || [], null, 2) },
        title: "📝 Prompt Helper",
      });
      launchMsg.replaceChildren(msgEl("ok", `Agent conversation launched. `));
      // Add link
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.style.cssText = "color:var(--tm-accent);font-size:0.75rem;";
      link.textContent = "Open conversation →";
      launchMsg.querySelector(".tm-msg").append(link);
      // Navigate to it
      host.navigate(result.url);
    } catch (e) {
      launchMsg.replaceChildren(msgEl("err", e.message));
    }
    launchBtn.disabled = false;
  });
}

// ── Entrypoint ──────────────────────────────────────────────────────────

export function activate(host) {
  if (host.apiVersion !== "1") throw new Error("task-manager requires host API 1.");

  return host.registerPage("app", ({ container, path }) => {
    const root = document.createElement("section");
    root.className = "tm-root";

    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    root.append(styleEl);

    const header = document.createElement("div");
    header.className = "tm-header";
    const title = document.createElement("div");
    title.className = "tm-title";
    title.textContent = "Task Manager";
    const tabs = document.createElement("div");
    tabs.className = "tm-tabs";

    // Refresh button: forces a fresh provider fetch, bypassing both caches
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "tm-btn tm-btn-secondary tm-refresh-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.title = "Fetch fresh data from Linear & GitHub";

    header.append(title, tabs, refreshBtn);
    root.append(header);

    const view = document.createElement("div");
    view.className = "tm-view";
    root.append(view);
    container.append(root);

    let active = VIEWS.some((v) => v.id === path) ? path : "tasks";

    function render() {
      tabs.replaceChildren(
        ...VIEWS.map((v) => {
          const btn = document.createElement("button");
          btn.className = "tm-tab" + (v.id === active ? " active" : "");
          btn.textContent = v.label;
          btn.addEventListener("click", () => { active = v.id; render(); });
          return btn;
        }),
      );
      view.replaceChildren(loadingEl("Loading…"));
      if (active === "tasks") renderTasks(view, host);
      else if (active === "reviews") renderReviews(view, host);
      else if (active === "prs") renderPRs(view, host);
      else if (active === "prompts") renderPrompts(view, host);
      else if (active === "settings") renderSettings(view, host);
    }

    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "↻ Refreshing…";
      taskCache.data = null;
      taskCache.fetchedAt = 0;
      // Fetch with refresh=true before re-rendering so views show fresh data
      try { await fetchTasks(host, { refresh: true }); } catch { /* views show errors */ }
      refreshBtn.disabled = false;
      refreshBtn.textContent = "↻ Refresh";
      render();
    });

    render();
    return () => root.remove();
  });
}
