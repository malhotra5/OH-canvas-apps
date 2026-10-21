"""Key store: API keys persisted in a 0600 JSON file outside the repo."""

from __future__ import annotations

import json
import os
from pathlib import Path

KEY_NAMES = ("linear", "github", "posthog")


class KeyStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = data_dir / "keys.json"
        self._ensure()

    def _ensure(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({})
        self._lock_perms()

    def _lock_perms(self) -> None:
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def _read(self) -> dict[str, str]:
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _write(self, keys: dict[str, str]) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(keys, indent=2))
        os.replace(tmp, self.path)
        self._lock_perms()

    def set_keys(self, updates: dict[str, str]) -> None:
        keys = self._read()
        for name in KEY_NAMES:
            if name in updates and updates[name]:
                keys[name] = updates[name].strip()
        self._write(keys)

    def get(self, name: str) -> str | None:
        return self._read().get(name)

    def status(self) -> dict[str, dict]:
        keys = self._read()
        result: dict[str, dict] = {}
        for name in KEY_NAMES:
            val = keys.get(name)
            if val:
                masked = val[:4] + "…" + val[-4:] if len(val) > 8 else "…"
                result[name] = {"connected": True, "masked": masked}
            else:
                result[name] = {"connected": False, "masked": None}
        return result
