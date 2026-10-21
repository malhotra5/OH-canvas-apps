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
                    "applies_to": ["linear", "github-issue"],
                    "body": (
                        "Resolve {{title}} ({{url}}).\n"
                        "Investigate the issue, implement a fix, and open a pull request.\n\n"
                        "Context:\n{{body}}"
                    ),
                },
                {
                    "id": "address-review",
                    "title": "Address review",
                    "applies_to": ["github-review"],
                    "body": (
                        "Address the pending review on {{url}}.\n\n"
                        "Repo: {{repo}} PR #{{identifier}}.\n"
                        "Read each review comment, fix or reply, and push to the existing branch."
                    ),
                },
                {
                    "id": "triage",
                    "title": "Triage",
                    "applies_to": ["linear", "github-issue", "github-review"],
                    "body": (
                        "Investigate {{title}} ({{url}}) and report findings only.\n"
                        "Do not implement yet."
                    ),
                },
            ],
        }
    ],
    "active_set_id": "default",
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

    def add_template(self, set_id: str, title: str, body: str, applies_to: list[str] | None = None) -> dict | None:
        data = self._read()
        for s in data.get("sets", []):
            if s["id"] == set_id:
                tmpl = {
                    "id": uuid.uuid4().hex[:8],
                    "title": title,
                    "applies_to": applies_to or [],
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
                        for k in ("title", "body", "applies_to"):
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

    def render(self, body: str, variables: dict[str, Any]) -> str:
        return _render(body, variables)
