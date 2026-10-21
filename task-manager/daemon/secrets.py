"""Secrets are stored in Canvas agent-server, not locally.

The daemon is stateless: it receives secret values via request headers
(X-Linear-Key, X-GitHub-Key, X-Posthog-Key) from the frontend, which
reads them from Canvas via host.agentServer.request().

This module just provides the header names and a mask helper.
"""

LINEAR_HEADER = "X-Linear-Key"
GITHUB_HEADER = "X-GitHub-Key"
POSTHOG_HEADER = "X-Posthog-Key"

# Canvas secret names (what the frontend stores/retrieves in Canvas)
CANVAS_SECRET_NAMES = {
    "linear": "LINEAR_API_KEY",
    "github": "GITHUB_PERSONAL_ACCESS_TOKEN",
    "posthog": "POSTHOG_API_KEY",
}


def mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "…"
    return value[:4] + "…" + value[-4:]
