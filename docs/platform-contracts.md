# Platform Contracts — Phase 0

Every row must be `CONFIRMED` or `FALLBACK-SELECTED` before Phase 2 code is written.
Evidence links to the live documentation page that was checked, plus the date it was checked.

**Status legend:** `PENDING` · `CONFIRMED` · `FALLBACK-SELECTED` · `UNAVAILABLE`

| # | Contract | Status | Evidence | Date | Fallback |
|---|---|---|---|---|---|
| C1 | PR panel module | **CONFIRMED — corrected key** | [Bitbucket modules index](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-bitbucket/) lists no `bitbucket:pullRequestPanel`. The actual module is **`bitbucket:repoPullRequestOverviewPanel`** ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-repository-pull-request-overview-panel/)): props `key`, `resource`, `resolver`, `title`; context provides `repository.uuid` and `pullRequest.id`. A `bitbucket:repoPullRequestOverviewAction` (menu → modal) and a sidebar card module also exist. | 2026-11-18 | n/a — module exists under corrected key |
| C2 | `bitbucket:mergeCheck` + `{ success, message }` | **CONFIRMED — with new required property** | [Custom merge check reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/) (updated 2026-01-13): response `MergeCheckResponse { success: boolean; message?: string }`. **New:** the module now requires a `triggers:` array (≥1 entry, e.g. `on-code-pushed`, `on-merge`). Admin must enable *Custom merge checks* in workspace settings, then configure Required at repo/project/workspace level. Exceptions are treated as failures; checks are individually re-runnable. | 2026-11-18 | Code Insights required report stays as the judge-legible second lock (dual gate, D8) |
| C3 | PR push event identifier | **FALLBACK-SELECTED — corrected identifier** | [Bitbucket events reference](https://developer.atlassian.com/platform/forge/events-reference/bitbucket/): there is no `avi:bitbucket:push:updated`. Use **`avi:bitbucket:updated:pullrequest`** — payload includes `changes` when a new commit is pushed to the source branch, which distinguishes code pushes from metadata edits. **`avi:bitbucket:push:repository`** is also available for direct pushes. Scope: `read:pullrequest:bitbucket`. | 2026-11-18 | n/a — native Forge events cover it; no webhook needed |
| C4 | Pipeline-failed event | **FALLBACK-SELECTED — corrected identifier** | Same reference: there is no `avi:bitbucket:pipeline:failed`. Use **`avi:bitbucket:updated:build-status`** and **`avi:bitbucket:created:build-status`** (commit build statuses, scope `read:repository:bitbucket`); deployment events `avi:bitbucket:pending/started/completed:deployment` also exist (added 2026-03). Pipeline Medic subscribes to build-status updates and filters for failed states. | 2026-11-18 | REST polling of Pipelines as last resort |
| C5 | `api.asApp().requestBitbucket` | **CONFIRMED** | Official tutorial [Build a pull request title validator](https://developer.atlassian.com/platform/forge/build-a-pull-request-title-validator-with-custom-merge-checks/) uses `api.asApp().requestBitbucket(route\`/2.0/repositories/...\`)`. `api.asUser()` remains available and is preferred for commit authorship (D10 keeps App 2 Bitbucket-free). | 2026-11-18 | — |
| C6 | `rovo:mcp` Forge module | **CONFIRMED — module exists (Preview); plan-level fallback stays active** | [Rovo modules index](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-index/) (updated 2026-10-29): `rovo:mcp` (Preview) exposes Forge actions as tools for custom agents in Rovo Studio; `rovo:agent`, `rovo:skill`, `action`, `rovo:agentConnector` all exist. However our site is **Jira Free**, which does not include Rovo — so the **remote MCP server (Streamable HTTP + OAuth 2.1) remains the operative path**, with `rovo:*` modules added when the site is on a Rovo-inclusive plan. | 2026-11-18 | Cerberus remote MCP server at `/api/mcp` |
| C7 | Merge-check timeout limit | **CONFIRMED — by design** | [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/): user-led invocations 25s, web trigger/action 55s, async events 900s (default 55s, `timeoutSeconds` to extend). No merge-check-specific timeout is documented; the gate is read-only, storage-only, and returns in <150ms by construction (§7.2), so the limit is never approached. | 2026-11-18 | — |
| C8 | `storage.query()` cursor pagination shape | **CONFIRMED** | [KVS query reference](https://developer.atlassian.com/platform/forge/storage-reference/kvs-api-query/): `getMany()` → `{ results, nextCursor? }`; `query.cursor(after)` chains; default page 10, max limit 20 (KVS) / 100 (entity store); single `where('key', beginsWith(...))` filter. Requires `storage:app` scope. GC sweep loops cursor→batched delete exactly as §7.6 planned. Cursors must not be persisted. | 2026-11-18 | — |
| C9 | `invoke()` payload size cap | **CONFIRMED — 500 KB front-end / 5 MB general** | [Invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/): front-end `invoke` request payload **500 KB** (response 5 MB); general invocation payload 5 MB; async-event payload 200 KB. The lean verdict envelope with lazily-fetched diffs by key is required and sufficient. | 2026-11-18 | — |
| C10 | Custom UI CSP: fonts, inline styles, SVG data-URI | **CONFIRMED** | [Content security and egress controls](https://developer.atlassian.com/platform/forge/add-content-security-and-egress-controls/): external sources are blocked by default; `permissions.content.styles: ["unsafe-inline"]` enables inline styles; `permissions.external.fonts/styles/...` whitelist external sources. Self-hosted `@fontsource` bundles need **no** external permissions — matching §4.4.1. Inline styles will be declared explicitly. | 2026-11-18 | — |
| C11 | Codegeist 2026 eligibility, submission format, video length | **N/A — out of build scope** | Demo and submission are excluded from this build (plan §Build Scope). | 2026-11-18 | — |
| C12 | Code Insights required-report availability on this workspace plan | **CONFIRMED UNAVAILABLE on Free — Premium gate applies to the whole native lock** | [Set up and use custom merge checks](https://support.atlassian.com/bitbucket-cloud/docs/set-up-and-use-custom-merge-checks/): on the **repository level**, a custom merge check runs on any plan, but the **`required` (blocking) toggle is Premium-only**; workspace/project-level administration is Premium-only; classic *"Prevent a merge with unresolved merge checks"* is also Premium. On our Free workspace the Cerberus check would be **informational** — it runs and renders, but does not block. **HG4's "real native merge dialog blocked" therefore requires Bitbucket Premium** (30-day trial is the intended path; decision needed before Phase 4). Code Insights reports + annotations still render on Free and remain the judge-legible surface. | 2026-11-18 | Premium trial for the blocking gate; otherwise the check is visible-but-advisory and the UI labels the local gate `SIMULATED` honestly |

## Manifest corrections required (supersedes plan §7.1 / §8.1 until the plan is updated)

1. `bitbucket:pullRequestPanel` → **`bitbucket:repoPullRequestOverviewPanel`** (keep `resource` + `resolver` + `title`).
2. `bitbucket:mergeCheck` entries must add **`triggers: [on-code-pushed]`** (required property).
3. Trigger events: `avi:bitbucket:push:updated` → **`avi:bitbucket:updated:pullrequest`**;
   `avi:bitbucket:pipeline:failed` → **`avi:bitbucket:updated:build-status`** (+ `avi:bitbucket:created:build-status`).
4. `rovo:mcp` schema is **`key` + `name` (≤30 chars) + `tools` (action keys)** — no `function`, no `description`, max one module per app. Third-party MCP clients connect at `https://mcp.atlassian.com/forge/<appId>` after a site admin enables external exposure (Apps → Connected apps in Atlassian Administration).
5. Function keys must match `^[a-zA-Z0-9_-]+$` and be **≤ 23 characters**.
6. Egress entries must be objects: `- address: "*.run.app"` (plain strings are deprecated).
7. Runtime: `nodejs24.x` (the `nodejs20.x` in the plan is legacy).

## Registered apps (2026-11-18)

| App | Id | Developer Space |
|---|---|---|
| `cerberus-bitbucket-gate` | `ari:cloud:ecosystem::app/890504f7-5bfe-4dd0-a703-3cfd1ec9e71e` | `cerberus-dev` (`81db9b27-532a-41f6-a6c8-7b81a2260822`) |
| `cerberus-jira-gate` | `ari:cloud:ecosystem::app/3ab1ef8c-457f-4019-90fb-2c395d5e0052` | `cerberus-dev` |

## Verification commands

```bash
forge lint --manifest forge-bitbucket-app/manifest.yml
forge lint --manifest forge-jira-app/manifest.yml
```

Both manifests must lint clean, and each row above must be closed, before **Hard Gate 0** passes.

Gate log: [`gates/`](./gates/)
