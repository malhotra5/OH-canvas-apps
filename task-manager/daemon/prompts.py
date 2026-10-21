"""Prompt-set store + template renderer."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

DEFAULT_SETS = {
    "sets": [
        {
            "id": "default",
            "name": "Default",
            "templates": [
                {
                    "id": "fix-issue",
                    "title": "Fix issue",
                    "body": (
                        "Resolve {{title}} ({{url}}).\n"
                        "Investigate the issue, implement a fix, and open a pull request.\n\n"
                        "Context:\n{{body}}"
                    ),
                },
                {
                    "id": "address-review",
                    "title": "Address review",
                    "body": (
                        "Address the pending review on {{url}}.\n\n"
                        "Repo: {{repo}} PR #{{identifier}}.\n"
                        "Read each review comment, fix or reply, and push to the existing branch."
                    ),
                },
                {
                    "id": "triage",
                    "title": "Triage",
                    "body": (
                        "Investigate {{title}} ({{url}}) and report findings only.\n"
                        "Do not implement yet."
                    ),
                },
                {
                    "id": "create-ticket",
                    "title": "Create linked ticket",
                    "body": (
                        "The pull request {{url}} ({{repo}} PR #{{identifier}}: \"{{title}}\") has no linked issue.\n\n"
                        "Step 1 — check for an existing ticket first:\n"
                        "  Search the open issues assigned to me (Linear and GitHub) for one that matches "
                        "this PR's subject matter. Look at Linear (via the LINEAR_API_KEY) and GitHub "
                        "issues in {{repo}}.\n"
                        "  If you find a suitable existing issue, do NOT create anything — just link the "
                        "PR to it: edit the PR description to append \"\\nCloses #<number>\" (or the "
                        "Linear issue URL prefixed with a closing keyword), then report what you linked.\n\n"
                        "Step 2 — if no existing issue matches, create a new ticket:\n"
                        "  Target tracker: {{tracker}}\n"
                        "  - If \"linear\": create the issue directly in Linear using the LINEAR_API_KEY. "
                        "Write a clear title and description distilled from the PR's purpose, then link "
                        "the PR to it via a closing keyword in the PR description.\n"
                        "  - If \"github\": create a GitHub issue in {{repo}} (the repo syncs issues to "
                        "Linear automatically). Title and description should distill the PR's purpose, "
                        "then link the PR to it via \"Closes #<number>\" in the PR description.\n\n"
                        "PR description/body for context:\n{{body}}\n\n"
                        "Report at the end: which ticket you linked or created (with its URL and number), "
                        "and paste the updated PR description section."
                    ),
                },
                {
                    "id": "fix-ci",
                    "title": "Fix failing CI",
                    "body": (
                        "CI is failing on {{repo}} PR #{{identifier}} ({{url}}: \"{{title}}\").\n\n"
                        "Steps:\n"
                        "1. Identify the failing checks: read the PR's status/check-runs (via the GitHub "
                        "API or `gh pr checks {{identifier}} --repo {{repo}}`), then pull the failing "
                        "job logs to find the actual error.\n"
                        "2. Determine whether the failure is caused by this PR's changes or by flaky/"
                        "unrelated infrastructure. If it looks flaky, try re-running the failed jobs once "
                        "before changing code.\n"
                        "3. Fix the root cause in the PR's branch: check out the branch, implement the "
                        "fix, and push to the same branch.\n"
                        "4. Watch the checks until they pass.\n\n"
                        "PR description/body for context:\n{{body}}\n\n"
                        "Report at the end: the failing check name(s), root cause, what you changed "
                        "(files + commit SHA), and the final CI state."
                    ),
                },
                {
                    "id": "resolve-threads",
                    "title": "Resolve review comments",
                    "body": (
                        "There {{count_phrase}} unresolved review comment thread(s) on {{repo}} PR "
                        "#{{identifier}} ({{url}}: \"{{title}}\").\n\n"
                        "Steps:\n"
                        "1. Fetch all review threads and their comments (via the GitHub API or "
                        "`gh api` GraphQL reviewThreads) and read each unresolved comment carefully.\n"
                        "2. For each unresolved thread, critically evaluate the feedback:\n"
                        "   - If it points at a real bug or a meaningful improvement, implement the fix "
                        "in the PR branch and push.\n"
                        "   - If it adds verbosity without clear benefit, over-engineers, or contradicts "
                        "the project's pragmatic approach, respectfully decline in a reply explaining "
                        "the reasoning.\n"
                        "3. Reply to every unresolved thread, then resolve it via the GraphQL API "
                        "(resolveReviewThread mutation). Only resolve threads after fixing or clearly "
                        "declining with a rationale.\n"
                        "4. If changes were pushed, watch CI until it finishes.\n\n"
                        "PR description/body for context:\n{{body}}\n\n"
                        "Report at the end: per-thread outcome (fixed with commit SHA, or declined with "
                        "reason), and how many threads remain unresolved (should be 0)."
                    ),
                },
                {
                    "id": "prompt-helper",
                    "title": "Prompt helper",
                    "body": (
                        "You are a prompt engineering helper for a personal task manager app.\n\n"
                        "The app fetches Linear issues, GitHub issues, pending reviews, and open PRs "
                        "(with CI status and reviewer info). It has a prompt system with sets of "
                        "templates that are used when dispatching agent conversations to work on "
                        "tickets.\n\n"
                        "Current prompt sets and templates:\n"
                        "{{sets_json}}\n\n"
                        "Help me write new prompt templates or improve existing ones. Each template has:\n"
                        "- title: short name\n"
                        "- body: the prompt text (supports variables like title, url, repo, identifier "
                        "written in double-curly syntax)\n"
                        "\"github-review\", \"github-pr\")\n\n"
                        "Ask me what kind of prompt I want to create, then help me draft it. When "
                        "we're happy with the result, give me the final template in JSON format so "
                        "I can save it."
                    ),
                },
            ],
        }
    ],
    "active_set_id": "default",
    "action_map": {
        "create-ticket": "create-ticket",
        "fix-ci": "fix-ci",
        "resolve-threads": "resolve-threads",
        "prompt-helper": "prompt-helper",
    },
}


def _render(body: str, variables: dict[str, Any]) -> str:
    rendered = body
    for key, val in variables.items():
        rendered = rendered.replace("{{" + key + "}}", str(val))
    return rendered


class PromptStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = data_dir / "prompts.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write(DEFAULT_SETS)
            return
        # Migration: merge any default templates missing from an existing store
        # (user edits win — only adds templates whose ids don't exist yet)
        try:
            data = json.loads(self.path.read_text())
        except json.JSONDecodeError:
            return
        changed = False
        default_by_id = {t["id"]: t for t in DEFAULT_SETS["sets"][0]["templates"]}
        for s in data.get("sets", []):
            existing_ids = {t.get("id") for t in s.get("templates", [])}
            for tid, tmpl in default_by_id.items():
                if tid not in existing_ids:
                    s.setdefault("templates", []).append(json.loads(json.dumps(tmpl)))
                    changed = True
        # Merge action_map defaults for actions not yet mapped
        if "action_map" not in data:
            data["action_map"] = json.loads(json.dumps(DEFAULT_SETS["action_map"]))
            changed = True
        else:
            for action, tmpl_id in DEFAULT_SETS["action_map"].items():
                if action not in data["action_map"]:
                    data["action_map"][action] = tmpl_id
                    changed = True
        if changed:
            self._write(data)

    def _read(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return json.loads(json.dumps(DEFAULT_SETS))

    def _write(self, data: dict) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        os.replace(tmp, self.path)

    def get_all(self) -> dict:
        return self._read()

    def replace_all(self, data: dict) -> dict:
        self._write(data)
        return data

    def create_set(self, name: str) -> dict:
        data = self._read()
        new_set = {"id": uuid.uuid4().hex[:8], "name": name, "templates": []}
        data.setdefault("sets", []).append(new_set)
        self._write(data)
        return new_set

    def update_set(self, set_id: str, name: str | None = None) -> dict | None:
        data = self._read()
        for s in data.get("sets", []):
            if s["id"] == set_id:
                if name is not None:
                    s["name"] = name
                self._write(data)
                return s
        return None

    def delete_set(self, set_id: str) -> bool:
        data = self._read()
        before = len(data.get("sets", []))
        data["sets"] = [s for s in data.get("sets", []) if s["id"] != set_id]
        if data.get("active_set_id") == set_id:
            data["active_set_id"] = data["sets"][0]["id"] if data["sets"] else None
        self._write(data)
        return len(data["sets"]) < before

    def add_template(self, set_id: str, title: str, body: str) -> dict | None:
        data = self._read()
        for s in data.get("sets", []):
            if s["id"] == set_id:
                tmpl = {
                    "id": uuid.uuid4().hex[:8],
                    "title": title,
                    "body": body,
                }
                s.setdefault("templates", []).append(tmpl)
                self._write(data)
                return tmpl
        return None

    def update_template(self, set_id: str, template_id: str, **fields) -> dict | None:
        data = self._read()
        for s in data.get("sets", []):
            if s["id"] == set_id:
                for t in s.get("templates", []):
                    if t["id"] == template_id:
                        for k in ("title", "body"):
                            if k in fields and fields[k] is not None:
                                t[k] = fields[k]
                        self._write(data)
                        return t
        return None

    def delete_template(self, set_id: str, template_id: str) -> bool:
        data = self._read()
        for s in data.get("sets", []):
            if s["id"] == set_id:
                before = len(s.get("templates", []))
                s["templates"] = [t for t in s.get("templates", []) if t["id"] != template_id]
                if len(s["templates"]) < before:
                    self._write(data)
                    return True
        return False

    def set_active(self, set_id: str) -> dict:
        data = self._read()
        data["active_set_id"] = set_id
        self._write(data)
        return data

    def get_action_map(self) -> dict:
        return self._read().get("action_map", {})

    def set_action_template(self, action: str, template_id: str) -> dict:
        data = self._read()
        data.setdefault("action_map", {})[action] = template_id
        self._write(data)
        return data["action_map"]

    def render(self, body: str, variables: dict[str, Any]) -> str:
        return _render(body, variables)
