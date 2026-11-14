# Cerberus — Environment Setup

Everything needed before executing Phases 0–4 of [`../implementation_plan.md`](../implementation_plan.md).

Last verified: **2026-11-14**

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Git | 2.56.0.windows.4 | |
| Git Credential Manager | 3.0.2 (standalone) | Bundled 2.9.x is blocked by Bitbucket after 2026-11-30 |
| Node.js | 26.13.1 | Forge CLI 15.x requires `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` |
| npm | 11.20.0 | |
| Python | 3.12.10 | Always use `.venv\Scripts\python.exe`; the system `python` may differ |
| Forge CLI | 15.1.0 | Logged in as Aditya Patel |
| Playwright | 1.65.1 | Chromium installed |
| Google Cloud SDK | 593.0.0 | `gcloud auth login` + project creation still required |
| cloudflared | 2026.11.0 | Tunnel fallback for Phase 2 |

## Node packages

Runtime: `express`, `cookie-parser`, `react`, `react-dom`.
Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tsx`, `concurrently`, `@playwright/test`,
`json-schema-to-typescript`, and the three self-hosted font families
(`@fontsource/plus-jakarta-sans`, `@fontsource/dm-sans`, `@fontsource/jetbrains-mono`).

No runtime font CDN is used — Forge's CSP blocks it (§4.4.1).

## Python packages

`fastapi`, `uvicorn[standard]`, `sqlalchemy`, `pydantic`, `PyJWT`, `pytest`, `httpx`, `pywin32`.

`pywin32` is required on Windows: `isolation.py` uses Job Objects for process-tree termination.

## Services

| Service | Endpoint | Credential | Verified by |
|---|---|---|---|
| GitHub | `github.com/adityapatel5912/Cerberus` | Git Credential Manager | `git push origin main` |
| Bitbucket (mirror) | `bitbucket.org/cerberus_5912/cerberus` | `BITBUCKET_API_TOKEN` + `ATLASSIAN_EMAIL` | `git push bitbucket main` |
| Bitbucket (fixture) | `bitbucket.org/cerberus_5912/cerberus-trapdoor` | same | `scripts/verify_env.py` |
| Jira | `cerberus-5912.atlassian.net` | `JIRA_API_TOKEN` (Basic auth) | `scripts/jira_check.py` |
| Jira project | `CERB` (id `10002`, classic software project) | — | `scripts/jira_check.py` |

### Atlassian authentication

Atlassian removed app passwords in 2026. Two token kinds exist:

| Token | Where it works | Stored as |
|---|---|---|
| Scoped token | `https://api.atlassian.com/ex/jira/{cloudId}/...` only | `JIRA_SCOPED_TOKEN` |
| Classic token | `https://<site>.atlassian.net/rest/api/3/...` | `JIRA_API_TOKEN` |

The scoped token additionally needs `JIRA_CLOUD_ID`, the site UUID. Atlassian no longer returns
`cloudId` from `/rest/api/3/myself`, so it is filled in manually from the `admin.atlassian.com` URL.
Until then the classic token is the active credential.

Forge apps never use these tokens — they use their own manifest scopes and `api.asUser()`.

## npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Express gateway (`:3000`) + Vite UI (`:5173`) |
| `npm run serve` | Gateway only, serving `dist/` |
| `npm run forge:lint` | `forge lint` on both manifests (Hard Gate 0) |
| `npm run py:mutation` | Mutation generalization benchmark (§9.7) |
| `npm run gate:0` | `forge:lint` + `py:mutation` |
| `npm run codegen:schema` | Python verdict schema → TypeScript types |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Playwright suite |
| `npm run test:py` | pytest suite |
| `npm run verify:ci` | codegen + schema-drift check + typecheck + Playwright |
| `npm run jira:check` | Live Jira round-trip probe |

## Windows specifics (§20.1)

- `isolation.py` branches on `sys.platform`: Windows uses Job Objects + `taskkill /T /F`;
  POSIX keeps `resource`, `start_new_session`, `killpg`. `resource` is never imported on Windows.
- `CERBERUS_WS_ROOT=./.cerberus-ws` instead of `/tmp/cerb-ws`.
- Manual UI verification uses the `browse` MCP in OpenCode (§14.5).

## Readiness check

```powershell
.\.venv\Scripts\python.exe scripts\verify_env.py
```

Checks toolchain versions, credential presence (masked), live Bitbucket and Jira reachability,
Forge login, and Playwright browser availability. Exit code `0` means Phase 0 can start.
