"""Verify Jira Cloud access for Cerberus.

Tries, in order:
  1. Scoped token against the api.atlassian.com gateway (needs JIRA_CLOUD_ID).
  2. Classic token against the site URL.

Then exercises the exact Phase 4 shape: create a P1 Bug with an ADF description,
comment on it, read it back, and delete it.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path = ROOT / ".env") -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def basic_auth(email: str, token: str) -> dict[str, str]:
    raw = base64.b64encode(f"{email}:{token}".encode()).decode()
    return {"Authorization": f"Basic {raw}", "Accept": "application/json"}


def candidates(env: dict[str, str]) -> list[tuple[str, str, dict[str, str]]]:
    site = env.get("ATLASSIAN_SITE_URL", "").rstrip("/")
    email = env.get("ATLASSIAN_EMAIL", "")
    scoped = env.get("JIRA_SCOPED_TOKEN", "")
    classic = env.get("JIRA_CLASSIC_TOKEN", "")
    api_token = env.get("JIRA_API_TOKEN", "")
    cloud_id = env.get("JIRA_CLOUD_ID", "")

    out: list[tuple[str, str, dict[str, str]]] = []
    if cloud_id and scoped:
        out.append(
            (
                "scoped-gateway",
                f"https://api.atlassian.com/ex/jira/{cloud_id}",
                {"Authorization": f"Bearer {scoped}", "Accept": "application/json"},
            )
        )
    if api_token and site:
        out.append(("api-token-site", site, basic_auth(email, api_token)))
    if classic:
        out.append(("classic-site", site, basic_auth(email, classic)))
    if scoped and site:
        out.append(("scoped-site", site, basic_auth(email, scoped)))
    return out


ADF_BODY = {
    "type": "doc",
    "version": 1,
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Cerberus connectivity probe. Safe to delete."}],
        }
    ],
}


def probe(label: str, base: str, headers: dict[str, str]) -> httpx.Client | None:
    try:
        client = httpx.Client(base_url=base, headers=headers, timeout=30.0)
        response = client.get("/rest/api/3/myself")
        if response.status_code == 200:
            data = response.json()
            print(f"[OK]   {label}: {base}")
            print(f"       account={data.get('emailAddress')} type={data.get('accountType')}")
            return client
        print(f"[FAIL] {label}: /myself -> {response.status_code} {response.text[:160]}")
        client.close()
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] {label}: {exc}")
    return None


def main() -> int:
    env = load_env()
    key = env.get("JIRA_PROJECT_KEY", "CERB")

    client = None
    for label, base, headers in candidates(env):
        client = probe(label, base, headers)
        if client:
            break
    if client is None:
        print("No working Jira credential found. Check .env.")
        return 1

    project = client.get(f"/rest/api/3/project/{key}")
    print(f"       project {key}: {project.status_code}")
    if project.status_code == 200:
        body = project.json()
        print(
            f"       id={body.get('id')} type={body.get('projectTypeKey')} "
            f"style={body.get('style')} lead={(body.get('lead') or {}).get('displayName')}"
        )

    types = client.get(f"/rest/api/3/issue/createmeta/{key}/issuetypes")
    if types.status_code == 200:
        names = [t["name"] for t in types.json().get("issueTypes", [])]
        print(f"       issue types: {', '.join(names)}")

    created = client.post(
        "/rest/api/3/issue",
        json={
            "fields": {
                "project": {"key": key},
                "issuetype": {"name": "Bug"},
                "summary": "Cerberus connectivity probe",
                "description": ADF_BODY,
                "labels": ["cerberus-probe"],
            }
        },
    )
    print(f"       create bug: {created.status_code} {created.text[:200]}")
    if created.status_code != 201:
        return 1

    issue_key = created.json()["key"]
    comment = client.post(
        f"/rest/api/3/issue/{issue_key}/comment",
        json={"body": ADF_BODY},
    )
    print(f"       comment on {issue_key}: {comment.status_code}")

    read = client.get(f"/rest/api/3/issue/{issue_key}?fields=summary,labels,description")
    print(f"       read {issue_key}: {read.status_code} labels={read.json().get('fields', {}).get('labels')}")

    deleted = client.delete(f"/rest/api/3/issue/{issue_key}")
    print(f"       delete {issue_key}: {deleted.status_code}")

    verify = client.get(f"/rest/api/3/issue/{issue_key}")
    print(f"       verify {issue_key} gone: {verify.status_code == 404}")
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
