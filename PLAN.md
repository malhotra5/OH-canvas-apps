# Task Manager — Canvas App Plan

A personal daily-task-manager app for Agent Canvas. Aggregates Linear issues and
GitHub work (assigned issues, pending reviews), displays one prioritized list,
and dispatches OpenHands conversations against any item — with conversation
state, progress, and opened PRs persisted on the item.

## 1. Platform constraints (verified against local Agent Server 1.56.0 + spec)

- A Canvas App = directory with `canvas-extension.json` (schema 1) + **one
  self-contained browser ESM bundle** (`extension.js`). No bare imports; no
  build artifacts required if we write dependency-free ESM.
- `activate(host)` registers pages declared in the manifest. Pages mount at
  `/extensions/{name}/{page-path}`.
- The browser app can make authenticated calls to the Agent Server through
  `host.agentServer.request({ method, path, body, headers })` — custom headers
  are supported (needed for `X-Expose-Secrets: encrypted`).
- Optional managed app backends exist (prepare/start lifecycle + managed data
  dir) but **only on Linux** (`current_platform()` returns None on macOS →
  backend state `unsupported`). Your Agent Server runs on macOS, so the daemon
  cannot be auto-managed by the app lifecycle locally. It must be a companion
  process today; the same daemon can be packaged as a managed backend later.
- Agent-server secret store (`PUT /api/settings/secrets`) is write-only over
  HTTP (list names only, no value read-back). Secrets are injected into
  conversations as environment variables. The browser can therefore never read
  the Linear/GitHub keys back — by design.
- Conversation dispatch: `POST /api/conversations` with
  `X-Expose-Secrets: encrypted` settings + `secrets_encrypted: true` creates a
  fully-tooled conversation that inherits your LLM profile and runs
  immediately. This is the supported delegation pattern.

## 2. Architecture

```
┌───────────────────────────── Browser (Canvas page) ─────────────────────────────┐
│  extension.js (self-contained ESM)                                               │
│   • renders task list, settings, prompt editor                                   │
│   • host.agentServer.request() → agent-server API (list convs, create conv,      │
│     poll status/events)                                                          │
│   • fetch() → companion daemon on 127.0.0.1 (tasks, keys setup, state)            │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ HTTP (localhost, CORS allow-listed)
┌───────────────────────────────────▼──────────────────────────────────────────────┐
│  taskd — companion daemon (FastAPI, 127.0.0.1:7420)                              │
│   • providers: Linear (GraphQL), GitHub (REST/GraphQL)                            │
│   • priority normalization + merge/sort                                           │
│   • key store: ~/.openhands/task-manager/keys.json (chmod 600)                    │
│   • state store: ~/.openhands/task-manager/state.json (items, conv links, PRs)   │
│   • prompts store: ~/.openhands/task-manager/prompts.json (sets + templates)     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Why a daemon: Linear's API has no browser CORS and both Linear/GitHub keys must
never live in the browser. The daemon is localhost-only, holds keys in a 0600
file outside the repo, and is the single place that talks to Linear/GitHub.
The dispatched conversations get credentials via agent-server custom secrets
(`LINEAR_API_KEY`, `GITHUB_TOKEN`, `POSTHOG_API_KEY`) so agents can act on
tickets too.

## 3. Repo layout (created in OH-canvas-apps)

```
OH-canvas-apps/
├── PLAN.md                  ← this document
├── README.md                ← install/enable/run instructions
└── task-manager/            ← the app package (one dir = one installable app)
    ├── canvas-extension.json
    ├── icon.svg
    ├── extension.js         ← hand-written dependency-free ESM (no build step)
    ├── daemon/
    │   ├── server.py        ← FastAPI app (tasks, state, settings, prompts)
    │   ├── providers/
    │   │   ├── linear.py    ← GraphQL: assigned issues, priority, cycle info
    │   │   └── github.py    ← assigned issues + requested reviews + open PRs
    │   ├── store.py         ← atomic JSON state store (items, dispatches, PRs)
    │   ├── prompts.py       ← prompt-set store + renderer ({{var}} substitution)
    │   ├── secrets.py       ← key file management (0600), masked responses
    │   └── requirements.txt
    └── packaging/           ← (phase 7) linux tar.gz to enable managed backend
```

## 4. Data model

### Task item (normalized)

```json
{
  "id": "linear:ENG-123 | github:owner/repo#456 | review:owner/repo#78",
  "source": "linear | github-issue | github-review | github-pr",
  "external_id": "...",
  "title": "...",
  "url": "https://...",
  "body_excerpt": "...",
  "priority_raw": "urgent | high | ... | label:P1 | null",
  "priority": 1,              // normalized 0–4 (see §5)
  "due_date": null,
  "updated_at": "...",
  "assignee": "me"
}
```

### Ingest scope (decided)

- **Linear**: all issues assigned to me, regardless of team. Personal team view
  (oss-team teamspace) is a secondary, optional source toggle.
- **GitHub**: `openhands/` org — my assigned issues, pending reviews, and open
  PRs in repos under that org.

### Per-item dispatch state (persisted in state.json)

```json
{
  "conversation_id": "uuid",
  "conversation_url": "http://localhost:3001/conversations/<uuid>",
  "status": "running | idle | finished | error | stopped",
  "prompt_set_id": "default",       // which set was used
  "prompt_template_id": "fix-issue", // which template was used
  "dispatched_at": "...",
  "last_checked_at": "...",
  "progress_note": "latest agent message excerpt",
  "linked_prs": [ {"repo": "owner/repo", "number": 42, "url": "...", "state": "open"} ],
  "history": [ {"at": "...", "event": "dispatched" | "finished" | "pr-opened", "detail": "..."} ]
}
```

State lives in `~/.openhands/task-manager/state.json` (daemon data dir; atomic
writes via temp-file + rename). The user's "tmp directory for saving this
stuff" is satisfied by this dir; it survives app reinstalls (unlike the managed
backend data dir, it is ours to own on macOS).

## 5. Priority normalization & sorting

| Rank | Linear | GitHub |
|------|--------|--------|
| 0 | Urgent | label `P0`/`priority: urgent` |
| 1 | High | label `P1`/`priority: high` |
| 2 | Medium (default) | default rank for unlabeled issues |
| 3 | Low | label `P2`/`priority: low` |
| 4 | No priority | label `P3` |

Sort: `(priority rank, source rank [reviews above issues], updated_at desc)`.
Reviews awaiting you get a `review` source and sit at their PR's priority.
Frontend offers group-by-source and filter toggles; default single flat sorted
list.

## 6. Secrets handling

- One-time setup in the app's Settings page: paste Linear / GitHub / PostHog
  keys → `POST /daemon/keys` → daemon writes `keys.json` (0600, never echoed
  back; subsequent GETs return `{connected: true, masked: "lin_...abcd"}`).
- Additionally, `PUT /api/settings/secrets` (from the Settings page, via
  `host.agentServer.request`) stores `LINEAR_API_KEY` / `GITHUB_TOKEN` /
  `POSTHOG_API_KEY` as agent-server secrets so every dispatched conversation
  has them as environment variables. Write-only API → nothing to leak.
- The browser never holds Linear/GitHub/PostHog keys. PostHog is agent-side
  only: its key is injected into dispatched conversations as an env var, and
  the app itself does no PostHog capture and renders no PostHog view.

## 7. Prompt templates

Templates are organized into **sets** — named collections — so you can keep
different playbooks (e.g. "Eng workflow", "Quick fixes", "Reviews") and pick
the relevant one at dispatch time. Stored in `prompts.json` in the data dir.

### Data model

```json
{
  "sets": [
    {
      "id": "default",
      "name": "Default",
      "templates": [
        {
          "id": "fix-issue",
          "title": "Fix issue",
          "applies_to": ["linear", "github-issue"],
          "body": "Resolve {{title}} ({{url}}). Investigate, implement, and open a PR.\n\nContext:\n{{body}}"
        },
        {
          "id": "address-review",
          "title": "Address review",
          "applies_to": ["github-review"],
          "body": "Address the pending review on {{url}}.\n\nRepo: {{repo}} PR #{{identifier}}.\nRead each review comment, fix or reply, and push to the existing branch."
        },
        {
          "id": "triage",
          "title": "Triage",
          "applies_to": ["linear", "github-issue", "github-review"],
          "body": "Investigate {{title}} ({{url}}) and report findings only. Do not implement yet."
        }
      ]
    }
  ],
  "active_set_id": "default"
}
```

- Template vars: `{{title}}`, `{{url}}`, `{{body}}`, `{{repo}}`,
  `{{identifier}}`.
- `applies_to` filters which templates the dispatch modal offers for a given
  item source; a template with an empty/missing `applies_to` is offered for all
  sources.
- Exactly one set is `active` at a time; the dispatch modal defaults to the
  active set but lets you switch sets inline.

### Editing

- A dedicated **Prompts** page (`/prompts`) lists sets as tabs/accordion; CRUD
  for sets and the templates inside them, with a live preview that renders the
  body against the selected item's vars.
- Sets can be duplicated, renamed, reordered, exported/imported as JSON.
- The default set ships with the three templates above; user-defined sets and
  templates are fully editable.

## 8. Dispatch flow (the "Run agent" button)

1. User clicks **Dispatch** on an item (issue **or** pending review). The
   dispatch modal opens with:
   - a set selector (defaults to the active set),
   - the filtered template list for that item's source,
   - the selected template's body in an editable textarea (live var preview),
   - the target repo + workspace path (pre-filled for repo-scoped items).
2. On confirm, frontend `GET /api/settings` with `X-Expose-Secrets: encrypted`
   header via `host.agentServer.request` → encrypted `agent_settings` (Fernet
   token).
3. Frontend builds the conversation payload:
   - `secrets_encrypted: true`, encrypted `agent_settings`
   - exec tools: terminal, file_editor, task_tracker, browser_tool_set,
     canvas_ui (+ task_tool_set when sub-agents enabled)
   - `agent_context.load_*_skills: true`
   - fresh workspace dir per item (e.g. `~/workspace/task-manager/<item-slug>`)
   - `worktree: true` on the target repo when the item is repo-scoped
   - `confirmation_policy: NeverConfirm`, `max_iterations` from settings
   - `initial_message.run: true` with the rendered prompt
4. `POST /api/conversations` → store `conversation_id`, `prompt_template_id`,
   and `prompt_set_id` on the item via `POST /daemon/state/<item-id>/dispatch`.
5. Polling loop (page-visible interval): conversation status + latest events;
   extract PR links (github.com `pull/` URLs + agent action events) and append
   to `linked_prs`; update `status`/`progress_note`. Item row shows live state
   chip (running / done / errored) and PR badges linking out.
6. Re-dispatch opens a *new* conversation and appends to `history` (keeps the
   old record); the user may pick a different set/template the second time.

## 9. API surface

Daemon (127.0.0.1:7420, CORS limited to localhost):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | readiness |
| GET | `/tasks` | merged, normalized, sorted items |
| POST | `/keys` | store API keys (0600 file) |
| GET | `/keys` | masked status |
| GET | `/prompts` | all prompt sets |
| PUT | `/prompts` | replace all sets (full save) |
| POST | `/prompts/sets` | create a set |
| PUT | `/prompts/sets/{id}` | rename/reorder a set |
| DELETE | `/prompts/sets/{id}` | delete a set |
| POST | `/prompts/sets/{id}/templates` | add a template |
| PUT | `/prompts/sets/{id}/templates/{tid}` | edit a template |
| DELETE | `/prompts/sets/{id}/templates/{tid}` | delete a template |
| POST | `/prompts/preview` | render a body against a sample/real item's vars |
| GET | `/state` | full state (items, dispatches, PRs) |
| PUT | `/state/<item-id>/dispatch` | record/refresh dispatch info |

Frontend → agent-server (via `host.agentServer.request`):
`GET /api/settings` (encrypted), `POST /api/conversations`,
`GET /api/conversations/{id}`, `GET /api/conversations/{id}/events/search`,
`PUT /api/settings/secrets`.

## 10. UI pages (manifest contributes)

| Page | Path | Contents |
|------|------|----------|
| Task Manager | `/app` | single page with internal view switching (tabs): **Tasks** (prioritized list, filters, dispatch buttons, live status chips, PR badges, item detail), **Prompts** (prompt-set manager: CRUD for sets + templates, live preview, export/import), **Settings** (key setup masked, source toggles, agent-secrets checklist) |

A single Canvas page keeps the app self-contained; the `path` argument passed
to the page mount can optionally seed the initial view (e.g.
`/extensions/task-manager/app/settings` opens on the Settings tab).

Scoped styles under an app-root element; full cleanup of timers/listeners on
unmount (the host may mount/dispose repeatedly).

## 11. Build phases

1. **Scaffold**: manifest + `extension.js` static "hello" page, icon; install
   from local path (`POST /api/canvas-extensions/install`), enable via
   Customize > Apps, verify mount. ✅ done — app installed, enabled, all three
   pages (Tasks, Prompts, Settings) mount and render in Canvas; bundle + icon
   served correctly.
2. **Daemon + providers**: FastAPI skeleton, key store, Linear + GitHub
   providers, priority normalization, `GET /tasks`. Validate against real
   APIs with the user's keys.
3. **Tasks UI**: list, sorting/grouping, filters, item detail, settings page.
4. **Prompts UI**: prompt-set manager page, CRUD for sets + templates, live
   preview, export/import.
5. **Dispatch**: encrypted-settings conversation creation, set/template picker
   modal, state linking, live status chips.
6. **Progress & PR tracking**: event polling, PR extraction, history, badges.
7. **Agent-secrets wiring**: dispatch payload carries `LINEAR_API_KEY`,
   `GITHUB_TOKEN`, and `POSTHOG_API_KEY` (custom secrets) so conversations can
   use all three; no custom PostHog view.
8. **Packaging (optional)**: build linux tar.gz artifacts + manifest `backend`
   declaration so the daemon becomes a managed app backend on Linux hosts;
   keep manual-run mode for macOS.

## 12. Security notes

- Keys only ever exist in: the Settings form (transient), daemon memory, and
  the 0600 `keys.json` / agent-server encrypted secret store. Never rendered
  back, never logged, never committed (data dir is outside the repo).
- Daemon binds 127.0.0.1 only; CORS allow-list for localhost Canvas origins.
- Dispatched conversations use encrypted settings; plaintext LLM keys never
  transit our code.
- App is trusted-code (Canvas beta model): review the source before enabling.

## 13. Decisions (resolved)

- **Linear**: ingest all issues assigned to me regardless of team. A secondary
  optional toggle adds the oss-team teamspace team view.
- **GitHub**: scoped to the `openhands/` org.
- **Data dir**: `~/.openhands/task-manager/` confirmed.
- **PostHog**: the secret only needs to exist and be carried into dispatched
  agent conversations (as an env var via custom secrets). No custom PostHog
  view, no usage-analytics dashboard.
- **GitHub reviews**: dispatchable. An "Address review" template ships by
  default; the dispatch modal offers it for `github-review` items.
- **Prompt templates**: organized into named, user-editable **sets**; a
  dedicated Prompts page manages them, and the dispatch modal lets you pick
  the set + template at dispatch time.
