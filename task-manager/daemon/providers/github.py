"""GitHub provider: assigned issues, pending reviews, and open PRs with CI/reviewer info."""

from __future__ import annotations

import httpx

GITHUB_API = "https://api.github.com/graphql"
GITHUB_REST = "https://api.github.com"
ORG = "openhands"

LABEL_PRIORITY = {
    "p0": 0, "priority: urgent": 0, "priority: critical": 0,
    "p1": 1, "priority: high": 1,
    "p2": 3, "priority: low": 3,
    "p3": 4, "priority: backlog": 4,
}

ISSUES_QUERY_REST = "/search/issues?q=assignee:{user}+org:{org}+is:open+type:issue&per_page=50"
REVIEWS_QUERY_REST = "/search/issues?q=review-requested:{user}+org:{org}+is:open+type:pr&per_page=50"

PR_GRAPHQL = """
query($query: String!) {
  search(query: $query, type: ISSUE, first: 50) {
    edges {
      node {
        ... on PullRequest {
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          repository { nameWithOwner }
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                ... on User { login }
                ... on Team { name }
              }
            }
          }
          reviews(first: 20) {
            nodes { author { login } state }
          }
          commits(last: 1) {
            nodes {
              commit {
                oid
                statusCheckRollup { state }
              }
            }
          }
        }
      }
    }
  }
}
"""


def _priority_from_labels(labels: list[str]) -> int:
    for label in labels:
        key = label.lower().strip()
        if key in LABEL_PRIORITY:
            return LABEL_PRIORITY[key]
    return 2


def _rest_get(client: httpx.Client, token: str, path: str) -> dict:
    resp = client.get(
        f"{GITHUB_REST}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    resp.raise_for_status()
    return resp.json()


def _graphql(client: httpx.Client, token: str, query: str, variables: dict) -> dict:
    resp = client.post(
        GITHUB_API,
        json={"query": query, "variables": variables},
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    resp.raise_for_status()
    return resp.json().get("data", {})


def _resolve_user(client: httpx.Client, token: str) -> str:
    resp = client.get(
        f"{GITHUB_REST}/user",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    resp.raise_for_status()
    return resp.json()["login"]


def fetch_issues_and_reviews(token: str, username: str | None = None) -> tuple[list[dict], list[dict]]:
    """Fetch assigned issues and pending reviews via REST. Returns (issues, reviews)."""
    with httpx.Client(timeout=30) as client:
        if not username:
            username = _resolve_user(client, token)

        issues: list[dict] = []
        reviews: list[dict] = []

        issues_data = _rest_get(client, token, ISSUES_QUERY_REST.format(user=username, org=ORG))
        for item in issues_data.get("items", []):
            repo = item.get("repository_url", "").split("repos/")[-1]
            labels = [l["name"] for l in item.get("labels", [])]
            issues.append({
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
            })

        reviews_data = _rest_get(client, token, REVIEWS_QUERY_REST.format(user=username, org=ORG))
        for item in reviews_data.get("items", []):
            repo = item.get("repository_url", "").split("repos/")[-1]
            labels = [l["name"] for l in item.get("labels", [])]
            reviews.append({
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
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "assignee": username,
                "repo": repo,
                "labels": labels,
                "state": item.get("state"),
            })

    return issues, reviews


def fetch_prs(token: str, username: str | None = None) -> list[dict]:
    """Fetch open PRs authored by the user via GraphQL, including CI status and reviewer info."""
    with httpx.Client(timeout=30) as client:
        if not username:
            username = _resolve_user(client, token)

        query_string = f"author:{username} org:{ORG} is:open sort:updated-desc"
        data = _graphql(client, token, PR_GRAPHQL, {"query": query_string})

        prs: list[dict] = []
        for edge in data.get("search", {}).get("edges", []):
            pr = edge.get("node")
            if not pr:
                continue

            repo = pr.get("repository", {}).get("nameWithOwner", "")
            number = pr["number"]

            # CI status from last commit
            commits = pr.get("commits", {}).get("nodes", [])
            ci_state = None
            if commits:
                ci_state = commits[-1].get("commit", {}).get("statusCheckRollup", {}).get("state")

            # Reviewers: pending requests + completed reviews
            requested = []
            for node in pr.get("reviewRequests", {}).get("nodes", []):
                reviewer = node.get("requestedReviewer", {})
                requested.append(reviewer.get("login") or reviewer.get("name") or "unknown")

            completed_reviews = []
            for node in pr.get("reviews", {}).get("nodes", []):
                completed_reviews.append({
                    "author": node.get("author", {}).get("login", "unknown"),
                    "state": node.get("state"),
                })

            # Determine review status
            if requested:
                review_status = "re-requested"
            elif any(r["state"] == "CHANGES_REQUESTED" for r in completed_reviews):
                review_status = "changes_requested"
            elif any(r["state"] == "APPROVED" for r in completed_reviews):
                review_status = "approved"
            elif completed_reviews:
                review_status = "reviewed"
            else:
                review_status = "no_reviews"

            prs.append({
                "id": f"github-pr:{repo}#{number}",
                "source": "github-pr",
                "external_id": str(number),
                "identifier": str(number),
                "title": pr["title"],
                "url": pr["url"],
                "body_excerpt": "",
                "priority": 2,
                "due_date": None,
                "created_at": pr.get("createdAt"),
                "updated_at": pr.get("updatedAt"),
                "assignee": username,
                "repo": repo,
                "labels": [],
                "state": pr.get("isDraft") and "draft" or "open",
                "ci_status": (ci_state or "PENDING").lower(),
                "review_status": review_status,
                "reviewers_requested": requested,
                "reviewers_completed": completed_reviews,
            })

    return prs


def fetch_all(token: str, username: str | None = None) -> list[dict]:
    """Fetch all items: issues, reviews, and enriched PRs."""
    issues, reviews = fetch_issues_and_reviews(token, username)
    prs = fetch_prs(token, username)
    return issues + reviews + prs
