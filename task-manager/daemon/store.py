"""Atomic JSON state store for dispatch info, linked PRs, and history."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StateStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = data_dir / "state.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({})

    def _read(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _write(self, data: dict) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, default=str))
        os.replace(tmp, self.path)

    def get_all(self) -> dict:
        return self._read()

    def get_dispatch(self, item_id: str) -> dict | None:
        return self._read().get("dispatches", {}).get(item_id)

    def set_dispatch(self, item_id: str, dispatch: dict) -> dict:
        data = self._read()
        dispatches = data.setdefault("dispatches", {})
        existing = dispatches.get(item_id, {})
        # Starting a new action for this item: append to the action history
        if dispatch.get("action") and dispatch["action"] != existing.get("action"):
            history = existing.setdefault("action_history", [])
            history.append({
                "action": dispatch["action"],
                "conversation_id": dispatch.get("conversation_id", ""),
                "conversation_url": dispatch.get("conversation_url"),
                "status": dispatch.get("status", "running"),
                "started_at": _now(),
            })
        existing.update(dispatch)
        existing["last_checked_at"] = _now()
        dispatches[item_id] = existing
        self._write(data)
        return existing

    def append_history(self, item_id: str, event: str, detail: str = "") -> None:
        data = self._read()
        dispatches = data.setdefault("dispatches", {})
        entry = dispatches.setdefault(item_id, {})
        history = entry.setdefault("history", [])
        history.append({"at": _now(), "event": event, "detail": detail})
        self._write(data)

    def add_linked_pr(self, item_id: str, repo: str, number: int, url: str, state: str = "open") -> None:
        data = self._read()
        dispatches = data.setdefault("dispatches", {})
        entry = dispatches.setdefault(item_id, {})
        prs = entry.setdefault("linked_prs", [])
        # dedupe by repo+number
        for pr in prs:
            if pr["repo"] == repo and pr["number"] == number:
                pr["state"] = state
                pr["url"] = url
                self._write(data)
                return
        prs.append({"repo": repo, "number": number, "url": url, "state": state})
        self._write(data)

    def get_running(self) -> dict[str, str]:
        """Return {item_id: conversation_id} for all dispatches still running."""
        data = self._read()
        out = {}
        for item_id, d in data.get("dispatches", {}).items():
            if d.get("status") == "running" and d.get("conversation_id"):
                out[item_id] = d["conversation_id"]
            for h in d.get("action_history", []):
                if h.get("status") == "running" and h.get("conversation_id"):
                    out[f"{item_id}::history::{h['conversation_id']}"] = h["conversation_id"]
        return out

    def update_status(self, item_id: str, conversation_id: str, new_status: str) -> None:
        """Update the status of a dispatch and matching action_history entry by conversation_id."""
        data = self._read()
        dispatches = data.get("dispatches", {})
        actual_item_id = item_id.split("::history::")[0] if "::history::" in item_id else item_id
        entry = dispatches.get(actual_item_id)
        if not entry:
            return
        changed = False
        if entry.get("conversation_id") == conversation_id and entry.get("status") != new_status:
            entry["status"] = new_status
            entry["last_checked_at"] = _now()
            changed = True
        for h in entry.get("action_history", []):
            if h.get("conversation_id") == conversation_id and h.get("status") != new_status:
                h["status"] = new_status
                changed = True
        if changed:
            self._write(data)
