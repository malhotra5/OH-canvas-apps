"""GitHub provider: assigned issues, pending reviews, and open PRs with CI/reviewer info."""

from __future__ import annotations

import httpx
import re

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

# Closing keywords per GitHub's linked-issues spec, plus plain mentions.
# Match "closes #123", "Fixes: OWNER/REPO#456", "resolve #7" (case-insensitive).
_CLOSING_RE = re.compile(
    r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+"
    r"((?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#(\d+))",
    re.IGNORECASE,
)
# Bare " #123 " mentions that aren't preceded by a closing keyword
_MENTION_RE = re.compile(r"(?:^|[^\w/&-])((?:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#(\d+))", re.MULTILINE)


def _extract_issue_refs(body: str, repo: str) -> list[dict]:
    """Return unique issue refs from a PR body, tagged by whether they use closing keywords."""
    refs: dict[str, dict] = {}

    for match in _CLOSING_RE.finditer(body):
        ref, num = match.group(1), match.group(2)
        full = ref if "/" in ref else f"{repo}#{num}"
        refs[full] = {"ref": full, "number": num, "closes": True}

    for match in _MENTION_RE.finditer(body):
        ref, num = match.group(1), match.group(2)
        full = ref if "/" in ref else f"{repo}#{num}"
        if full not in refs:
            refs[full] = {"ref": full, "number": num, "closes": False}

    return list(refs.values())


PR_GRAPHQL = """
query($query: String!) {
  search(query: $query, type: ISSUE, first: 50) {
    edges {
      node {
        ... on PullRequest {
          number
          title
          url
          body
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
          reviewThreads(first: 50) {
            nodes { isResolved }
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
            body = item.get("body") or ""
            linked_issues = _extract_issue_refs(body, repo)
            reviews.append({
                "id": f"github-review:{repo}#{item['number']}",
                "source": "github-review",
                "external_id": str(item["id"]),
                "identifier": str(item["number"]),
                "title": item["title"],
                "url": item["html_url"],
                "body_excerpt": body[:500],
                "priority_raw": next((l for l in labels if l.lower() in LABEL_PRIORITY), None),
                "priority": _priority_from_labels(labels),
                "due_date": None,
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "assignee": username,
                "repo": repo,
                "labels": labels,
                "state": item.get("state"),
                "linked_issues": linked_issues,
            })

        # Cross-reference linked issues against fetched GitHub issues to
        # populate priority + title for each review's linked issue
        issue_map: dict[str, dict] = {}
        for iss in issues:
            issue_map[f"{iss['repo']}#{iss['identifier']}"] = iss
            # Also index by bare #number for same-repo refs
            issue_map[iss["identifier"]] = iss

        # Fetch linked issues not in the issue_map directly from the API
        missing_refs: dict[str, list[dict]] = {}
        for rev in reviews:
            for ref in rev.get("linked_issues", []):
                if ref["ref"] not in issue_map and ref["number"] not in issue_map:
                    missing_refs.setdefault(ref["ref"], []).append(ref)

        for ref_str, refs in missing_refs.items():
            # ref_str is like "Owner/repo#123" or "repo#123"
            try:
                repo_part = ref_str.split("#")[0]
                num = ref_str.split("#")[1]
                issue_data = _rest_get(client, token, f"/repos/{repo_part}/issues/{num}")
                labels = [l["name"] for l in issue_data.get("labels", [])]
                for ref in refs:
                    ref["title"] = issue_data["title"]
                    ref["url"] = issue_data["html_url"]
                    ref["priority"] = _priority_from_labels(labels)
                    ref["priority_raw"] = next((l for l in labels if l.lower() in LABEL_PRIORITY), None)
            except Exception:
                pass  # leave unresolved refs as-is

        for rev in reviews:
            for ref in rev.get("linked_issues", []):
                linked = issue_map.get(ref["ref"]) or issue_map.get(ref["number"]) or ref
                if "priority" in linked and linked.get("priority") is not None:
                    ref["title"] = linked.get("title", ref.get("title"))
                    ref["url"] = linked.get("url", ref.get("url"))
                    ref["priority"] = linked["priority"]
                    ref["priority_raw"] = linked.get("priority_raw")
                    # Best (lowest = most urgent) linked-issue priority becomes the review's sort priority
                    rev_p = rev.get("linked_issue_priority")
                    linked_p = linked["priority"]
                    rev["linked_issue_priority"] = min(rev_p, linked_p) if rev_p is not None else linked_p

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

            # CI status from last commit (statusCheckRollup is null when no checks are configured)
            commits = pr.get("commits", {}).get("nodes", [])
            ci_state = None
            if commits:
                rollup = (commits[-1].get("commit") or {}).get("statusCheckRollup")
                ci_state = rollup.get("state") if rollup else None

            # Reviewers: pending requests + completed reviews
            # (requestedReviewer/author are null for deleted users/bots)
            requested = []
            for node in pr.get("reviewRequests", {}).get("nodes", []):
                reviewer = node.get("requestedReviewer") or {}
                requested.append(reviewer.get("login") or reviewer.get("name") or "unknown")

            completed_reviews = []
            for node in pr.get("reviews", {}).get("nodes", []):
                completed_reviews.append({
                    "author": (node.get("author") or {}).get("login", "unknown"),
                    "state": node.get("state"),
                })

            # Unresolved review comment threads
            threads = (pr.get("reviewThreads") or {}).get("nodes", [])
            unresolved_count = sum(1 for t in threads if not t.get("isResolved"))

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

            # Extract issue references from the PR body via GitHub's closing
            # keywords (closes/fixes/resolves #N or OWNER/REPO#N), plus bare #N mentions
            body = pr.get("body") or ""
            linked_issues = _extract_issue_refs(body, repo)

            prs.append({
                "id": f"github-pr:{repo}#{number}",
                "source": "github-pr",
                "external_id": str(number),
                "identifier": str(number),
                "title": pr["title"],
                "url": pr["url"],
                "body_excerpt": body[:500],
                "linked_issues": linked_issues,
                "priority": 2,
                "due_date": None,
                "created_at": pr.get("createdAt"),
                "updated_at": pr.get("updatedAt"),
                "assignee": username,
                "repo": repo,
                "labels": [],
                "state": pr.get("isDraft") and "draft" or "open",
                "ci_status": (ci_state or "NO_CHECKS").lower(),
                "review_status": review_status,
                "unresolved_threads": unresolved_count,
                "reviewers_requested": requested,
                "reviewers_completed": completed_reviews,
            })

    return prs


def fetch_all(token: str, username: str | None = None) -> list[dict]:
    """Fetch all items: issues, reviews, and enriched PRs."""
    issues, reviews = fetch_issues_and_reviews(token, username)
    prs = fetch_prs(token, username)
    return issues + reviews + prs
