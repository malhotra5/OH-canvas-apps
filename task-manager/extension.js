// task-manager — Canvas Extension entrypoint
// Self-contained ESM, no external imports or build step.
// Single page with internal view switching (Tasks / Prompts / Settings).
// Secrets are stored in Canvas agent-server (via host.agentServer.request).

const DAEMON = "http://127.0.0.1:7420";

// Canvas secret names for each provider
const SECRET_NAMES = {
  linear: "LINEAR_API_KEY",
  github: "GITHUB_PERSONAL_ACCESS_TOKEN",
  posthog: "POSTHOG_API_KEY",
};

// Header names the daemon expects
const SECRET_HEADERS = {
  linear: "X-Linear-Key",
  github: "X-GitHub-Key",
  posthog: "X-Posthog-Key",
};

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
  width: 8px; height: 8px; border-radius: 50%;
  margin-top: 0.4rem; flex-shrink: 0;
}
.tm-task-body { flex: 1; min-width: 0; }
.tm-task-title {
  font-size: 0.85rem; font-weight: 500; margin-bottom: 0.25rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tm-task-title a { color: var(--tm-accent); text-decoration: none; }
.tm-task-meta {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  font-size: 0.7rem; color: var(--tm-muted);
}
.tm-badge {
  display: inline-block; padding: 0.1rem 0.4rem;
  font-size: 0.65rem; border-radius: 4px;
  background: rgba(255,255,255,0.08); color: var(--tm-muted);
}
.tm-badge.source-linear { background: rgba(94,106,210,0.2); color: #a5b4fc; }
.tm-badge.source-github-issue { background: rgba(255,255,255,0.08); color: #d1d5db; }
.tm-badge.source-github-review { background: rgba(34,197,94,0.2); color: #4ade80; }
.tm-badge.source-github-pr { background: rgba(79,158,255,0.2); color: var(--tm-accent); }
.tm-badge.dispatch-running { background: rgba(251,191,36,0.2); color: #fbbf24; }
.tm-badge.dispatch-done { background: rgba(74,222,128,0.2); color: var(--tm-success); }

.tm-field { margin-bottom: 1rem; }
.tm-label {
  display: block; font-size: 0.75rem; font-weight: 500;
  margin-bottom: 0.3rem; color: var(--tm-muted);
}
.tm-input {
  width: 100%; padding: 0.5rem 0.7rem; font-size: 0.8rem;
  font-family: monospace; border: 1px solid var(--tm-border);
  border-radius: 6px; background: var(--tm-bg); color: var(--tm-text);
  outline: none; box-sizing: border-box;
}
.tm-input:focus { border-color: var(--tm-accent); }
.tm-btn {
  padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 500;
  border: none; border-radius: 6px; background: var(--tm-accent);
  color: #fff; cursor: pointer; transition: opacity 0.15s;
}
.tm-btn:hover { opacity: 0.85; }
.tm-btn:disabled { opacity: 0.4; cursor: default; }
.tm-btn-secondary {
  background: transparent; border: 1px solid var(--tm-border); color: var(--tm-muted);
}
.tm-btn-secondary:hover { color: var(--tm-text); border-color: var(--tm-muted); }
.tm-key-status {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.7rem; margin-top: 0.3rem;
}
.tm-key-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tm-key-dot.on { background: var(--tm-success); }
.tm-key-dot.off { background: var(--tm-muted); }
.tm-key-masked { color: var(--tm-muted); font-family: monospace; }

.tm-msg {
  padding: 0.6rem 0.8rem; border-radius: 6px;
  font-size: 0.75rem; margin-bottom: 1rem;
}
.tm-msg.ok { background: rgba(74,222,128,0.1); color: var(--tm-success); border: 1px solid rgba(74,222,128,0.2); }
.tm-msg.err { background: rgba(248,113,113,0.1); color: var(--tm-danger); border: 1px solid rgba(248,113,113,0.2); }
.tm-msg.info { background: rgba(79,158,255,0.1); color: var(--tm-accent); border: 1px solid rgba(79,158,255,0.2); }
.tm-empty { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
.tm-loading { color: var(--tm-muted); text-align: center; padding: 2rem; font-size: 0.85rem; }
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

// ── Canvas API (via host.agentServer) ───────────────────────────────────

/** List secret names stored in Canvas. Returns array of {name, description}. */
async function canvasListSecrets(host) {
  const raw = await host.agentServer.request({ path: "/api/settings/secrets" });
  return raw?.secrets || [];
}

/** Get a secret value from Canvas. Returns the raw string. */
async function canvasGetSecret(host, name) {
  try {
    const raw = await host.agentServer.request({ path: `/api/settings/secrets/${encodeURIComponent(name)}` });
    // The response may be the raw string or a JSON object
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && raw.value) return raw.value;
    return String(raw || "");
  } catch {
    return null;
  }
}

/** Store a secret in Canvas. */
async function canvasSetSecret(host, name, value) {
  await host.agentServer.request({
    method: "PUT",
    path: "/api/settings/secrets",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, value }),
  });
}

/** Delete a secret from Canvas. */
async function canvasDeleteSecret(host, name) {
  await host.agentServer.request({
    method: "DELETE",
    path: `/api/settings/secrets/${encodeURIComponent(name)}`,
  });
}

/** Read all provider secrets from Canvas. Returns {linear, github, posthog}. */
async function readSecrets(host) {
  const result = { linear: null, github: null, posthog: null };
  for (const [provider, secretName] of Object.entries(SECRET_NAMES)) {
    result[provider] = await canvasGetSecret(host, secretName);
  }
  return result;
}

// ── Daemon API ──────────────────────────────────────────────────────────

async function daemonFetch(path, opts = {}) {
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

/** Fetch tasks from daemon, passing secret values as headers. */
async function fetchTasks(host) {
  const secrets = await readSecrets(host);
  const headers = {};
  for (const [provider, val] of Object.entries(secrets)) {
    if (val) headers[SECRET_HEADERS[provider]] = val;
  }
  return daemonFetch("/tasks", { headers });
}

// ── Tasks view ──────────────────────────────────────────────────────────

async function renderTasks(view, host) {
  view.replaceChildren(loadingEl("Fetching tasks…"));

  let data;
  try {
    data = await fetchTasks(host);
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
    frag.append(msgEl("err", errors.map((e) => `${e.source}: ${e.error}`).join("; ")));
  }

  if (items.length === 0) {
    frag.append(emptyEl("No open tasks found. Check your keys in Settings."));
  } else {
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.75rem;";
    header.innerHTML = `<span style="font-size:0.85rem;font-weight:600;">${items.length} tasks</span><span style="font-size:0.7rem;color:var(--tm-muted);">sorted by priority</span>`;
    frag.append(header);
    for (const item of items) frag.append(taskRow(item));
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
  link.rel = "noopener";
  link.textContent = item.title;
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

async function renderSettings(view, host) {
  view.replaceChildren(loadingEl("Loading…"));

  // Check which secrets exist in Canvas
  let canvasSecrets;
  try {
    canvasSecrets = await canvasListSecrets(host);
  } catch (e) {
    view.replaceChildren(errorEl("Cannot reach Canvas agent-server.", e.message));
    return;
  }

  const secretNames = new Set(canvasSecrets.map((s) => s.name));

  // Also read actual values to show masked preview
  const secrets = await readSecrets(host);

  const frag = document.createDocumentFragment();

  // Status card
  const statusCard = document.createElement("div");
  statusCard.className = "tm-card";
  const statusTitle = document.createElement("div");
  statusTitle.className = "tm-card-title";
  statusTitle.textContent = "Connection status";
  statusCard.append(statusTitle);

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
      const maskedEl = document.createElement("span");
      maskedEl.className = "tm-key-masked";
      maskedEl.textContent = masked;
      row.append(dot, label, maskedEl);
    } else {
      const off = document.createElement("span");
      off.style.color = "var(--tm-muted)";
      off.textContent = "not set";
      row.append(dot, label, off);
    }
    statusCard.append(row);
  }

  const statusNote = document.createElement("p");
  statusNote.style.cssText = "font-size:0.7rem;color:var(--tm-muted);margin:0.75rem 0 0;";
  statusNote.textContent = "Keys are stored securely in Canvas agent-server secrets and injected into dispatched conversations.";
  statusCard.append(statusNote);

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
  desc.textContent = "Paste keys below and click Save. They will be stored as Canvas secrets (LINEAR_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN, POSTHOG_API_KEY).";
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

  frag.append(formCard);
  view.replaceChildren(frag);

  // Save: store each key as a Canvas secret
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Saving to Canvas…"));
    try {
      const toSave = [];
      for (const [provider, input] of Object.entries(inputs)) {
        if (input.value.trim()) {
          toSave.push({ provider, value: input.value.trim() });
        }
      }
      if (toSave.length === 0) {
        msgArea.replaceChildren(msgEl("err", "Enter at least one key."));
        saveBtn.disabled = false;
        return;
      }
      const results = [];
      for (const { provider, value } of toSave) {
        await canvasSetSecret(host, SECRET_NAMES[provider], value);
        const masked = value.length > 8 ? value.slice(0, 4) + "…" + value.slice(-4) : "…";
        results.push(`${provider}: ✓ ${masked}`);
      }
      for (const input of Object.values(inputs)) input.value = "";
      msgArea.replaceChildren(msgEl("ok", `Saved to Canvas secrets. ${results.join(" · ")}`));
      // Re-render status card
      renderSettings(view, host);
    } catch (e) {
      msgArea.replaceChildren(msgEl("err", e.message));
    }
    saveBtn.disabled = false;
  });

  // Refresh: fetch tasks using Canvas-stored secrets
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    msgArea.replaceChildren(loadingEl("Fetching tasks…"));
    try {
      const data = await fetchTasks(host);
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

// ── Prompts view ────────────────────────────────────────────────────────

async function renderPrompts(view) {
  let data;
  try {
    data = await daemonFetch("/prompts");
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

    const header = document.createElement("div");
    header.className = "tm-header";
    const title = document.createElement("div");
    title.className = "tm-title";
    title.textContent = "Task Manager";
    const tabs = document.createElement("div");
    tabs.className = "tm-tabs";
    header.append(title, tabs);
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
          btn.addEventListener("click", () => {
            active = v.id;
            render();
          });
          return btn;
        }),
      );

      view.replaceChildren(loadingEl("Loading…"));
      if (active === "tasks") renderTasks(view, host);
      else if (active === "settings") renderSettings(view, host);
      else if (active === "prompts") renderPrompts(view);
    }

    render();
    return () => root.remove();
  });
}
