"""GitHub provider: assigned issues + pending reviews in the openhands/ org."""

from __future__ import annotations

import httpx

GITHUB_API = "https://api.github.com/graphql"
ORG = "openhands"

# Priority label → rank
LABEL_PRIORITY = {
    "p0": 0, "priority: urgent": 0, "priority: critical": 0,
    "p1": 1, "priority: high": 1,
    "p2": 3, "priority: low": 3,
    "p3": 4, "priority: backlog": 4,
}

QUERY_ISSUES = """
query($login: String!) {
  user(login: $login) {
    assignedIssues: issuesAssigned(first: 50, filterBy: {assignee: $login}) {
      ... on IssueConnection {
        nodes {
          number
          title
          url
          body
          updatedAt
          repository { nameWithOwner }
          labels(first: 10) { nodes { name } }
        }
      }
    }
  }
}
"""

# GitHub REST for review requests is simpler and more reliable
ISSUES_QUERY_REST = "/search/issues?q=assignee:{user}+org:{org}+is:open+type:issue&per_page=50"
REVIEWS_QUERY_REST = "/search/issues?q=review-requested:{user}+org:{org}+is:open+type:pr&per_page=50"
PR_QUERY_REST = "/search/issues?q=author:{user}+org:{org}+is:open+type:pr&per_page=50"


def _priority_from_labels(labels: list[str]) -> int:
    for label in labels:
        key = label.lower().strip()
        if key in LABEL_PRIORITY:
            return LABEL_PRIORITY[key]
    return 2  # Medium default


def _rest_get(client: httpx.Client, token: str, path: str) -> dict:
    resp = client.get(
        f"https://api.github.com{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    resp.raise_for_status()
    return resp.json()


def fetch_all(token: str, username: str | None = None) -> list[dict]:
    """Fetch assigned issues, pending reviews, and open PRs for a user in the org.

    If username is not provided, the authenticated user is resolved via /user.
    """
    with httpx.Client(timeout=30) as client:
        if not username:
            user_resp = client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
            user_resp.raise_for_status()
            username = user_resp.json()["login"]

        items: list[dict] = []

        # Assigned issues
        issues_data = _rest_get(client, token, ISSUES_QUERY_REST.format(user=username, org=ORG))
        for item in issues_data.get("items", []):
            repo = item.get("repository_url", "").split("repos/")[-1]
            labels = [l["name"] for l in item.get("labels", [])]
            items.append(
                {
                    "id": f"github-issue:{repo}#{item['number']}",
                    "source": "github-issue",
                    "external_id": str(item["id"]),
                    "identifier": str(item["number"]),
                    "title": item["title"],
                    "url": item["html_url"],
                    "body_excerpt": (item.get("body") or "")[:500],
                    "priority_raw": next((l for l in labels if l.lower() in LABEL_PRIORITY), None),
                    "priority": _priority_from_labels(labels),
                    "due_date": None,
                    "updated_at": item.get("updated_at"),
                    "assignee": username,
                    "repo": repo,
                    "labels": labels,
                    "state": item.get("state"),
                }
            )

        # Pending reviews
        reviews_data = _rest_get(client, token, REVIEWS_QUERY_REST.format(user=username, org=ORG))
        for item in reviews_data.get("items", []):
            repo = item.get("repository_url", "").split("repos/")[-1]
            labels = [l["name"] for l in item.get("labels", [])]
            items.append(
                {
                    "id": f"github-review:{repo}#{item['number']}",
                    "source": "github-review",
                    "external_id": str(item["id"]),
                    "identifier": str(item["number"]),
                    "title": item["title"],
                    "url": item["html_url"],
                    "body_excerpt": (item.get("body") or "")[:500],
                    "priority_raw": next((l for l in labels if l.lower() in LABEL_PRIORITY), None),
                    "priority": _priority_from_labels(labels),
                    "due_date": None,
                    "updated_at": item.get("updated_at"),
                    "assignee": username,
                    "repo": repo,
                    "labels": labels,
                    "state": item.get("state"),
                }
            )

        # Open PRs authored by me (informational, displayed alongside)
        prs_data = _rest_get(client, token, PR_QUERY_REST.format(user=username, org=ORG))
        for item in prs_data.get("items", []):
            repo = item.get("repository_url", "").split("repos/")[-1]
            labels = [l["name"] for l in item.get("labels", [])]
            items.append(
                {
                    "id": f"github-pr:{repo}#{item['number']}",
                    "source": "github-pr",
                    "external_id": str(item["id"]),
                    "identifier": str(item["number"]),
                    "title": item["title"],
                    "url": item["html_url"],
                    "body_excerpt": (item.get("body") or "")[:500],
                    "priority_raw": next((l for l in labels if l.lower() in LABEL_PRIORITY), None),
                    "priority": _priority_from_labels(labels),
                    "due_date": None,
                    "updated_at": item.get("updated_at"),
                    "assignee": username,
                    "repo": repo,
                    "labels": labels,
                    "state": item.get("state"),
                }
            )

    return items
