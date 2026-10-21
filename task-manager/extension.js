// task-manager — Canvas Extension entrypoint
// Self-contained ESM, no external imports or build step.
// Single page with internal view switching (Tasks / Prompts / Settings).

const DAEMON = "http://127.0.0.1:7420";

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
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--tm-text);
  background: var(--tm-bg);
  font-family: var(--oh-font-sans, system-ui, sans-serif);
}
.tm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--tm-border);
  flex-shrink: 0;
}
.tm-title { font-size: 1.1rem; font-weight: 600; }
.tm-tabs { display: flex; gap: 0.25rem; }
.tm-tab {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tm-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tm-tab:hover { color: var(--tm-text); background: rgba(255,255,255,0.05); }
.tm-tab.active { color: var(--tm-accent); background: rgba(79,158,255,0.12); }
.tm-view { flex: 1; overflow-y: auto; padding: 1.5rem; }

/* Cards */
.tm-card {
  border: 1px solid var(--tm-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  background: var(--tm-card);
}
.tm-card-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--tm-text);
}

/* Task list */
.tm-task {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--tm-border);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: var(--tm-card);
  transition: border-color 0.15s;
}
.tm-task:hover { border-color: var(--tm-accent); }
.tm-task-priority {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 0.4rem;
  flex-shrink: 0;
}
.tm-task-body { flex: 1; min-width: 0; }
.tm-task-title {
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-task-title a { color: var(--tm-accent); text-decoration: none; }
.tm-task-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.7rem;
  color: var(--tm-muted);
}
.tm-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  font-size: 0.65rem;
  border-radius: 4px;
  background: rgba(255,255,255,0.08);
  color: var(--tm-muted);
}
.tm-badge.source-linear { background: rgba(94,106,210,0.2); color: #a5b4fc; }
.tm-badge.source-github-issue { background: rgba(255,255,255,0.08); color: #d1d5db; }
.tm-badge.source-github-review { background: rgba(34,197,94,0.2); color: #4ade80; }
.tm-badge.source-github-pr { background: rgba(79,158,255,0.2); color: var(--tm-accent); }
.tm-badge.dispatch-running { background: rgba(251,191,36,0.2); color: #fbbf24; }
.tm-badge.dispatch-done { background: rgba(74,222,128,0.2); color: var(--tm-success); }

/* Forms */
.tm-field { margin-bottom: 1rem; }
.tm-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 0.3rem;
  color: var(--tm-muted);
}
.tm-input {
  width: 100%;
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  font-family: monospace;
  border: 1px solid var(--tm-border);
  border-radius: 6px;
  background: var(--tm-bg);
  color: var(--tm-text);
  outline: none;
  box-sizing: border-box;
}
.tm-input:focus { border-color: var(--tm-accent); }
.tm-btn {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: var(--tm-accent);
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s;
}
.tm-btn:hover { opacity: 0.85; }
.tm-btn:disabled { opacity: 0.4; cursor: default; }
.tm-btn-secondary {
  background: transparent;
  border: 1px solid var(--tm-border);
  color: var(--tm-muted);
}
.tm-btn-secondary:hover { color: var(--tm-text); border-color: var(--tm-muted); }
.tm-key-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  margin-top: 0.3rem;
}
.tm-key-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tm-key-dot.on { background: var(--tm-success); }
.tm-key-dot.off { background: var(--tm-muted); }
.tm-key-masked { color: var(--tm-muted); font-family: monospace; }

/* Status messages */
.tm-msg {
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  font-size: 0.75rem;
  margin-bottom: 1rem;
}
.tm-msg.ok { background: rgba(74,222,128,0.1); color: var(--tm-success); border: 1px solid rgba(74,222,128,0.2); }
.tm-msg.err { background: rgba(248,113,113,0.1); color: var(--tm-danger); border: 1px solid rgba(248,113,113,0.2); }
.tm-msg.info { background: rgba(79,158,255,0.1); color: var(--tm-accent); border: 1px solid rgba(79,158,255,0.2); }

.tm-empty { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
.tm-loading { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
.tm-error-list { font-size: 0.7rem; color: var(--tm-danger); margin-top: 0.5rem; }
.tm-priority-0 { background: var(--tm-danger); }
.tm-priority-1 { background: #fbbf24; }
.tm-priority-2 { background: var(--tm-accent); }
.tm-priority-3 { background: var(--tm-muted); }
.tm-priority-4 { background: rgba(255,255,255,0.15); }
`;

const VIEWS = [
  { id: "tasks", label: "Tasks" },
  { id: "prompts", label: "Prompts" },
  { id: "settings", label: "Settings" },
];

// ── API client ──────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const resp = await fetch(`${DAEMON}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json();
}

// ── Tasks view ──────────────────────────────────────────────────────────

async function renderTasks(view) {
  view.replaceChildren(loadingEl("Fetching tasks…"));

  let data;
  try {
    data = await api("/tasks");
  } catch (e) {
    view.replaceChildren(errorEl("Cannot reach the task daemon. Is it running on port 7420?", e.message));
    return;
  }

  const { items = [], errors, message } = data;

  if (message) {
    view.replaceChildren(
      msgEl("info", message),
      emptyEl("Configure your API keys in the Settings tab to see tasks."),
    );
    return;
  }

  const frag = document.createDocumentFragment();

  if (errors && errors.length) {
    frag.append(
      msgEl(
        "err",
        errors.map((e) => `${e.source}: ${e.error}`).join("; "),
      ),
    );
  }

  if (items.length === 0) {
    frag.append(emptyEl("No open tasks found. Check your keys in Settings."));
  } else {
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.75rem;";
    header.innerHTML = `<span style="font-size:0.85rem;font-weight:600;">${items.length} tasks</span><span style="font-size:0.7rem;color:var(--tm-muted);">sorted by priority</span>`;
    frag.append(header);

    for (const item of items) {
      frag.append(taskRow(item));
    }
  }

  view.replaceChildren(frag);
}

function taskRow(item) {
  const row = document.createElement("div");
  row.className = "tm-task";

  const dot = document.createElement("div");
  dot.className = `tm-task-priority tm-priority-${item.priority}`;

  const body = document.createElement("div");
  body.className = "tm-task-body";

  const title = document.createElement("div");
  title.className = "tm-task-title";
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.textContent = item.title;
  link.rel = "noopener";
  title.append(link);

  const meta = document.createElement("div");
  meta.className = "tm-task-meta";

  const srcBadge = document.createElement("span");
  srcBadge.className = `tm-badge source-${item.source}`;
  srcBadge.textContent = item.source.replace("github-", "gh-");
  meta.append(srcBadge);

  if (item.identifier) {
    const idBadge = document.createElement("span");
    idBadge.className = "tm-badge";
    idBadge.textContent = item.identifier;
    meta.append(idBadge);
  }

  if (item.repo) {
    const repoSpan = document.createElement("span");
    repoSpan.textContent = item.repo;
    meta.append(repoSpan);
  }

  if (item.team) {
    const teamSpan = document.createElement("span");
    teamSpan.textContent = `· ${item.team}`;
    meta.append(teamSpan);
  }

  if (item.dispatch) {
    const dBadge = document.createElement("span");
    dBadge.className = `tm-badge dispatch-${item.dispatch.status || "running"}`;
    dBadge.textContent = item.dispatch.status || "running";
    meta.append(dBadge);
  }

  body.append(title, meta);
  row.append(dot, body);
  return row;
}

// ── Settings view ───────────────────────────────────────────────────────

async function renderSettings(view) {
  view.replaceChildren(loadingEl("Loading…"));

  let keys;
  try {
    keys = await api("/keys");
  } catch (e) {
    view.replaceChildren(errorEl("Cannot reach the task daemon.", e.message));
    return;
  }

  const frag = document.createDocumentFragment();

  // Status card
  const statusCard = document.createElement("div");
  statusCard.className = "tm-card";
  const statusTitle = document.createElement("div");
  statusTitle.className = "tm-card-title";
  statusTitle.textContent = "Connection status";
  statusCard.append(statusTitle);

  for (const [name, info] of Object.entries(keys)) {
    const row = document.createElement("div");
    row.className = "tm-key-status";
    const dot = document.createElement("span");
    dot.className = `tm-key-dot ${info.connected ? "on" : "off"}`;
    const label = document.createElement("span");
    label.textContent = name;
    if (info.connected && info.masked) {
      const masked = document.createElement("span");
      masked.className = "tm-key-masked";
      masked.textContent = info.masked;
      row.append(dot, label, masked);
    } else {
      const off = document.createElement("span");
      off.style.color = "var(--tm-muted)";
      off.textContent = "not set";
      row.append(dot, label, off);
    }
    statusCard.append(row);
  }
  frag.append(statusCard);

  // Key input card
  const formCard = document.createElement("div");
  formCard.className = "tm-card";
  const formTitle = document.createElement("div");
  formTitle.className = "tm-card-title";
  formTitle.textContent = "API keys";
  formCard.append(formTitle);

  const desc = document.createElement("p");
  desc.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0 0 1rem;";
  desc.textContent = "Paste keys below and click Save. Keys are stored locally in ~/.openhands/task-manager/keys.json (0600).";
  formCard.append(desc);

  const fields = [
    { name: "linear", label: "Linear API key", placeholder: "lin_api_…" },
    { name: "github", label: "GitHub personal access token", placeholder: "github_pat_… or ghp_…" },
    { name: "posthog", label: "PostHog API key", placeholder: "phx_…" },
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
    inputs[f.name] = input;
    field.append(label, input);
    formCard.append(field);
  }

  // Message area
  const msgArea = document.createElement("div");
  formCard.append(msgArea);

  // Buttons
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

  frag.append(formCard);
  view.replaceChildren(frag);

  // Wire up save
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Saving…"));
    try {
      const payload = {};
      for (const [name, input] of Object.entries(inputs)) {
        if (input.value.trim()) payload[name] = input.value.trim();
      }
      if (Object.keys(payload).length === 0) {
        msgArea.replaceChildren(msgEl("err", "Enter at least one key."));
        saveBtn.disabled = false;
        return;
      }
      const result = await api("/keys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Clear inputs
      for (const input of Object.values(inputs)) input.value = "";
      // Show success + updated status
      const lines = Object.entries(result)
        .map(([k, v]) => `${k}: ${v.connected ? "✓ " + v.masked : "✗ not set"}`)
        .join(" · ");
      msgArea.replaceChildren(msgEl("ok", `Keys saved. ${lines}`));
    } catch (e) {
      msgArea.replaceChildren(msgEl("err", e.message));
    }
    saveBtn.disabled = false;
  });

  // Wire up refresh
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Fetching tasks…"));
    try {
      const data = await api("/tasks");
      const count = data.items?.length ?? 0;
      const errs = data.errors?.length ?? 0;
      if (data.message) {
        msgArea.replaceChildren(msgEl("info", data.message));
      } else if (errs > 0) {
        msgArea.replaceChildren(
          msgEl("err", `${count} tasks found, but ${errs} provider error(s): ${data.errors.map((e) => e.error).join("; ")}`),
        );
      } else {
        msgArea.replaceChildren(msgEl("ok", `${count} tasks fetched successfully.`));
      }
    } catch (e) {
      msgArea.replaceChildren(msgEl("err", e.message));
    }
    refreshBtn.disabled = false;
  });
}

// ── Prompts view (placeholder) ──────────────────────────────────────────

async function renderPrompts(view) {
  let data;
  try {
    data = await api("/prompts");
  } catch (e) {
    view.replaceChildren(errorEl("Cannot reach the task daemon.", e.message));
    return;
  }

  const frag = document.createDocumentFragment();

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
        const name = document.createElement("div");
        name.style.fontWeight = "500";
        name.textContent = tmpl.title;
        const applies = document.createElement("div");
        applies.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin-top:0.2rem;";
        applies.textContent = `applies to: ${(tmpl.applies_to || []).join(", ") || "all"}`;
        const body = document.createElement("pre");
        body.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin-top:0.3rem;white-space:pre-wrap;";
        body.textContent = tmpl.body;
        row.append(name, applies, body);
        card.append(row);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "tm-empty";
      empty.textContent = "No templates";
      card.append(empty);
    }
    frag.append(card);
  }

  view.replaceChildren(frag);
}

// ── Shared helpers ──────────────────────────────────────────────────────

function loadingEl(text) {
  const el = document.createElement("div");
  el.className = "tm-loading";
  el.textContent = text;
  return el;
}

function emptyEl(text) {
  const el = document.createElement("div");
  el.className = "tm-empty";
  el.textContent = text;
  return el;
}

function msgEl(kind, text) {
  const el = document.createElement("div");
  el.className = `tm-msg ${kind}`;
  el.textContent = text;
  return el;
}

function errorEl(title, detail) {
  const el = document.createElement("div");
  el.className = "tm-msg err";
  el.textContent = `${title} — ${detail}`;
  return el;
}

// ── Entrypoint ──────────────────────────────────────────────────────────

export function activate(host) {
  if (host.apiVersion !== "1") {
    throw new Error("task-manager requires host API 1.");
  }

  return host.registerPage("app", ({ container, path }) => {
    const root = document.createElement("section");
    root.className = "tm-root";

    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    root.append(styleEl);

    // Header with tabs
    const header = document.createElement("div");
    header.className = "tm-header";
    const title = document.createElement("div");
    title.className = "tm-title";
    title.textContent = "Task Manager";
    const tabs = document.createElement("div");
    tabs.className = "tm-tabs";
    header.append(title, tabs);
    root.append(header);

    // View container
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
          btn.addEventListener("click", () => {
            active = v.id;
            render();
          });
          return btn;
        }),
      );

      view.replaceChildren(loadingEl("Loading…"));
      if (active === "tasks") renderTasks(view);
      else if (active === "settings") renderSettings(view);
      else if (active === "prompts") renderPrompts(view);
    }

    render();

    return () => root.remove();
  });
}
