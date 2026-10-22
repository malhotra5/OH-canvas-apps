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
                    "id": "investigate",
                    "title": "Investigate",
                    "body": (
                        "Investigate {{title}} ({{url}}) and report findings only — do not "
                        "implement changes yet.\n\n"
                        "Source: {{source}}\n"
                        "Identifier: {{identifier}}\n"
                        "State: {{state}}\n"
                        "Repo/Team: {{repo}}\n\n"
                        "Steps:\n"
                        "1. Read the issue/ticket body carefully (below) and identify the core "
                        "problem or request.\n"
                        "2. If this is a GitHub issue, check for any linked PRs, related issues, "
                        "or project context. If it's a Linear ticket, check for sub-issues, "
                        "parent context, and any GitHub links.\n"
                        "3. Explore the relevant codebase to understand what would need to change "
                        "and estimate the scope of work.\n"
                        "4. Report: a summary of the issue, what you found in the codebase, the "
                        "suggested approach, and a rough effort estimate.\n\n"
                        "Issue/ticket body:\n{{body}}"
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
                    "id": "resolve-conflicts",
                    "title": "Resolve merge conflicts",
                    "body": (
                        "PR #{{identifier}} ({{url}}: \"{{title}}\") in {{repo}} has merge "
                        "conflicts against its base branch.\n\n"
                        "Steps:\n"
                        "1. Check out the PR branch locally (or use `gh pr checkout {{identifier}}`).\n"
                        "2. Fetch and merge the base branch (usually `main`) into the PR branch.\n"
                        "3. For each conflicting file, resolve the conflict by keeping the correct "
                        "changes from both sides. Prefer the intent of the PR unless the base branch "
                        "introduced a breaking change that must be accommodated.\n"
                        "4. Run the test suite (if one exists) to make sure the resolution didn't "
                        "break anything.\n"
                        "5. Commit the merge resolution and push.\n"
                        "6. Verify via `gh pr view {{identifier}} --json mergeable` that the PR is "
                        "now mergeable.\n\n"
                        "PR description for context:\n{{body}}\n\n"
                        "Report: which files conflicted, how each was resolved, test results, and "
                        "the final mergeable state."
                    ),
                },
                {
                    "id": "prompt-helper",
                    "title": "Prompt helper",
                    "body": (
                        "You are a prompt engineering helper for a personal task manager app "
                        "that runs inside OpenHands Agent Canvas.\n\n"
                        "## What the app does\n\n"
                        "The app fetches Linear issues, GitHub issues, pending reviews, and "
                        "open PRs (with CI status, mergeable state, and reviewer info) for the "
                        "user. It displays them in lists and a kanban board, and lets the user "
                        "dispatch OpenHands agent conversations to work on tickets/PRs.\n\n"
                        "## How prompts work\n\n"
                        "The app has prompt *sets*, each containing *templates*. A template is:\n"
                        "  - id:      unique identifier (e.g. 'fix-issue', 'address-review')\n"
                        "  - title:   short display name\n"
                        "  - body:    the prompt text sent to the agent. Supports {{variable}} "
                        "placeholders that are replaced at dispatch time.\n\n"
                        "Available variables: {{title}}, {{url}}, {{repo}}, {{identifier}}, "
                        "{{body}}, {{source}}, {{state}}. Additional variables may be passed "
                        "per-action (e.g. {{tracker}} for create-ticket, {{count_phrase}} for "
                        "resolve-threads).\n\n"
                        "## How actions work\n\n"
                        "An *action* is a button that appears on a row (PR, review, or "
                        "task/issue) when a condition is met. The app's current actions:\n"
                        "  - create-ticket:      shown when a PR has no linked issue\n"
                        "  - fix-ci:             shown when CI is failing\n"
                        "  - resolve-threads:    shown when there are unresolved review threads\n"
                        "  - resolve-conflicts:  shown when the PR has merge conflicts\n"
                        "  - guided-review:      shown on pending review rows\n"
                        "  - auto-review:        shown on pending review rows\n"
                        "  - investigate:        shown on task/issue rows\n"
                        "  - fix-issue:          shown on task/issue rows\n"
                        "  - prompt-helper:      launched from the Settings tab\n\n"
                        "Each action is mapped to a template via an *action_map* "
                        "(action_key → template_id). When the button is clicked, the mapped "
                        "template's body is rendered with variables and sent to a new OpenHands "
                        "conversation. Each action can also be mapped to a specific *agent "
                        "profile* via a *profile_map* (action_key → profile_id).\n\n"
                        "## Adding a new prompt + action\n\n"
                        "When the user wants to add a new prompt, you should also guide them "
                        "through adding the corresponding action so the prompt is usable:\n\n"
                        "1. Choose a template id and title (e.g. 'address-review', 'Address "
                        "review').\n"
                        "2. Write the body using {{variables}} available at dispatch time. "
                        "Include enough context about what the agent should do, what repo/PR "
                        "to work on (use {{repo}}, {{identifier}}, {{url}}), and what the "
                        "expected outcome is.\n"
                        "3. Choose an action key (e.g. 'address-review'). This key is used in "
                        "the action_map and, if the action should appear as a button on PR "
                        "rows, in the ACTIONS constant in extension.js.\n"
                        "4. Add the action to the action_map: action_key → template_id.\n"
                        "5. Optionally set a profile_map entry for the action.\n"
                        "6. If the action should appear as a button on a row, add it to the "
                        "ACTIONS array in extension.js with a label, description, and a "
                        "condition under which it appears. Then add the button-rendering logic "
                        "in the relevant row function (prRow, reviewRow, or taskRow). All row "
                        "types use the shared createActionContainer() helper — call "
                        "act.addButton({ key, label, okText, ... }) to add a button that "
                        "automatically dispatches, tracks, and persists the conversation.\n\n"
                        "Templates do NOT have an 'applies to' or 'source filter' field. Which "
                        "item types an action applies to is determined entirely by the "
                        "condition check in the row function (prRow, reviewRow, or taskRow), "
                        "not by anything in the template.\n\n"
                        "## Current prompt sets and templates\n\n"
                        "{{sets_json}}\n\n"
                        "## Your job\n\n"
                        "Ask me what kind of prompt I want to create or improve. Help me draft "
                        "the body text, choose a good id/title, and figure out the action "
                        "mapping. When we're happy, give me the final template in JSON format "
                        "(id, title, body) AND the action_map/profile_map entries needed to "
                        "wire it up. If a new button should appear on a row, also give me "
                        "the ACTIONS entry and the act.addButton() call for the relevant row "
                        "function (prRow, reviewRow, or taskRow)."
                    ),
                },
                {
                    "id": "guided-review",
                    "title": "Guided PR walkthrough",
                    "body": (
                        "I want you to walk me through {{repo}} PR #{{identifier}} "
                        "({{url}}: \"{{title}}\") so I can review it myself with full clarity. "
                        "Do NOT post anything to GitHub and do NOT modify any code - this is a "
                        "guided, interactive review for me.\n\n"
                        "Preparation:\n"
                        "1. Fetch the PR details, the full diff, and the PR description (given "
                        "below for context):\n{{body}}\n"
                        "2. Find the linked ticket: look for a closing keyword (\"Closes #N\" or a "
                        "Linear URL) in the PR description or the PR's linked issues. If it's a "
                        "GitHub issue, read it; if it's Linear, fetch it via the LINEAR_API_KEY. "
                        "If there is no linked ticket, say so and reconstruct the intent from the "
                        "PR description alone.\n"
                        "3. Check out the PR locally (`gh pr checkout {{identifier}}`) if needed to "
                        "understand the code in full context.\n\n"
                        "Then walk me through it step by step:\n"
                        "- Start with the ticket: what problem is being solved and why.\n"
                        "- Then the approach: the high-level design of the change and why this "
                        "route was taken over alternatives.\n"
                        "- Then the implementation, file by file / commit by commit in logical "
                        "order: for each significant change, explain what it does, how it works, "
                        "and how it connects back to the ticket.\n"
                        "- Call out anything non-obvious: tricky logic, edge cases handled (or "
                        "missed), new dependencies, and changes that look unrelated to the stated "
                        "goal.\n\n"
                        "Finish with an assessment:\n"
                        "- Pros: what this implementation does well.\n"
                        "- Cons / risks: bugs, design concerns, maintainability or performance "
                        "issues, test coverage gaps.\n"
                        "- Open questions I should ask the author, and what you would want "
                        "verified before approving.\n\n"
                        "After presenting all of this, stop and wait. I will ask follow-up "
                        "questions, request deeper dives into specific files, or tell you how to "
                        "proceed. Only act further (comments, changes, posting) when I explicitly "
                        "ask."
                    ),
                },
                {
                    "id": "auto-review",
                    "title": "Autonomous PR review",
                    "body": (
                        "Perform a code review of {{repo}} PR #{{identifier}} "
                        "({{url}}: \"{{title}}\") and post the results directly on the GitHub PR. "
                        "Do not modify the PR's code - review only.\n\n"
                        "Context (PR description):\n{{body}}\n\n"
                        "Steps:\n"
                        "1. Fetch the PR details and the full diff via the GitHub API or "
                        "`gh pr diff {{identifier}} --repo {{repo}}`. Also read the linked ticket "
                        "(via closing keywords or linked issues) to understand the intended "
                        "behavior.\n"
                        "2. Review the changes for:\n"
                        "   - Correctness: bugs, logic errors, edge cases, error handling.\n"
                        "   - Security: injection, secrets, unsafe input handling, permission "
                        "issues.\n"
                        "   - Design and maintainability: unnecessary complexity, duplication, "
                        "misleading names.\n"
                        "   - Tests: are the changed paths actually tested, and are the tests "
                        "meaningful (not just mocks of the code under test)?\n"
                        "   - Compatibility: breaking changes to public APIs or existing "
                        "behavior.\n"
                        "3. Use the PR's CI results as evidence - do not flag issues that CI "
                        "already proves are fine, and do not claim something is broken without "
                        "checking the logs if CI covers it.\n"
                        "4. Post the review on GitHub: a summary review (approve if clean, "
                        "request changes if there are blocking issues, comment otherwise) plus "
                        "inline comments on the specific lines, each with file + line context and "
                        "a concrete suggested fix where applicable.\n"
                        "5. Only report real, material issues - do not pad with nitpicks or "
                        "style comments that linters/CI would catch.\n\n"
                        "Report at the end: the review verdict you posted, a list of the inline "
                        "comments (file:line + one-line summary each), and a link to the review "
                        "on GitHub."
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
        "resolve-conflicts": "resolve-conflicts",
        "prompt-helper": "prompt-helper",
        "guided-review": "guided-review",
        "auto-review": "auto-review",
        "investigate": "investigate",
        "fix-issue": "fix-issue",
    },
    # action -> agent profile id (empty string = use the account's active profile)
    "profile_map": {
        "create-ticket": "",
        "fix-ci": "",
        "resolve-threads": "",
        "resolve-conflicts": "",
        "prompt-helper": "",
        "guided-review": "",
        "auto-review": "",
        "investigate": "",
        "fix-issue": "",
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
        # (user edits win — only adds templates whose ids don't exist yet AND
        #  weren't explicitly deleted by the user)
        try:
            data = json.loads(self.path.read_text())
        except json.JSONDecodeError:
            return
        changed = False
        deleted_ids = set(data.get("deleted_templates", []))
        default_by_id = {t["id"]: t for t in DEFAULT_SETS["sets"][0]["templates"]}
        for s in data.get("sets", []):
            existing_ids = {t.get("id") for t in s.get("templates", [])}
            for tid, tmpl in default_by_id.items():
                if tid not in existing_ids and tid not in deleted_ids:
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
        # Merge profile_map defaults for actions not yet mapped
        if "profile_map" not in data:
            data["profile_map"] = json.loads(json.dumps(DEFAULT_SETS["profile_map"]))
            changed = True
        else:
            for action, pid in DEFAULT_SETS["profile_map"].items():
                if action not in data["profile_map"]:
                    data["profile_map"][action] = pid
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
                    # Record the deletion so the migration logic doesn't re-add it
                    deleted = set(data.get("deleted_templates", []))
                    deleted.add(template_id)
                    data["deleted_templates"] = sorted(deleted)
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

    def get_profile_map(self) -> dict:
        return self._read().get("profile_map", {})

    def set_action_profile(self, action: str, profile_id: str) -> dict:
        data = self._read()
        data.setdefault("profile_map", {})[action] = profile_id
        self._write(data)
        return data["profile_map"]

    def render(self, body: str, variables: dict[str, Any]) -> str:
        return _render(body, variables)
