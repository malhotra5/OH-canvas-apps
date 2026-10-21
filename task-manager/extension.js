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
    body: JSON.stringify({ name, value }),
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
  const created = await host.agentServer.request({
    method: "POST", path: "/api/conversations",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const convId = created.id || created.app_conversation_id;
  if (title && convId) {
    try {
      await host.agentServer.request({
        method: "PATCH", path: `/api/conversations/${convId}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {}
  }
  return { id: convId, url: `/conversations/${convId}` };
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

async function renderTasks(view, host) {
  view.replaceChildren(loadingEl("Fetching tasks…"));
  let data;
  try { data = await fetchTasks(host); }
  catch (e) { view.replaceChildren(errorEl("Cannot reach the task daemon. Is it running on port 7420?", e.message)); return; }

  const { items = [], errors, message } = data;
  if (message) { view.replaceChildren(msgEl("info", message), emptyEl("Configure your API keys in the Settings tab to see tasks.")); return; }

  const frag = document.createDocumentFragment();
  if (errors?.length) frag.append(msgEl("err", errors.map((e) => `${e.source}: ${e.error}`).join("; ")));

  // Only show issues and linear items (not reviews or PRs)
  const filtered = items.filter((i) => i.source === "linear" || i.source === "github-issue");

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
  row.className = "tm-item";
  const dot = document.createElement("div");
  dot.className = `tm-item-dot tm-priority-${item.priority}`;
  const body = document.createElement("div");
  body.className = "tm-item-body";
  const title = document.createElement("div");
  title.className = "tm-item-title";
  title.append(itemLink(item));
  const meta = document.createElement("div");
  meta.className = "tm-item-meta";
  meta.append(badge(item.source.replace("github-", "gh-"), `source-${item.source}`));
  if (item.identifier) meta.append(badge(item.identifier, ""));
  if (item.repo) { const s = document.createElement("span"); s.textContent = item.repo; meta.append(s); }
  if (item.team) { const s = document.createElement("span"); s.textContent = `· ${item.team}`; meta.append(s); }
  body.append(title, meta);
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

  const reviews = items.filter((i) => i.source === "github-review");
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

  const prs = items.filter((i) => i.source === "github-pr");
  if (prs.length === 0) {
    frag.append(emptyEl("No open PRs."));
  } else {
    frag.append(sectionHeader(prs.length, "open PRs"));
    for (const item of prs) frag.append(prRow(item));
  }
  view.replaceChildren(frag);
}

function prRow(item) {
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
  const ciText = item.ci_status === "success" ? "✓ CI passing" : item.ci_status === "failure" ? "✗ CI failing" : "⏳ CI pending";
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
  row.append(dot, body);
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
      card.append(emptyEl("No templates"));
    }
    frag.append(card);
  }

  view.replaceChildren(frag);

  // Wire up launch button
  launchBtn.addEventListener("click", async () => {
    launchBtn.disabled = true;
    launchMsg.replaceChildren(loadingEl("Launching agent conversation…"));
    try {
      const helperPrompt = `You are a prompt engineering helper for a personal task manager app.

The app fetches Linear issues, GitHub issues, pending reviews, and open PRs (with CI status and reviewer info). It has a prompt system with sets of templates that are used when dispatching agent conversations to work on tickets.

Current prompt sets and templates:
${JSON.stringify(data.sets || [], null, 2)}

Help me write new prompt templates or improve existing ones. Each template has:
- title: short name
- body: the prompt text (supports {{variables}} like {{title}}, {{url}}, {{repo}}, {{identifier}})
- applies_to: array of source types ("linear", "github-issue", "github-review", "github-pr")

Ask me what kind of prompt I want to create, then help me draft it. When we're happy with the result, give me the final template in JSON format so I can save it.`;

      const result = await createConversation(host, helperPrompt, "📝 Prompt Helper");
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
