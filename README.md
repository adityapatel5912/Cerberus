# Cerberus

Autonomous pre-merge verification, exploit replay, and self-healing pipeline engine for Bitbucket and Jira.

## Current status

Local development environment is set up. Application code starts at Phase 0/1 of [`implementation_plan.md`](./implementation_plan.md).

## Build scope

- **In scope:** Phases 0–4 — platform contracts, verification core, gateway/MCP, Forge apps, UI, cloud deployment, native merge gate.
- **Out of scope:** Phase 5 demo and submission — no video, submission package, or demo choreography.

## Local environment

| Tool | Version |
|---|---|
| Node.js | 24.18 |
| Python | 3.12 (`py -3.12`) |
| Git | 2.55 |

Python dependencies live in `.venv`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Node dependencies are installed with `npm install`.

## Configuration

Copy `.env.example` to `.env` and fill the required values. `.env` is gitignored.

- Cerberus secrets are generated locally.
- Atlassian/Bitbucket/Jira/cloud values are filled when the corresponding phase starts.
- Never commit real credentials.

## Manual testing

Use the `browse` MCP in OpenCode for manual UI checks. Drive the real browser, inspect before acting, and verify each state change with a fresh page read.
