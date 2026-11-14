"""Readiness check for the Cerberus build.

Verifies toolchain versions, credential presence, live service reachability, and
repository wiring. Exit code 0 means Phase 0 can start without blockers.

Usage:
    .\\.venv\\Scripts\\python.exe scripts\\verify_env.py
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OK = "PASS"
BAD = "FAIL"
WARN = "WARN"

results: list[tuple[str, str, str]] = []


def record(name: str, status: str, detail: str) -> None:
    results.append((name, status, detail))
    print(f"[{status}] {name}: {detail}")


def run(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        # Windows shims (npm.cmd, forge.cmd) need the shell to resolve.
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=ROOT,
            shell=os.name == "nt",
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, out.strip()
    except Exception as exc:  # noqa: BLE001
        return 1, str(exc)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def check_tools() -> None:
    code, out = run(["git", "--version"])
    record("git", OK if code == 0 else BAD, out or "not found")

    gcm = shutil.which("git-credential-manager")
    if not gcm:
        gcm_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Git Credential Manager"
        candidate = gcm_dir / "git-credential-manager.exe"
        if candidate.exists():
            gcm = str(candidate)
    if gcm:
        code, out = run([gcm, "--version"])
        version = out.split()[0] if out else "unknown"
        major = version.split(".")[0]
        record(
            "git-credential-manager",
            OK if major.isdigit() and int(major) >= 3 else WARN,
            f"{version} ({gcm})" + ("" if major == "3" else " — Bitbucket blocks <3.0.0 after 2026-11-30"),
        )
    else:
        record("git-credential-manager", WARN, "standalone binary not on PATH (Git bundles one)")

    code, out = run(["node", "--version"])
    record("node", OK if code == 0 else BAD, out or "not found")

    code, out = run(["npm", "--version"])
    record("npm", OK if code == 0 else BAD, out or "not found")

    python = ROOT / ".venv" / "Scripts" / "python.exe"
    if python.exists():
        code, out = run([str(python), "--version"])
        record("python (venv)", OK if code == 0 else BAD, out or "not found")
    else:
        record("python (venv)", BAD, ".venv\\Scripts\\python.exe missing")

    code, out = run(["forge", "--version"], timeout=120)
    forge_version = out.splitlines()[0].strip() if out else "not found"
    record("forge", OK if code == 0 else BAD, forge_version)

    code, out = run(["forge", "whoami"], timeout=120)
    logged_in = "Logged in as" in out
    record("forge login", OK if logged_in else BAD, out.splitlines()[0] if out else "not logged in")

    playwright_root = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright"
    has_chromium = playwright_root.exists() and any(playwright_root.glob("chromium*"))
    record("playwright chromium", OK if has_chromium else WARN, str(playwright_root))

    for tool, fallbacks in (
        ("cloudflared", [r"C:\Program Files (x86)\cloudflared\cloudflared.exe", r"C:\Program Files\cloudflared\cloudflared.exe"]),
        (
            "gcloud",
            [
                str(Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Cloud SDK" / "google-cloud-sdk" / "bin" / "gcloud.cmd"),
                r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
            ],
        ),
    ):
        path = shutil.which(tool)
        if not path:
            path = next((p for p in fallbacks if Path(p).exists()), None)
        record(tool, OK if path else WARN, path or "not installed (optional for Phase 2/4)")


def check_env(env: dict[str, str]) -> None:
    secret_keys = [
        "CERBERUS_MCP_TOKEN",
        "CERBERUS_COOKIE_SECRET",
        "CERBERUS_JOB_TOKEN",
        "CERBERUS_INGEST_SECRET",
    ]
    required = [
        "ATLASSIAN_SITE_URL",
        "ATLASSIAN_EMAIL",
        "BITBUCKET_WORKSPACE",
        "BITBUCKET_REPO_SLUG",
        "BITBUCKET_USERNAME",
        "BITBUCKET_API_TOKEN",
        "BITBUCKET_TRAPDOOR_REPO_SLUG",
        "JIRA_PROJECT_KEY",
        "JIRA_API_TOKEN",
    ]
    for key in secret_keys + required:
        value = env.get(key, "")
        if not value:
            record(f"env {key}", BAD, "missing")
            continue
        if "TOKEN" in key or "SECRET" in key:
            record(f"env {key}", OK, f"set ({len(value)} chars)")
        else:
            record(f"env {key}", OK, value)

    cloud_id = env.get("JIRA_CLOUD_ID", "")
    record(
        "env JIRA_CLOUD_ID",
        WARN if not cloud_id else OK,
        "not set — only needed for the scoped-token gateway form" if not cloud_id else cloud_id,
    )


def check_bitbucket(env: dict[str, str]) -> None:
    token = env.get("BITBUCKET_API_TOKEN", "")
    email = env.get("ATLASSIAN_EMAIL", "")
    if not token or not email:
        record("bitbucket api", BAD, "missing credentials")
        return
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}", "Accept": "application/json"}
    workspace = env.get("BITBUCKET_WORKSPACE", "")
    slugs = [env.get("BITBUCKET_REPO_SLUG", ""), env.get("BITBUCKET_TRAPDOOR_REPO_SLUG", "")]
    with httpx.Client(timeout=30.0) as client:
        try:
            response = client.get("https://api.bitbucket.org/2.0/user", headers=headers)
            record("bitbucket user", OK if response.status_code == 200 else BAD, response.json().get("display_name", response.text[:80]))
        except Exception as exc:  # noqa: BLE001
            record("bitbucket user", BAD, str(exc)[:120])
            return
        for slug in slugs:
            if not slug:
                continue
            try:
                response = client.get(
                    f"https://api.bitbucket.org/2.0/repositories/{workspace}/{slug}", headers=headers
                )
                if response.status_code != 200:
                    record(f"bitbucket repo {slug}", BAD, f"HTTP {response.status_code}")
                    continue
                body = response.json()
                private = body.get("is_private")
                record(
                    f"bitbucket repo {slug}",
                    OK if private else WARN,
                    f"private={private} mainbranch={(body.get('mainbranch') or {}).get('name')}",
                )
            except Exception as exc:  # noqa: BLE001
                record(f"bitbucket repo {slug}", BAD, str(exc)[:120])


def check_jira(env: dict[str, str]) -> None:
    site = env.get("ATLASSIAN_SITE_URL", "").rstrip("/")
    token = env.get("JIRA_API_TOKEN", "")
    email = env.get("ATLASSIAN_EMAIL", "")
    key = env.get("JIRA_PROJECT_KEY", "")
    if not (site and token and email):
        record("jira api", BAD, "missing credentials")
        return
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}", "Accept": "application/json"}
    with httpx.Client(timeout=30.0) as client:
        try:
            response = client.get(f"{site}/rest/api/3/project/{key}", headers=headers)
            if response.status_code != 200:
                record("jira project", BAD, f"HTTP {response.status_code}")
                return
            body = response.json()
            record(
                "jira project",
                OK,
                f"{body.get('key')} id={body.get('id')} type={body.get('projectTypeKey')} style={body.get('style')}",
            )
        except Exception as exc:  # noqa: BLE001
            record("jira project", BAD, str(exc)[:120])


def check_repo() -> None:
    code, out = run(["git", "remote", "-v"])
    remotes = {line.split()[0] for line in out.splitlines() if line.strip()}
    record(
        "git remotes",
        OK if {"origin", "bitbucket"} <= remotes else WARN,
        ", ".join(sorted(remotes)) or "none",
    )
    code, out = run(["git", "status", "--porcelain"])
    record("git worktree", OK if not out else WARN, "clean" if not out else f"{len(out.splitlines())} changed paths")
    for folder in ("backend", "src", "tests", "docs/gates", "forge-bitbucket-app", "forge-jira-app", "demo-seed-repo"):
        record(f"dir {folder}", OK if (ROOT / folder).is_dir() else BAD, "present" if (ROOT / folder).is_dir() else "missing")


def main() -> int:
    print("=" * 72)
    print("Cerberus environment readiness")
    print("=" * 72)
    env = load_env()
    check_tools()
    check_env(env)
    check_bitbucket(env)
    check_jira(env)
    check_repo()

    failures = [r for r in results if r[1] == BAD]
    warnings = [r for r in results if r[1] == WARN]
    print("-" * 72)
    print(f"{len(results) - len(failures) - len(warnings)} pass · {len(warnings)} warn · {len(failures)} fail")
    if failures:
        print("BLOCKERS:")
        for name, _, detail in failures:
            print(f"  - {name}: {detail}")
    if warnings:
        print("WARNINGS:")
        for name, _, detail in warnings:
            print(f"  - {name}: {detail}")
    print(json.dumps({"pass": len(results) - len(failures) - len(warnings), "warn": len(warnings), "fail": len(failures)}))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
