# Platform Contracts — Phase 0

Every row must be `CONFIRMED` or `FALLBACK-SELECTED` before Phase 2 code is written.
Evidence must link to the live documentation page that was checked, plus the date it was checked.

**Status legend:** `PENDING` · `CONFIRMED` · `FALLBACK-SELECTED` · `UNAVAILABLE`

| # | Contract | Status | Evidence | Date | Fallback |
|---|---|---|---|---|---|
| C1 | `bitbucket:pullRequestPanel` module key + props | PENDING | | | Code Insights report + annotations (§7.7) carries the entire UX |
| C2 | `bitbucket:mergeCheck` module + `{ success, message }` | PENDING | | | Code Insights **required report** merge check |
| C3 | `avi:bitbucket:push:updated` event identifier | PENDING | | | Bitbucket webhook `repo:push` → backend `/api/jobs` |
| C4 | `avi:bitbucket:pipeline:failed` event exists | PENDING | | | Webhook `repo:build_status_updated`, or Pipelines REST polling |
| C5 | `api.asApp().requestBitbucket` supported | PENDING | | | `api.asUser()` — preferred for commit authorship + branch permissions |
| C6 | `rovo:mcp` Forge module exists | PENDING | | | Cerberus remote MCP server (Streamable HTTP + OAuth 2.1) |
| C7 | Merge-check timeout limit | PENDING | | | Gate is read-only and returns in <150ms regardless (§7.2) |
| C8 | `storage.query()` cursor pagination shape | PENDING | | | Key-prefix registry entity + batched delete |
| C9 | `invoke()` payload size cap | PENDING | | | Lean verdict envelope; diffs fetched lazily by key |
| C10 | Custom UI CSP: fonts, inline styles, SVG data-URI | PENDING | | | Self-host everything; no runtime CDN (§3.4) |
| C11 | Codegeist 2026 eligibility, submission format, video length | PENDING | | | Adjust §18 choreography to official rules |
| C12 | Code Insights merge-check availability on this workspace plan | PENDING | | | Gate on C2; annotate-only if unavailable |

## Verification commands

```bash
forge lint --manifest forge-bitbucket-app/manifest.yml
forge lint --manifest forge-jira-app/manifest.yml
```

Both manifests must lint clean, and each row above must be closed, before **Hard Gate 0** passes.

Gate log: [`gates/`](./gates/)
