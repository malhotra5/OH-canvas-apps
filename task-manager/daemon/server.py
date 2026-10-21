"""Task Manager daemon — FastAPI server.

Run: uvicorn daemon.server:app --host 127.0.0.1 --port 7420

Secrets are passed via headers from the frontend (which reads them from
Canvas agent-server). The daemon is stateless regarding secrets.
GitHub also falls back to `gh auth token` if no key header is provided.
"""

from __future__ import annotations

import asyncio
import hashlib
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .secrets import mask, LINEAR_HEADER, GITHUB_HEADER, POSTHOG_HEADER
from .store import StateStore
from .prompts import PromptStore
from .providers import github as github_provider
from .providers import linear as linear_provider

DATA_DIR = Path.home() / ".openhands" / "task-manager"

app = FastAPI(title="Task Manager Daemon", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:8000", "http://127.0.0.1:3001", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = StateStore(DATA_DIR)
prompts = PromptStore(DATA_DIR)

AGENT_SERVER = "http://localhost:18000"
_API_KEY_CACHE: dict = {"val": None, "read_at": 0.0}

# Map agent-server execution_status → our dispatch status
_EXEC_STATUS_MAP = {
    "idle": "running",
    "running": "running",
    "paused": "running",
    "waiting_for_confirmation": "running",
    "finished": "completed",
    "error": "failed",
    "stuck": "failed",
    "deleting": "failed",
}


def _agent_api_key() -> str | None:
    """Read the agent-server API key from the canvas config file."""
    key_path = Path.home() / ".openhands" / "agent-canvas" / "api-key.txt"
    if not key_path.exists():
        return None
    # Cache for 60s to avoid re-reading on every poll
    now = time.time()
    if _API_KEY_CACHE["val"] and now - _API_KEY_CACHE["read_at"] < 60:
        return _API_KEY_CACHE["val"]
    try:
        val = key_path.read_text().strip()
        _API_KEY_CACHE.update(val=val or None, read_at=now)
        return val or None
    except OSError:
        return None


def _gh_token() -> str | None:
    """Fall back to `gh auth token` if available."""
    try:
        result = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


# ── Models ──────────────────────────────────────────────────────────────


class SetCreate(BaseModel):
    name: str


class SetUpdate(BaseModel):
    name: str | None = None


class TemplateCreate(BaseModel):
    title: str
    body: str


class TemplateUpdate(BaseModel):
    title: str | None = None
    body: str | None = None


class ActiveSet(BaseModel):
    set_id: str


class ActionTemplateUpdate(BaseModel):
    template_id: str


class ActionProfileUpdate(BaseModel):
    profile_id: str = ""


class PreviewRequest(BaseModel):
    body: str
    variables: dict[str, Any] = {}


class DispatchUpdate(BaseModel):
    conversation_id: str
    conversation_url: str | None = None
    status: str = "running"
    action: str | None = None
    prompt_set_id: str | None = None
    prompt_template_id: str | None = None
    progress_note: str | None = None
    linked_prs: list[dict] | None = None


# ── Endpoints ───────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Conversation status poller ───────────────────────────────────────────

POLL_INTERVAL = 30  # seconds between polls


async def _poll_conversation_statuses() -> None:
    """Background task: poll agent-server for running conversations and update their status."""
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        api_key = _agent_api_key()
        if not api_key:
            continue
        running = state.get_running()
        if not running:
            continue
        headers = {"X-Session-API-Key": api_key}
        async with httpx.AsyncClient(timeout=10) as client:
            for item_id, conv_id in running.items():
                try:
                    resp = await client.get(f"{AGENT_SERVER}/api/conversations/{conv_id}", headers=headers)
                    if resp.status_code != 200:
                        continue
                    exec_status = resp.json().get("execution_status", "running")
                    mapped = _EXEC_STATUS_MAP.get(exec_status, "running")
                    if mapped != "running":
                        state.update_status(item_id, conv_id, mapped)
                except (httpx.HTTPError, KeyError, ValueError):
                    continue


@app.on_event("startup")
async def _start_status_poller() -> None:
    asyncio.create_task(_poll_conversation_statuses())


# ── Task cache ───────────────────────────────────────────────────────────

CACHE_TTL_SECONDS = 300
_cache: dict = {"key": None, "items": [], "errors": None, "fetched_at": 0.0}


class _SortDesc:
    """Wrapper to reverse string comparison for descending sort."""
    __slots__ = ("v",)

    def __init__(self, v: str):
        self.v = v

    def __lt__(self, other: "_SortDesc") -> bool:
        return self.v > other.v

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _SortDesc) and self.v == other.v


def _cache_key(linear_key: str | None, gh_key: str | None) -> str:
    return hashlib.sha256(f"{linear_key or ''}|{gh_key or ''}".encode()).hexdigest()


def _fetch_fresh(linear_key: str | None, gh_key: str | None, github_header_key: str | None) -> tuple[list[dict], list[dict] | None]:
    all_items: list[dict] = []
    errors: list[dict] = []

    if linear_key:
        try:
            all_items.extend(linear_provider.fetch_issues(linear_key))
        except Exception as e:
            errors.append({"source": "linear", "error": str(e)})

    if gh_key:
        try:
            all_items.extend(github_provider.fetch_all(gh_key))
        except Exception as e:
            # If the header key fails with 401, fall back to `gh auth token`
            if "401" in str(e) and github_header_key:
                gh_fallback = _gh_token()
                if gh_fallback and gh_fallback != github_header_key:
                    try:
                        all_items.extend(github_provider.fetch_all(gh_fallback))
                    except Exception as e2:
                        errors.append({"source": "github", "error": str(e2)})
                else:
                    errors.append({"source": "github", "error": str(e)})
            else:
                errors.append({"source": "github", "error": str(e)})

    return all_items, errors or None


@app.get("/tasks")
def get_tasks(
    refresh: bool = False,
    linear_key: str | None = Header(None, alias=LINEAR_HEADER),
    github_key: str | None = Header(None, alias=GITHUB_HEADER),
):
    """Fetch and merge items from all configured providers, sorted by priority.

    Results are cached for 5 minutes keyed on the API keys; pass
    ?refresh=true to force a fresh fetch.
    """
    gh_key = github_key or _gh_token()

    if not linear_key and not gh_key:
        return {"items": [], "errors": [], "message": "No API keys provided. Set them in Settings or run `gh auth login`."}

    key = _cache_key(linear_key, gh_key)
    fresh = (
        _cache["key"] == key
        and time.time() - _cache["fetched_at"] < CACHE_TTL_SECONDS
    )
    if refresh or not fresh:
        items, errors = _fetch_fresh(linear_key, gh_key, github_key)
        _cache.update(key=key, items=items, errors=errors, fetched_at=time.time())

    all_items = _cache["items"]
    errors = _cache["errors"]

    # Sort: priority rank asc, then source rank (reviews first), then date desc
    source_rank = {"github-review": 0, "linear": 1, "github-issue": 2, "github-pr": 3}
    all_items.sort(
        key=lambda x: (
            x["priority"],
            source_rank.get(x["source"], 9),
            _SortDesc(x.get("updated_at") or x.get("created_at") or ""),
        )
    )

    # Attach any saved dispatch state
    dispatches = state.get_all().get("dispatches", {})
    for item in all_items:
        item["dispatch"] = dispatches.get(item["id"])

    return {"items": all_items, "errors": errors or None}


# ── Prompts ─────────────────────────────────────────────────────────────


@app.get("/prompts")
def get_prompts():
    return prompts.get_all()


@app.put("/prompts")
def put_prompts(data: dict):
    return prompts.replace_all(data)


@app.post("/prompts/sets")
def create_set(req: SetCreate):
    return prompts.create_set(req.name)


@app.put("/prompts/sets/{set_id}")
def update_set(set_id: str, req: SetUpdate):
    result = prompts.update_set(set_id, req.name)
    if not result:
        raise HTTPException(404, "Set not found")
    return result


@app.delete("/prompts/sets/{set_id}")
def delete_set(set_id: str):
    prompts.delete_set(set_id)
    return {"deleted": True}


@app.post("/prompts/sets/{set_id}/templates")
def add_template(set_id: str, req: TemplateCreate):
    result = prompts.add_template(set_id, req.title, req.body)
    if not result:
        raise HTTPException(404, "Set not found")
    return result


@app.put("/prompts/sets/{set_id}/templates/{template_id}")
def update_template(set_id: str, template_id: str, req: TemplateUpdate):
    result = prompts.update_template(set_id, template_id, **req.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(404, "Template not found")
    return result


@app.delete("/prompts/sets/{set_id}/templates/{template_id}")
def delete_template(set_id: str, template_id: str):
    prompts.delete_template(set_id, template_id)
    return {"deleted": True}


@app.put("/prompts/active")
def set_active_set(req: ActiveSet):
    return prompts.set_active(req.set_id)


@app.get("/prompts/action-map")
def get_action_map():
    return prompts.get_action_map()


@app.put("/prompts/action-map/{action}")
def set_action_template(action: str, req: ActionTemplateUpdate):
    return prompts.set_action_template(action, req.template_id)


@app.get("/prompts/profile-map")
def get_profile_map():
    return prompts.get_profile_map()


@app.put("/prompts/profile-map/{action}")
def set_action_profile(action: str, req: ActionProfileUpdate):
    return prompts.set_action_profile(action, req.profile_id)


@app.post("/prompts/preview")
def preview_prompt(req: PreviewRequest):
    return {"rendered": prompts.render(req.body, req.variables)}


# ── State ───────────────────────────────────────────────────────────────


@app.get("/state")
def get_state():
    return state.get_all()


@app.put("/state/{item_id:path}/dispatch")
def update_dispatch(item_id: str, req: DispatchUpdate):
    return state.set_dispatch(item_id, req.model_dump(exclude_none=True))


@app.post("/state/{item_id:path}/history")
def add_history(item_id: str, event: str, detail: str = ""):
    state.append_history(item_id, event, detail)
    return {"ok": True}


@app.post("/state/{item_id:path}/linked-prs")
def add_linked_pr(item_id: str, repo: str, number: int, url: str, pr_state: str = "open"):
    state.add_linked_pr(item_id, repo, number, url, pr_state)
    return {"ok": True}


# ── Board (kanban) ──────────────────────────────────────────────────────

# CI states that count as "passing" for the under-review queue.
# statusCheckRollup states: SUCCESS, FAILURE, PENDING, ERROR, EXPECTED, NO_CHECKS.
_CI_PASSING = {"success"}


def _build_board(items: list[dict]) -> list[dict]:
    """Group tickets with their PR implementations and derive the kanban queue.

    A group = one ticket (Linear or GitHub issue) + any PRs implementing it
    (matched via the PR's linked issue refs and dispatch-state linked PRs).
    Queue rules:
      - todo:         no PR, no active dispatch conversation
      - in-progress:  PR exists but isn't review-ready yet, OR an agent
                      conversation is actively working the ticket
      - under-review: has a PR with CI passing, marked ready (not draft),
                      zero unresolved review threads, and a pending review request
    """
    tickets = [i for i in items if i["source"] in ("linear", "github-issue")]
    prs = [i for i in items if i["source"] == "github-pr"]

    # Index tickets for PR ref matching:
    #   "Owner/repo#N" and bare "#N" -> GitHub issues; dispatch linked_prs -> any ticket
    gh_by_ref: dict[str, dict] = {}
    for t in tickets:
        if t["source"] == "github-issue":
            gh_by_ref[f"{t['repo']}#{t['identifier']}"] = t
            gh_by_ref[t["identifier"]] = t
    # Linear tickets: index by GitHub attachment URLs (PR or issue links from Linear UI)
    linear_by_pr: dict[tuple, list[dict]] = {}
    linear_by_issue_ref: dict[str, list[dict]] = {}
    for t in tickets:
        if t["source"] == "linear":
            for link in t.get("github_links", []) or []:
                url = link.get("url", "")
                # Match GitHub PR URLs: github.com/OWNER/REPO/pull/N
                if "/pull/" in url:
                    parts = url.rstrip("/").split("/")
                    try:
                        repo = f"{parts[-4]}/{parts[-3]}"
                        num = parts[-1]
                        linear_by_pr.setdefault((repo, int(num)), []).append(t)
                    except (IndexError, ValueError):
                        pass
                # Match GitHub issue URLs: github.com/OWNER/REPO/issues/N
                elif "/issues/" in url:
                    parts = url.rstrip("/").split("/")
                    try:
                        ref = f"{parts[-4]}/{parts[-3]}#{parts[-1]}"
                        linear_by_issue_ref.setdefault(ref, []).append(t)
                    except (IndexError, ValueError):
                        pass
    # Reverse index: (repo, number) -> tickets, from dispatch-state linked PRs
    linked_ticket_by_pr: dict[tuple, list[dict]] = {}
    for t in tickets:
        for pr in (t.get("dispatch") or {}).get("linked_prs", []) or []:
            linked_ticket_by_pr.setdefault((pr.get("repo", ""), int(pr.get("number", 0))), []).append(t)

    def match_ticket_for_pr(pr: dict) -> list[dict]:
        matched: list[dict] = []
        seen = set()
        for ref in pr.get("linked_issues", []) or []:
            t = gh_by_ref.get(ref.get("ref", "")) or gh_by_ref.get(str(ref.get("number", "")))
            if t and t["id"] not in seen:
                seen.add(t["id"])
                matched.append(t)
        # Match Linear tickets that have this PR linked as an attachment
        for t in linear_by_pr.get((pr.get("repo", ""), int(pr["identifier"])), []):
            if t["id"] not in seen:
                seen.add(t["id"])
                matched.append(t)
        for t in linked_ticket_by_pr.get((pr.get("repo", ""), int(pr["identifier"])), []):
            if t["id"] not in seen:
                seen.add(t["id"])
                matched.append(t)
        return matched

    prs_by_ticket: dict[str, list[dict]] = {}
    orphan_prs: list[dict] = []
    for pr in prs:
        matched = match_ticket_for_pr(pr)
        if matched:
            for t in matched:
                prs_by_ticket.setdefault(t["id"], []).append(pr)
        else:
            orphan_prs.append(pr)

    def pr_under_review(pr: dict) -> bool:
        ci = (pr.get("ci_status") or "").lower()
        return (
            ci in _CI_PASSING
            and pr.get("state") != "draft"
            and not pr.get("unresolved_threads")
            and bool(pr.get("reviewers_requested"))
        )

    def dispatch_active(t: dict) -> bool:
        d = t.get("dispatch")
        if not d or not d.get("conversation_id"):
            return False
        return d.get("status") not in ("completed", "failed", "stopped")

    groups: list[dict] = []
    for t in tickets:
        linked = prs_by_ticket.get(t["id"], [])
        queue = "todo"
        if any(pr_under_review(p) for p in linked):
            queue = "under-review"
        elif linked or dispatch_active(t):
            queue = "in-progress"
        groups.append({
            "id": t["id"],
            "queue": queue,
            "ticket": t,
            "prs": linked,
            "orphan": False,
        })

    # PRs with no resolvable ticket still show on the board as their own cards
    for pr in orphan_prs:
        queue = "under-review" if pr_under_review(pr) else "in-progress"
        groups.append({
            "id": pr["id"],
            "queue": queue,
            "ticket": None,
            "prs": [pr],
            "orphan": True,
        })

    # Sort by ticket priority, then recency
    def sort_key(g):
        t = g["ticket"] or g["prs"][0]
        return (
            t.get("priority", 2),
            _SortDesc(t.get("updated_at") or t.get("created_at") or ""),
        )

    groups.sort(key=sort_key)
    return groups


@app.get("/board")
def get_board(
    refresh: bool = False,
    linear_key: str | None = Header(None, alias=LINEAR_HEADER),
    github_key: str | None = Header(None, alias=GITHUB_HEADER),
):
    """Kanban board: tickets grouped with their PRs, bucketed into queues."""
    tasks = get_tasks(refresh=refresh, linear_key=linear_key, github_key=github_key)
    return {"groups": _build_board(tasks["items"]), "errors": tasks.get("errors")}
