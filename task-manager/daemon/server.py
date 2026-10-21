"""Task Manager daemon — FastAPI server.

Run: uvicorn daemon.server:app --host 127.0.0.1 --port 7420

Secrets are passed via headers from the frontend (which reads them from
Canvas agent-server). The daemon is stateless regarding secrets.
GitHub also falls back to `gh auth token` if no key header is provided.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

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
    applies_to: list[str] | None = None


class TemplateUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    applies_to: list[str] | None = None


class ActiveSet(BaseModel):
    set_id: str


class PreviewRequest(BaseModel):
    body: str
    variables: dict[str, Any] = {}


class DispatchUpdate(BaseModel):
    conversation_id: str
    conversation_url: str | None = None
    status: str = "running"
    prompt_set_id: str | None = None
    prompt_template_id: str | None = None
    progress_note: str | None = None
    linked_prs: list[dict] | None = None


# ── Endpoints ───────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/tasks")
def get_tasks(
    linear_key: str | None = Header(None, alias=LINEAR_HEADER),
    github_key: str | None = Header(None, alias=GITHUB_HEADER),
):
    """Fetch and merge items from all configured providers, sorted by priority."""
    all_items: list[dict] = []
    errors: list[dict] = []

    # GitHub: use header key, or fall back to `gh auth token`
    gh_key = github_key or _gh_token()

    if linear_key:
        try:
            all_items.extend(linear_provider.fetch_issues(linear_key))
        except Exception as e:
            errors.append({"source": "linear", "error": str(e)})

    if gh_key:
        try:
            all_items.extend(github_provider.fetch_all(gh_key))
        except Exception as e:
            # If the provided token fails with 401, try `gh auth token` fallback
            if "401" in str(e) and github_key:
                gh_fallback = _gh_token()
                if gh_fallback and gh_fallback != github_key:
                    try:
                        all_items.extend(github_provider.fetch_all(gh_fallback))
                    except Exception as e2:
                        errors.append({"source": "github", "error": str(e2)})
                else:
                    errors.append({"source": "github", "error": str(e)})
            else:
                errors.append({"source": "github", "error": str(e)})

    if not linear_key and not gh_key:
        return {"items": [], "errors": [], "message": "No API keys provided. Set them in Settings or run `gh auth login`."}

    # Sort: priority rank, then source rank (reviews first), then updated_at desc
    source_rank = {"github-review": 0, "linear": 1, "github-issue": 2, "github-pr": 3}
    all_items.sort(key=lambda x: (x["priority"], source_rank.get(x["source"], 9), x.get("updated_at") or ""))

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
    result = prompts.add_template(set_id, req.title, req.body, req.applies_to)
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


@app.post("/prompts/preview")
def preview_prompt(req: PreviewRequest):
    return {"rendered": prompts.render(req.body, req.variables)}


# ── State ───────────────────────────────────────────────────────────────


@app.get("/state")
def get_state():
    return state.get_all()


@app.put("/state/{item_id}/dispatch")
def update_dispatch(item_id: str, req: DispatchUpdate):
    return state.set_dispatch(item_id, req.model_dump(exclude_none=True))


@app.post("/state/{item_id}/history")
def add_history(item_id: str, event: str, detail: str = ""):
    state.append_history(item_id, event, detail)
    return {"ok": True}


@app.post("/state/{item_id}/linked-prs")
def add_linked_pr(item_id: str, repo: str, number: int, url: str, pr_state: str = "open"):
    state.add_linked_pr(item_id, repo, number, url, pr_state)
    return {"ok": True}
