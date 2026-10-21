"""Linear provider: fetch issues assigned to me via GraphQL."""

from __future__ import annotations

import httpx

LINEAR_GRAPHQL = "https://api.linear.app/graphql"

QUERY = """
query AssignedIssues {
  viewer {
    id
    name
    assignedIssues(filter: { state: { type: { nin: ["completed", "canceled", "duplicate"] } } }) {
      nodes {
        id
        identifier
        title
        description
        url
        priority
        updatedAt
        dueDate
        state { name type }
        team { key name }
        labels { nodes { name } }
        parent { identifier title url }
        children { nodes { identifier title url } }
        attachments { nodes { title url } }
      }
    }
  }
}
"""

PRIORITY_MAP = {
    0: 4,  # No priority
    1: 3,  # Urgent → but Linear uses 1=Urgent
    2: 1,  # High
    3: 2,  # Medium
    4: 3,  # Low
}
# Linear priority enum: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low


def fetch_issues(api_key: str) -> list[dict]:
    """Return normalized issue dicts assigned to the viewer."""
    headers = {"Authorization": api_key, "Content-Type": "application/json"}
    with httpx.Client(timeout=30) as client:
        resp = client.post(LINEAR_GRAPHQL, json={"query": QUERY}, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    viewer = data.get("data", {}).get("viewer")
    if not viewer:
        errors = data.get("errors")
        raise RuntimeError(f"Linear API error: {errors}")

    issues = []
    for node in viewer.get("assignedIssues", {}).get("nodes", []):
        priority_raw = node.get("priority", 0)

        parent = node.get("parent")
        children = node.get("children", {}).get("nodes", [])

        # GitHub links come from attachments with github.com URLs
        github_links = [
            {"title": a["title"], "url": a["url"]}
            for a in node.get("attachments", {}).get("nodes", [])
            if "github.com" in (a.get("url") or "")
        ]

        issues.append(
            {
                "id": f"linear:{node['identifier']}",
                "source": "linear",
                "external_id": node["id"],
                "identifier": node["identifier"],
                "title": node["title"],
                "url": node["url"],
                "body_excerpt": (node.get("description") or "")[:500],
                "priority_raw": priority_raw,
                "priority": PRIORITY_MAP.get(priority_raw, 2),
                "due_date": node.get("dueDate"),
                "updated_at": node.get("updatedAt"),
                "assignee": viewer.get("name"),
                "team": node.get("team", {}).get("key") if node.get("team") else None,
                "labels": [l["name"] for l in node.get("labels", {}).get("nodes", [])],
                "state": node.get("state", {}).get("name") if node.get("state") else None,
                "is_subticket": bool(parent),
                "parent": (
                    {"identifier": parent["identifier"], "title": parent["title"], "url": parent["url"]}
                    if parent else None
                ),
                "subtickets": [
                    {"identifier": c["identifier"], "title": c["title"], "url": c["url"]}
                    for c in children
                ],
                "github_links": github_links,
            }
        )
    return issues
