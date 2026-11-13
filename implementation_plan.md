# Cerberus — Implementation Plan

**Autonomous Pre-Merge Verification, Exploit Replay & Self-Healing Pipeline Engine**

Cerberus is an autonomous pre-merge verification engine for Bitbucket and Jira that guards the gate to `main` using three compiler-backed, sandbox-verified engines — **Contract Shield**, **RedTeam Verifier**, **Pipeline Medic** — and synthesizes their fixes into a single conflict-free git patch, backed by a **reproducible evidence bundle**, before unlocking the Bitbucket merge gate.

## Build Scope

**In scope:** Phases 0–4 — platform contracts, verification core, local gateway/MCP, both Forge apps, dual-mode UI, cloud deployment, and the native Bitbucket merge gate.

**Out of scope:** Phase 5 demo and submission — no recorded video, submission package, or demo choreography. A working, manually testable build is the deliverable.

## Execution Rules

1. Build in phase order (§15). Do not start a phase until its hard gate passes.
2. Close Phase 0 platform contracts before writing dependent Forge code. If a contract cannot be confirmed, select the documented fallback and record the decision.
3. Respect the strict file ownership boundaries in §6. Cross-boundary changes go through a typed interface.
4. Verify with commands and tests, not assumptions. Every gate result is dated and archived in `docs/gates/`.
5. Never hardcode timings, verdicts, line numbers, or gate results. Every number shown in the UI or demo is measured at runtime.
6. The merge gate is read-only and fail-closed. No component self-attests `PASS`; only signed backend ingest may grant it.
7. **Manual testing goes through the `browse` MCP in OpenCode.** Drive the running app in a real browser with `browse` — inspect the page, click, fill, and verify results — instead of using ad-hoc scripts, static mocks, or screenshot-only checks.

---

## 1. Phase 0 — Platform Contract Verification (BLOCKING)

> **Do not write Phase 2+ code until this table is closed.** The Forge layer must not rest on unverified module names or event identifiers. Run `forge lint` on both manifests as *Hard Gate 0* and diff every row against the live Forge module reference.

| # | Contract to verify | Fallback if unavailable |
|---|---|---|
| C1 | `bitbucket:pullRequestPanel` module key + props | Bitbucket Code Insights report + annotations (§7.7) carries the entire UX |
| C2 | `bitbucket:mergeCheck` module + return shape `{ success, message }` | Code Insights **required report** merge check (Premium) — native, verifiable |
| C3 | `avi:bitbucket:push:updated` event identifier | Bitbucket webhook `repo:push` → backend `/api/jobs` |
| C4 | `avi:bitbucket:pipeline:failed` event exists at all | Webhook `repo:build_status_updated`, or Pipelines REST polling |
| C5 | `api.asApp().requestBitbucket` supported | `api.asUser()` — preferred anyway for commit authorship + branch permissions |
| C6 | `rovo:mcp` Forge module exists | Cerberus remote MCP server (Streamable HTTP + OAuth 2.1) registered as an MCP client endpoint |
| C7 | Merge-check timeout limit | Gate is read-only and returns in <150ms regardless (§7.2) |
| C8 | `storage.query()` cursor pagination shape | Key-prefix registry entity + batched delete |
| C9 | `invoke()` payload size cap | Lean verdict envelope; diffs fetched lazily by key |
| C10 | Custom UI CSP: fonts, inline styles, SVG data-URI | Self-host everything; no runtime CDN (§3.4) |
| C11 | Codegeist 2026 eligibility, submission format, video length | Adjust §18 choreography to official rules |
| C12 | Code Insights merge-check availability on demo workspace plan | Gate on C2; annotate-only if unavailable |

**Hard Gate 0:** `forge lint` passes on both manifests **AND** every row above is marked `CONFIRMED` or `FALLBACK-SELECTED` in `docs/platform-contracts.md`, dated and linked to the doc page.

---

## 2. Overview & Core Concept

### 2.1 What It Does

Cerberus intercepts every PR push, blocks the merge gate, and runs three deterministic engines in parallel. It emits **no finding without empirical proof**, then synthesizes and re-verifies a single conflict-free patch.

- **Head 1 — Contract Shield.** Structural AST diff across Pydantic V2 models, FastAPI routes, TypeScript interfaces, SQL migrations. Resolves repo-wide blast radius to exact `file:line:col`. Synthesizes a backward-compatible `AliasChoices` adapter.
- **Head 2 — RedTeam Verifier.** AST taint flow from untrusted request params into ORM sinks. Boots an isolated subprocess sandbox (`TestClient` + seeded in-memory SQLite), fires the exploit, captures the leaked HTTP 200 diff and a runnable `curl` PoC, then proves the patch seals it **without locking out the legitimate owner**.
- **Head 3 — Pipeline Medic.** Strips container/installation noise from failed pipeline logs, correlates the failing assertion with git diff blame, verifies the candidate fix in an isolated shadow `pytest` subprocess, reports both pytest-reported and wall-clock timings.
- **Cross-Head Brain.** Merges all three candidate fixes into one unified diff, re-runs the **full** exploit + shadow suites against the combined patch, and only then unlocks commit.
- **Evidence Bundle.** Every verdict ships a hash-chained, reproducible artifact: input content hashes, sandbox seed, `curl` PoC, raw pytest output, per-head timings, and output digest. Attached to the Bitbucket report and the Jira ADF bug.

### 2.2 Differentiator

Not "AI reviews your code." Instead: **proof before patch, synthesis before commit, and a fuzz benchmark proving the engines generalize** (§9.7). The mutation benchmark is the single strongest answer to the only question that matters from a judge: *"is this hardcoded to your demo?"*

### 2.3 Persona

Staff engineers, DevSecOps architects, and platform teams on Bitbucket Cloud + Jira Cloud + Rovo + MCP-enabled IDEs (Cursor / Claude Code).

---

## 3. Locked Architectural & UX Decisions

**D1 — Dual-Mode Execution + Unified Transport.** Local mode: Express + Vite gateway on port 3000 bridging to isolated Python workers; 4-tab workbench. Forge mode: host detected via `view.getContext()` **with a timeout race — never hostname sniffing**; all calls routed through `invoke('panelResolver', …)`.

**D2 — Subprocess Isolation, Honestly Labeled.** Fresh interpreter per run (`-I -S`), scrubbed env, in-child `RLIMIT_*` caps, own process group, `killpg` on timeout. UI says **"subprocess-isolated · resource-capped · secret-scrubbed"** — never "sandboxed." Adversarial isolation for user-mutated code requires gVisor/nsjail; live mutation is therefore **local-only by default** (`CERBERUS_ALLOW_MUTATION=false` in cloud).

**D3 — Backend as Single Source of Truth.** Forge storage is per-installation. Verdicts live in the backend, keyed by content hash. App 1 storage is a *cache*, populated only by an HMAC-authenticated `webtrigger` ingest.

**D4 — Read-Only Merge Gate.** `evaluateMergeGate` performs storage reads only. Cache miss returns a fast, fail-closed `IN_PROGRESS`. It never awaits the backend.

**D5 — Never Self-Attest PASS.** No client, resolver, or commit handler may write `merge_check_allowed: true`. Only the backend, after full re-verification, may grant PASS via signed ingest.

**D6 — Three-Phase Security Proof.** Every security verdict asserts: pre-patch leak (200) → post-patch sealed (403/404) → **post-patch legitimate owner still 200** → forged-header attempt sealed. Missing any phase invalidates the verdict.

**D7 — Principal From Claims, Never Headers.** Authorization derives from verified JWT claims. `X-Tenant-ID` is a hint that must match; mismatch is an explicit 403.

**D8 — Dual Gate.** Forge `mergeCheck` **and** Bitbucket Code Insights report + line annotations. The native report is the judge-legible lock and the fallback if C2 fails.

**D9 — Conflict-Safe Commits.** `POST /2.0/repositories/{ws}/{repo}/src` with `parents` tip pinning, pre-flight tip equality check, idempotency lock, and rebase-retry on conflict.

**D10 — Native Rovo Orchestration.** `rovo:agent` uses Rovo's native LLM to call deterministic Forge `action` verbs (`GET`/`CREATE`/`UPDATE`). Bitbucket writes are proxied to App 1 / backend; App 2 never needs Bitbucket scopes.

**D11 — Session-Scoped Determinism.** Signed session cookie → private workspace copy. Reset mutates only the caller's workspace. Concurrent judges cannot interfere.

**D12 — Honest Telemetry.** Every number on screen is measured at runtime. No hardcoded timings anywhere in UI or video. Pytest-reported duration and process wall-clock are labeled separately.

---

## 4. User Experience & Visual Design

### 4.1 Key User Flows

**Flow A — Trapdoor PR Inspection.** Open PR `#12: feat(checkout): promo code refactor & invoice lookup`. Merge gate blocked: `BLOCKED BY CERBERUS · 1 BREAKING CONTRACT · 1 CONFIRMED IDOR · 1 FAILING PIPELINE`. Inspect three engine sub-tabs, or edit PR source in the live code drawer (local mode).

**Flow B — Interactive Proof.** Head 1: click Blast-Radius mini-map nodes → `frontend/src/Checkout.tsx:84`, `mobile/api/cart.ts:42` + adapter diff. Head 2: **Replay Live Exploit** → HTTP 200 cross-tenant leak diff, copyable `curl`, and the four-row proof matrix. Head 3: toggle 420-line raw log ↔ 7-line root-cause traceback with shadow-runner verification.

**Flow C — Synthesis & Commit.** Review the unified side-by-side diff (collision-free), click **Commit Unified Fix to PR**. Commit lands with `parents` pinning → gate goes `PENDING` → backend re-verifies → ingest → all heads emerald → `READY TO SHIP`.

**Flow D — Jira / Rovo / MCP.** Jira panel `CERB-104`: linked-artifact panel, SLA risk, **Escalate to Jira P1 Bug** (ADF). Rovo tab: natural-language verdict queries and action verbs. MCP tab: live JSON-RPC tool runner with raw request/response inspection.

### 4.2 Visual Identity

- **60% canvas** — Deep Obsidian `#0B0F19`, 2% SVG noise overlay.
- **30% structure** — `#111827` / `bg-white/[0.03]`, `1px solid rgba(255,255,255,0.08)` hairlines. Type: `#F8FAFC` primary, `#94A3B8` secondary, `#64748B` metadata.
- **10% semantic accent** — Cyan `#06B6D4` (focus, AST edges) · Emerald `#10B981` (verified/sealed/passing) · Amber `#F59E0B` (deprecation, in-progress) · Crimson `#F43F5E` (breaking, leaked, failing). **Color always paired with a text label and a functional icon.**

### 4.3 Typography (2+1 rule)

`Plus Jakarta Sans` 600/700 display, tight tracking, `text-wrap: balance` · `DM Sans` 400/500 body at 15px · `JetBrains Mono` with strict `font-variant-numeric: tabular-nums` for line numbers, timings, HTTP codes, diffs.

### 4.4 UI & Platform Requirements

1. **Self-host all three families** via `@fontsource/*`. No runtime font CDN inside a CSP-restricted Forge iframe. Zero FOUT on camera.
2. **Theme-aware chrome.** Read `view.theme.colorMode`. Keep the obsidian console surface; match the outer frame's radius/padding/background to the host so it reads native, not embedded.
3. **Label the replica.** The local workbench merge button carries `data-simulated="true"` and a `· SIMULATED GATE` monospace suffix. Cloud mode shows the real native merge dialog. A judge must never discover the difference themselves.
4. **Accessibility.** `aria-live="polite"` on head-status transitions; visible focus rings; keyboard-traversable SVG mini-map nodes; `prefers-reduced-motion` honored on the emerald flip and graph edge draw.
5. **Egress disclosure.** Persistent monospace footer in cloud mode: `VERIFICATION EXECUTES ON CERBERUS BACKEND · SOURCE SNAPSHOT LEAVES ATLASSIAN · [details]`.
6. **Generalization badge.** Top bar: `24/24 MUTANTS DETECTED · 0 FALSE POSITIVES ON HEALED · 100% LINE ACCURACY` — computed in CI, never typed by hand.

### 4.5 Layout Contract

Strict top bar: **Zone 1** single-line `Cerberus` wordmark · **Zone 2** four single-line workspace tabs · **Zone 3** primary `Run Full Verification` action. Single elevation. Zero-pill metadata: SHAs, branches, timestamps, line counts as unboxed monospace separated by `·`. No decorative pill sandwiches, no thick left accent borders.

---

## 5. Architecture Topology & State Machine

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ DEVELOPER / TRAPDOOR PR WORKSPACE (git push · live edit · Rovo · MCP)         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ 1. push / mutate
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ FORGE APP 1 — BITBUCKET GATEKEEPER                                            │
│  • trigger: push / build-status  ──► POST backend /api/jobs  (202, fire&forget)│
│  • mergeCheck: storage.get ONLY  ──► <150ms, fail-closed IN_PROGRESS on miss   │
│  • webtrigger /verdict-ingest    ◄── HMAC-SHA256 signed verdict from backend   │
│  • Code Insights report + annotations ──► NATIVE merge block + inline diff     │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ 2. async job
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ CERBERUS CORE — SINGLE SOURCE OF TRUTH (Cloud Run / local)                    │
│  session workspace · content-hash cache · semaphore(2) · request coalescing   │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                     │
│  │ HEAD 1 AST     │ │ HEAD 2 EXPLOIT │ │ HEAD 3 SHADOW  │  parallel, isolated  │
│  │ blast radius   │ │ 3-phase proof  │ │ pytest + blame │  killpg on timeout   │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘                     │
│          └──────────────────┼──────────────────┘                              │
│                             ▼                                                 │
│  CROSS-HEAD BRAIN: unified diff → FULL re-verify → evidence bundle (hash chain)│
│                             │                                                 │
│         ┌───────────────────┼───────────────────┐                             │
│         ▼                   ▼                   ▼                             │
│  App1 ingest (HMAC)   Bitbucket /src        App2 read API                      │
│  → storage cache      parents pinned        → Jira panel / Rovo / ADF         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 State Machine

| State | Entry | Exit condition |
|---|---|---|
| `STATE_ANALYZING` | push / mutate / manual run | all three heads settle |
| `STATE_BLOCKED_VERIFIED` | 3 empirical violations confirmed | unified patch synthesized + pre-verified |
| `STATE_COMMITTING_PATCH` | user / Rovo commits | new SHA created; gate written `PENDING` (**never PASS**) |
| `STATE_REVERIFYING` | new SHA detected | backend full re-verify completes |
| `STATE_READY_TO_SHIP` | signed ingest grants PASS | gate `success: true`, Jira `VERIFIED READY` |
| `STATE_DEGRADED` | backend unreachable / timeout | fail-closed with actionable message; never silent green |

---

## 6. Sub-Agent Orchestration & Strict File Ownership

| Agent | Strict ownership | Interface contract |
|---|---|---|
| **A1 — Verification Core** | `/backend/cerberus_engine.py`, `/backend/schemas.py`, `/backend/sandbox_worker.py`, `/backend/shadow_runner.py`, `/backend/isolation.py`, `/backend/evidence.py` | Emits deterministic `CerberusMasterVerdict` JSON incl. proof matrix + evidence bundle |
| **A2 — Gateway & MCP** | `/server.ts`, `/src/server/*`, `/mcp_config.*.json` | Port 3000 REST + Streamable-HTTP/stdio MCP; sessions, semaphore, coalescing, abort |
| **A3 — Forge Apps** | `/forge-bitbucket-app/*`, `/forge-jira-app/*` | Two lint-clean manifests; read-only gate; HMAC ingest; Code Insights; `/src` committer; Jira ADF; Rovo actions |
| **A4 — Dual-Mode UI** | `/src/lib/transport.ts`, `/src/*` (excl. `/src/server`) | React 19 + TS + Tailwind obsidian console; both hosts; a11y; simulated-gate labeling |
| **A5 — Seed Repo & QA** | `/demo-seed-repo/*`, `/tests/*` | Canonical Trapdoor repo; Playwright + MCP protocol suite; p95 latency harness |
| **A6 — Generalization & Docs** | `/backend/mutation_fuzz.py`, `/docs/*`, `/.github/workflows/*` | Fuzz benchmark, platform-contract ledger, schema codegen, CI hard gates |

**Boundary rule:** no agent writes outside its glob. Cross-boundary needs go through a typed interface in `schemas.py` → generated `verdict.d.ts`.

---

## 7. Forge App 1 — Bitbucket Gatekeeper

### 7.1 Manifest (`/forge-bitbucket-app/manifest.yml`)

```yaml
modules:
  bitbucket:pullRequestPanel:
    - key: cerberus-pr-telemetry-panel
      resource: cerberus-bb-ui
      resolver:
        function: panelResolver
      title: Cerberus Pre-Merge Verification & Exploit Sandbox

  bitbucket:mergeCheck:
    - key: cerberus-hardened-merge-gate
      function: bb-merge-check-fn
      name: Cerberus 3-Head Pre-Merge Gatekeeper
      description: Blocks merge until contract, exploit, and pipeline proofs pass.

  trigger:
    - key: cerberus-pr-push-trigger
      function: bb-push-updated-fn
      events:
        - avi:bitbucket:push:updated      # [CONTRACT C3]
    - key: cerberus-build-status-trigger
      function: bb-pipeline-failed-fn
      events:
        - avi:bitbucket:pipeline:failed   # [CONTRACT C4 → fallback repo:build_status_updated]

  webtrigger:
    - key: cerberus-verdict-ingest
      function: verdict-ingest-fn

  scheduledTrigger:
    - key: cerberus-storage-gc
      function: storage-gc-fn
      interval: hour

  function:
    - key: panelResolver
      handler: index.panelResolver
    - key: bb-merge-check-fn
      handler: mergeCheck.evaluateMergeGate
    - key: bb-push-updated-fn
      handler: pipelineTrigger.onCodePushed
    - key: bb-pipeline-failed-fn
      handler: pipelineTrigger.onPipelineFailed
    - key: verdict-ingest-fn
      handler: ingest.handleVerdictIngest
    - key: storage-gc-fn
      handler: gc.sweepExpiredVerdicts
    - key: commit-fix-fn
      handler: commitFix.commitPatchedFilesToBitbucket

resources:
  - key: cerberus-bb-ui
    path: static/cerberus-ui/dist

permissions:
  scopes:
    - read:pullrequest:bitbucket
    - write:pullrequest:bitbucket
    - read:repository:bitbucket
    - write:repository:bitbucket
    - read:pipeline:bitbucket
    - storage:app
  external:
    fetch:
      backend:
        - "*.run.app"
        - "*.trycloudflare.com"
        - "*.ngrok-free.app"

app:
  runtime:
    name: nodejs20.x
```

> `localhost:3000` is **not** a valid cloud fetch target. Local development uses a tunnel; `CERBERUS_BACKEND_URL` is set via `forge variables set`.

### 7.2 Verdict Keys + Read-Only Gate

```ts
// forge-bitbucket-app/src/verdictKey.ts
export const normalizeSha = (s?: string): string => (s ?? '').toLowerCase().slice(0, 40);

export const verdictKey = (prId: number, src?: string, dst?: string): string =>
  `verdict:pr:${prId}:src:${normalizeSha(src)}:dst:${normalizeSha(dst) || 'any'}`;

export const aliasKey = (prId: number, src?: string): string =>
  verdictKey(prId, src); // dst-agnostic fallback for events lacking destination metadata

export const VERDICT_TTL_MS = 30 * 60 * 1000;
```

```ts
// forge-bitbucket-app/src/mergeCheck.ts — READ-ONLY. Never calls the backend.
import { storage } from '@forge/api';
import { verdictKey, aliasKey } from './verdictKey';

const inProgress = (ms: number, reason: string) => ({
  success: false,
  message: `Cerberus verification in progress (${reason}). 3-head proof pending — refresh shortly. · gate ${ms}ms`,
});

export async function evaluateMergeGate(event: any) {
  const t0 = Date.now();
  const pr = event?.pullrequest ?? {};
  const prId = Number(pr.id ?? 0);
  const src: string | undefined = pr?.source?.commit?.hash;
  const dst: string | undefined = pr?.destination?.commit?.hash;

  if (!prId || !src) return inProgress(Date.now() - t0, 'awaiting commit metadata');

  let rec: any = null;
  try {
    rec = (await storage.get(verdictKey(prId, src, dst))) ?? (await storage.get(aliasKey(prId, src)));
  } catch {
    return inProgress(Date.now() - t0, 'verdict store unavailable'); // fail-closed, never green
  }

  const ms = Date.now() - t0;
  if (!rec) return inProgress(ms, 'no verdict yet');
  if (typeof rec.expiresAt === 'number' && rec.expiresAt < Date.now()) return inProgress(ms, 'verdict expired');
  if (rec.state === 'PENDING' || rec.state === 'REVERIFYING') return inProgress(ms, 're-verifying patched commit');

  return {
    success: rec.merge_check_allowed === true,
    message: `${rec.merge_check_message} · proof ${rec.total_execution_ms}ms · gate ${ms}ms · ${String(src).slice(0, 7)}`,
  };
}
```

### 7.3 HMAC Verdict Ingest (the only writer of PASS)

```ts
// forge-bitbucket-app/src/ingest.ts
import { storage } from '@forge/api';
import { createHmac, timingSafeEqual } from 'crypto';
import { verdictKey, aliasKey, VERDICT_TTL_MS } from './verdictKey';

const header = (h: any, k: string): string => {
  const v = h?.[k] ?? h?.[k.toLowerCase()];
  return Array.isArray(v) ? String(v[0]) : String(v ?? '');
};

export async function handleVerdictIngest(req: any) {
  const ts = header(req.headers, 'x-cerberus-ts');
  const sig = header(req.headers, 'x-cerberus-sig');
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});

  if (Math.abs(Date.now() - Number(ts)) > 60_000) return { statusCode: 401, body: 'stale timestamp' };

  const expected = createHmac('sha256', process.env.CERBERUS_INGEST_SECRET!)
    .update(`${ts}.${raw}`).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { statusCode: 401, body: 'bad signature' };

  const v = JSON.parse(raw);
  const record = { ...v, expiresAt: Date.now() + VERDICT_TTL_MS };
  await storage.set(verdictKey(v.pr_id, v.source_commit, v.target_commit), record);
  await storage.set(aliasKey(v.pr_id, v.source_commit), record);

  return { statusCode: 204 };
}
```

### 7.4 Push Trigger — Fire-and-Forget Dispatch

```ts
// forge-bitbucket-app/src/pipelineTrigger.ts
import { fetch } from '@forge/api';
import { normalizeSha } from './verdictKey';

const BACKEND = process.env.CERBERUS_BACKEND_URL!;

async function dispatch(body: Record<string, unknown>) {
  // Backend returns 202 immediately and ingests the verdict later via webtrigger.
  await fetch(`${BACKEND}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cerberus-Job-Token': process.env.CERBERUS_JOB_TOKEN! },
    body: JSON.stringify(body),
  });
}

export async function onCodePushed(event: any) {
  const pr = event?.pullrequest ?? {};
  await dispatch({
    workspace_id: event?.workspace?.slug ?? event?.repository?.workspace?.slug,
    repo_slug: event?.repository?.slug ?? event?.repository?.name,
    pr_id: Number(pr.id ?? 0),
    source_commit: normalizeSha(pr?.source?.commit?.hash),
    target_commit: normalizeSha(pr?.destination?.commit?.hash),
    target_branch: pr?.destination?.branch?.name ?? 'main',
  });
}

export async function onPipelineFailed(event: any) {
  await dispatch({ ...event, reason: 'pipeline_failed' });
}
```

### 7.5 Conflict-Safe Commit — Never Self-Attests PASS

```ts
// forge-bitbucket-app/src/commitFix.ts
import api, { route, storage } from '@forge/api';
import { verdictKey, normalizeSha } from './verdictKey';

const LOCK_TTL_MS = 30_000;

export async function commitPatchedFilesToBitbucket(args: {
  workspace: string; repoSlug: string; prId: number; branchName: string;
  parentCommitSha: string; commitMessage: string;
  patchedFiles: Record<string, string>; idempotencyKey: string;
}) {
  const { workspace, repoSlug, prId, branchName, commitMessage, patchedFiles, idempotencyKey } = args;
  const parent = normalizeSha(args.parentCommitSha);
  const lockKey = `lock:commit:${workspace}:${repoSlug}:${prId}`;

  // 1. Idempotency + distributed lock
  const prior = await storage.get(`idem:${idempotencyKey}`);
  if (prior) return prior;
  const lock = await storage.get(lockKey);
  if (lock && lock.expiresAt > Date.now()) throw new Error('Cerberus: commit already in flight for this PR.');
  await storage.set(lockKey, { expiresAt: Date.now() + LOCK_TTL_MS });

  try {
    // 2. Pre-flight tip equality — parents pinning alone does not prevent a lost update
    const tipRes = await api.asUser().requestBitbucket(
      route`/2.0/repositories/${workspace}/${repoSlug}/refs/branches/${branchName}`);
    if (!tipRes.ok) throw new Error(`Cerberus: cannot read branch tip (${tipRes.status}).`);
    const tip = normalizeSha((await tipRes.json())?.target?.hash);
    if (tip !== parent) {
      throw new Error(`Cerberus: branch moved (${tip.slice(0,7)} != ${parent.slice(0,7)}). Re-verify before committing.`);
    }

    // 3. urlencoded /src commit — simpler and safer than multipart inside Forge
    const form = new URLSearchParams();
    form.set('message', commitMessage);
    form.set('branch', branchName);
    form.set('parents', parent);
    for (const [path, content] of Object.entries(patchedFiles)) form.set(path, content);

    const res = await api.asUser().requestBitbucket(
      route`/2.0/repositories/${workspace}/${repoSlug}/src`,
      { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString() });

    if (!res.ok) throw new Error(`Bitbucket commit failed: ${res.status} ${await res.text()}`);

    const after = await api.asUser().requestBitbucket(
      route`/2.0/repositories/${workspace}/${repoSlug}/refs/branches/${branchName}`);
    const newSha = normalizeSha((await after.json())?.target?.hash);

    // 4. PENDING only. PASS may only arrive via signed backend ingest. (D5)
    await storage.set(verdictKey(prId, newSha), {
      pr_id: prId, source_commit: newSha, state: 'PENDING',
      merge_check_allowed: false,
      merge_check_message: 'Cerberus: patched commit received — re-running 3-head proof.',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const result = { committed: true, branch: branchName, newCommitSha: newSha, state: 'PENDING' };
    await storage.set(`idem:${idempotencyKey}`, result);
    return result;
  } finally {
    await storage.delete(lockKey);
  }
}
```

> `asUser()` is preferred: correct commit authorship, respects branch permissions, and sidesteps C5. If unavailable, fall back to `asApp()` and record the author limitation in `docs/platform-contracts.md`.

### 7.6 Storage GC

```ts
// forge-bitbucket-app/src/gc.ts
import { storage } from '@forge/api';

export async function sweepExpiredVerdicts() {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page: any = await storage.query().limit(100).cursor(cursor).getMany(); // [CONTRACT C8]
    for (const { key, value } of page.results ?? []) {
      if (key.startsWith('verdict:pr:') && value?.expiresAt && value.expiresAt < Date.now()) {
        await storage.delete(key); deleted++;
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return { deleted };
}
```

### 7.7 Dual Gate — Code Insights Report + Annotations

```ts
// forge-bitbucket-app/src/codeInsights.ts
import api, { route } from '@forge/api';

const REPORT_ID = 'cerberus-premerge';

export async function publishReport(ws: string, repo: string, sha: string, v: any) {
  const base = route`/2.0/repositories/${ws}/${repo}/commit/${sha}/reports/${REPORT_ID}`;
  const put = await api.asApp().requestBitbucket(base, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Cerberus 3-Head Pre-Merge Proof',
      details: 'AST blast radius · sandbox exploit replay · shadow pytest · evidence bundle',
      report_type: 'SECURITY',
      reporter: 'Cerberus',
      link: `${process.env.CERBERUS_BACKEND_URL}/evidence/${v.evidence.bundle_id}`,
      result: v.merge_check_allowed ? 'PASSED' : 'FAILED',
      data: [
        { title: 'Breaking contract consumers', type: 'NUMBER', value: v.contract_shield.breaking_changes_count },
        { title: 'Confirmed IDOR exploits', type: 'NUMBER', value: v.redteam_verifier.exploit_confirmed ? 1 : 0 },
        { title: 'Owner access preserved', type: 'TEXT', value: v.redteam_verifier.proof.no_lockout ? 'YES' : 'NO' },
        { title: 'Shadow tests passed', type: 'TEXT',
          value: `${v.unified_patch.shadow_suite_passed_tests}/${v.unified_patch.shadow_suite_total_tests}` },
        { title: 'Evidence digest', type: 'TEXT', value: v.evidence.output_digest.slice(0, 12) },
      ],
    }),
  });
  if (!put.ok) throw new Error(`Code Insights report failed: ${put.status}`);

  const annotations = [
    ...v.contract_shield.blast_radius.map((n: any) => ({
      annotation_type: 'BUG', severity: 'HIGH', path: n.file_path, line: n.line_number,
      summary: `Breaking rename: ${n.broken_symbol} still referenced here`,
      details: `Contract Shield · ${v.contract_shield.old_field_name} → ${v.contract_shield.new_field_name}`,
    })),
    { annotation_type: 'VULNERABILITY', severity: 'CRITICAL',
      path: v.redteam_verifier.vulnerable_file, line: v.redteam_verifier.vulnerable_line,
      summary: 'CWE-639 IDOR — cross-tenant read confirmed by sandbox replay',
      details: v.redteam_verifier.poc_curl_command },
    { annotation_type: 'BUG', severity: 'MEDIUM',
      path: v.pipeline_medic.blamed_source_file, line: v.pipeline_medic.blamed_line_number,
      summary: v.pipeline_medic.stripped_traceback.at(-1) ?? 'Failing assertion',
      details: `Shadow pytest verified fix in ${v.pipeline_medic.shadow_pytest_duration_ms}ms` },
  ].slice(0, 100);

  await api.asApp().requestBitbucket(
    route`/2.0/repositories/${ws}/${repo}/commit/${sha}/reports/${REPORT_ID}/annotations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(annotations) });
}
```

**Why this matters:** findings render inside Bitbucket's **native diff**, and a required report blocks the **native merge dialog**. That is the money shot — not a replica button in a custom panel.

---

## 8. Forge App 2 — Jira, Rovo, MCP

### 8.1 Manifest (`/forge-jira-app/manifest.yml`)

```yaml
modules:
  jira:issuePanel:
    - key: cerberus-jira-blast-radius-panel
      resource: cerberus-jira-ui
      resolver:
        function: panelResolver
      title: Cerberus PR Verification & Blast Radius

  rovo:agent:
    - key: cerberus-rovo-secops-agent
      name: Cerberus
      description: Pre-merge verification, sandbox exploit replay, and self-healing patch agent.
      prompt: >
        You are Cerberus, an autonomous compiler-backed verification agent.
        Never guess or hallucinate line numbers, timings, or verdicts. Always invoke your
        actions to fetch live verdicts. If a proof phase is missing, say the verdict is
        incomplete rather than asserting safety. Bitbucket writes are executed by the
        Cerberus backend; you request them, you do not perform them.
      conversationStarters:
        - Why is PR #12 blocked from merging right now?
        - Replay the IDOR exploit on /api/v1/invoices/{id} and show the leaked fields
        - Apply the verified unified fix to PR #12 and unlock the merge check
        - Escalate the confirmed cross-tenant invoice leak into a P1 Jira Bug
      actions:
        - fetch-pr-verdict-action
        - replay-sandbox-exploit-action
        - apply-unified-fix-action
        - escalate-jira-bug-action

  action:
    - key: fetch-pr-verdict-action
      name: Fetch Cerberus 3-Head PR Verdict
      function: rovoActions.fetchVerdict
      actionVerb: GET
      description: Retrieves deterministic Contract Shield, RedTeam, and Pipeline Medic status for a PR.
      inputs:
        prId: { title: Pull Request ID, type: integer, required: true, description: "e.g. 12" }
    - key: replay-sandbox-exploit-action
      name: Replay Route Exploit in Isolated Sandbox
      function: rovoActions.replayExploit
      actionVerb: GET
      description: Boots the route in an ephemeral SQLite sandbox and returns the four-phase proof matrix.
      inputs:
        prId: { title: Pull Request ID, type: integer, required: true, description: "e.g. 12" }
        endpoint: { title: Target Endpoint, type: string, required: false, description: "defaults to /api/v1/invoices/inv_victim_901" }
    - key: apply-unified-fix-action
      name: Commit Verified Unified Fix to PR Branch
      function: rovoActions.applyUnifiedFix
      actionVerb: UPDATE
      description: Requests the backend to commit the verified unified patch via App 1 and re-verify.
      inputs:
        prId: { title: Pull Request ID, type: integer, required: true, description: "e.g. 12" }
    - key: escalate-jira-bug-action
      name: Escalate Confirmed Exploit to Jira P1 Bug
      function: rovoActions.escalateJiraBug
      actionVerb: CREATE
      description: Creates a linked Jira Bug with the runnable curl PoC, blast radius, and evidence digest.
      inputs:
        issueKey: { title: Parent Jira Issue Key, type: string, required: true, description: "e.g. CERB-104" }

  # rovo:mcp retained ONLY if C6 confirms the module exists.
  # Fallback: remote MCP server (Streamable HTTP + OAuth 2.1) at CERBERUS_BACKEND_URL/api/mcp
  rovo:mcp:
    - key: cerberus-pre-push-mcp-server
      name: Cerberus Pre-Push Verification MCP
      description: Pre-push AST contract diffing, sandbox exploit replay, and pipeline log diagnosis.
      function: mcp-handler-fn

  function:
    - key: panelResolver
      handler: index.panelResolver
    - key: rovoActions.fetchVerdict
      handler: rovoActions.fetchVerdict
    - key: rovoActions.replayExploit
      handler: rovoActions.replayExploit
    - key: rovoActions.applyUnifiedFix
      handler: rovoActions.applyUnifiedFix
    - key: rovoActions.escalateJiraBug
      handler: rovoActions.escalateJiraBug
    - key: mcp-handler-fn
      handler: mcpServer.handleMcpRequest

resources:
  - key: cerberus-jira-ui
    path: static/cerberus-jira-ui/dist

permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - storage:app
  external:
    fetch:
      backend:
        - "*.run.app"
        - "*.trycloudflare.com"
        - "*.ngrok-free.app"

app:
  runtime:
    name: nodejs20.x
```

> **No Bitbucket scopes here.** App 2 reads verdicts from the backend and requests writes through it.

### 8.2 Rovo Actions + Jira ADF Escalation

```ts
// forge-jira-app/src/rovoActions.ts
import api, { route, fetch } from '@forge/api';

const BACKEND = process.env.CERBERUS_BACKEND_URL!;
const H = { 'Content-Type': 'application/json', 'X-Cerberus-Job-Token': process.env.CERBERUS_JOB_TOKEN! };

export async function fetchVerdict({ prId }: { prId: number }) {
  const r = await fetch(`${BACKEND}/api/verdict/${prId}`, { headers: H });
  if (!r.ok) return { error: `No verdict available for PR #${prId}. Run verification first.` };
  return r.json();
}

export async function replayExploit({ prId, endpoint }: { prId: number; endpoint?: string }) {
  const r = await fetch(`${BACKEND}/api/replay-exploit`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ pr_id: prId, target_route: endpoint ?? '/api/v1/invoices/inv_victim_901' }),
  });
  return r.json();
}

export async function applyUnifiedFix({ prId }: { prId: number }) {
  // Backend performs the Bitbucket write via App 1 — App 2 holds no Bitbucket scope.
  const r = await fetch(`${BACKEND}/api/commit-unified-fix`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ pr_id: prId, idempotency_key: `rovo:${prId}:${Date.now()}` }),
  });
  return r.json(); // { state: 'PENDING', newCommitSha } — never claims PASS
}

export async function escalateJiraBug({ issueKey }: { issueKey: string }) {
  const parentKey = issueKey || 'CERB-104';
  const projectKey = parentKey.split('-')[0];

  const vr = await fetch(`${BACKEND}/api/verdict/12`, { headers: H });
  if (!vr.ok) return { error: 'No verified verdict to escalate. Cerberus does not file unproven bugs.' };
  const v = await vr.json();
  if (!v.redteam_verifier.exploit_confirmed) return { error: 'Exploit not empirically confirmed — escalation refused.' };

  const adf = {
    type: 'doc', version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text',
        text: `Cerberus confirmed ${v.redteam_verifier.vulnerability_class} and ${v.contract_shield.breaking_changes_count} breaking contract consumers on PR #12.` }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Proof matrix' }] },
      { type: 'codeBlock', attrs: { language: 'json' },
        content: [{ type: 'text', text: JSON.stringify(v.redteam_verifier.proof, null, 2) }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Runnable PoC (ephemeral sandbox only)' }] },
      { type: 'codeBlock', attrs: { language: 'bash' },
        content: [{ type: 'text', text: v.redteam_verifier.poc_curl_command }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Unified patch' }] },
      { type: 'codeBlock', attrs: { language: 'diff' },
        content: [{ type: 'text', text: v.unified_patch.combined_unified_diff }] },
      { type: 'paragraph', content: [{ type: 'text',
        text: `Evidence bundle ${v.evidence.bundle_id} · digest ${v.evidence.output_digest}` }] },
    ],
  };

  const createRes = await api.asApp().requestJira(route`/rest/api/3/issue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      project: { key: projectKey },
      summary: '[Cerberus P1] Confirmed IDOR cross-tenant invoice leak & schema break on PR #12',
      issuetype: { name: 'Bug' }, description: adf,
    }}),
  });
  const bug = await createRes.json();
  if (!bug?.key) throw new Error(`Jira create failed: ${createRes.status} ${JSON.stringify(bug)}`);

  await api.asApp().requestJira(route`/rest/api/3/issueLink`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: { name: 'Blocks' }, inwardIssue: { key: bug.key }, outwardIssue: { key: parentKey } }),
  });

  await linkArtifact(parentKey, v, bug.key);
  return { createdBugKey: bug.key, linkedTo: parentKey, evidence: v.evidence.bundle_id };
}
```

### 8.3 Linked Artifacts

```ts
// forge-jira-app/src/linkArtifact.ts
import api, { route } from '@forge/api';

export async function linkArtifact(issueKey: string, v: any, bugKey: string) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      globalId: `cerberus:verdict:${v.pr_id}:${v.source_commit}`,   // idempotent upsert
      object: {
        title: `Cerberus verdict · PR #${v.pr_id} · ${v.source_commit.slice(0, 7)}`,
        url: `${process.env.CERBERUS_BACKEND_URL}/evidence/${v.evidence.bundle_id}`,
        summary: v.merge_check_message,
        icon: { url16x16: 'https://cerberus.run/icon-16.png', title: 'Cerberus' },
      },
    }),
  });
}
```

> **Claim discipline:** an issue link is **not** Teamwork Graph entity ingestion. UI and video say *"linked artifacts surfaced in Jira"* unless native graph/DevInfo ingestion is verified and actually implemented. Overclaiming here is the fastest way to lose a technical judge.

---

## 9. Verification Core (Python)

### 9.1 Real Isolation (`/backend/isolation.py`)

```python
import json, os, signal, subprocess, sys, tempfile, time
from pathlib import Path

WORKERS = Path(__file__).parent

def run_isolated(worker: str, payload: dict, timeout_s: float = 2.5) -> dict:
    """Fresh interpreter, scrubbed env, own process group, killpg on timeout."""
    with tempfile.TemporaryDirectory(prefix="cerb-") as ws:
        env = {
            "HOME": ws, "TMPDIR": ws, "CERBERUS_WORKSPACE": ws,
            "PYTHONHASHSEED": "0", "PYTHONDONTWRITEBYTECODE": "1",
        }  # no tokens, no CERBERUS_BACKEND_URL, no cloud credentials
        t0 = time.perf_counter()
        proc = subprocess.Popen(
            [sys.executable, "-I", "-S", str(WORKERS / worker)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=ws, env=env, text=True, start_new_session=True,
        )
        try:
            out, err = proc.communicate(json.dumps(payload), timeout=timeout_s)
        except subprocess.TimeoutExpired:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)  # grandchildren die too
            out, err = proc.communicate()
            return {"status": "TIMEOUT", "worker": worker,
                    "wall_ms": round((time.perf_counter() - t0) * 1000, 2),
                    "stderr_tail": err.splitlines()[-20:]}
        return {
            "status": "OK" if proc.returncode == 0 else "ERROR",
            "wall_ms": round((time.perf_counter() - t0) * 1000, 2),
            "payload": json.loads(out) if out.strip().startswith("{") else None,
            "stderr_tail": err.splitlines()[-20:],
        }
```

```python
# Top of sandbox_worker.py AND shadow_runner.py — limits applied in-child (thread-safe)
import resource as r
r.setrlimit(r.RLIMIT_CPU,    (3, 3))
r.setrlimit(r.RLIMIT_AS,     (768 * 1024**2, 768 * 1024**2))
r.setrlimit(r.RLIMIT_NOFILE, (64, 64))
r.setrlimit(r.RLIMIT_FSIZE,  (8 * 1024**2, 8 * 1024**2))
r.setrlimit(r.RLIMIT_NPROC,  (48, 48))
```

### 9.2 SQLite That Persists

```python
# /backend/sandbox_worker.py
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,   # without this, every connection gets an empty DB → 404 not 200
)
```

### 9.3 Four-Phase Proof

```python
# /backend/sandbox_worker.py
TENANT_A, TENANT_B = "org_tenant_a_victim", "org_tenant_b_attacker"
VICTIM = "/api/v1/invoices/inv_victim_901"

def auth(org: str) -> dict:
    """Mint a demo JWT for the org AND send the legacy header. Both, always."""
    return {"Authorization": f"Bearer {mint_demo_jwt(org)}", "X-Tenant-ID": org}

def _suite(files: dict) -> dict:
    app = boot_app(files)                      # fresh import inside this subprocess
    with TestClient(app) as c:
        return {
            "attacker": c.get(VICTIM, headers=auth(TENANT_B)).status_code,
            "owner":    c.get(VICTIM, headers=auth(TENANT_A)).status_code,
            "forged":   c.get(VICTIM, headers={**auth(TENANT_B), "X-Tenant-ID": TENANT_A}).status_code,
        }

def prove(base_files: dict, patched_files: dict) -> dict:
    before, after = _suite(base_files), _suite(patched_files)
    return {
        "exploit_confirmed":     before["attacker"] == 200,
        "sealed":                after["attacker"] in (403, 404),
        "no_lockout":            after["owner"] == 200,          # defeats `raise 403 always`
        "header_forgery_sealed": after["forged"] in (403, 404),
        "before": before, "after": after,
    }
```

**Invariant:** if any of the four booleans is false, `merge_check_allowed` is forced `False` and the verdict is marked `INCOMPLETE_PROOF`.

### 9.4 Shadow Runner (`/backend/shadow_runner.py`)

```python
import json, re, sys, time, subprocess, pathlib

def run_shadow(workspace: str) -> dict:
    t0 = time.perf_counter()
    p = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--no-header"],
        cwd=workspace, capture_output=True, text=True, timeout=8,
    )
    wall_ms = round((time.perf_counter() - t0) * 1000, 2)
    m = re.search(r"(\d+) passed(?:.*?in ([\d.]+)s)?", p.stdout)
    f = re.search(r"(\d+) failed", p.stdout)
    return {
        "passed": int(m.group(1)) if m else 0,
        "failed": int(f.group(1)) if f else 0,
        "pytest_reported_ms": round(float(m.group(2)) * 1000, 2) if m and m.group(2) else None,
        "process_wall_ms": wall_ms,      # labeled separately in the UI (D12)
        "stdout_tail": p.stdout.splitlines()[-40:],
        "exit_code": p.returncode,
    }
```

### 9.5 Principal From Claims (`/demo-seed-repo/backend/auth.py`, post-patch)

```python
import jwt
from fastapi import Header, HTTPException

def current_principal(
    authorization: str = Header(...),
    x_tenant_id: str | None = Header(default=None),
) -> Principal:
    claims = jwt.decode(
        authorization.removeprefix("Bearer "), SIGNING_KEY,
        algorithms=["HS256"], audience="cerberus-api",
    )
    org = claims["org_id"]                                  # authoritative, server-verified
    if x_tenant_id and x_tenant_id != org:                  # header is a hint, never a grant
        raise HTTPException(403, "Tenant header does not match authenticated principal")
    return Principal(sub=claims["sub"], org_id=org)
```

```python
# /demo-seed-repo/backend/routes.py — synthesized guard
invoice = db.query(Invoice).filter(
    Invoice.id == invoice_id,
    Invoice.org_id == principal.org_id,     # scoped in the query, not post-hoc
).first()
if invoice is None:
    raise HTTPException(404, "Invoice not found")   # 404: no cross-tenant existence oracle
```

**Status-code semantics (deliberate, and shown in the UI):**
`403` = authenticated attacker whose header contradicts their claim.
`404` = scoped miss — no existence oracle for other tenants.
E2E asserts `403|404` on the scoped path and labels it `SEALED`.

### 9.6 Adapter That Does Not Re-Break Clients

```python
# /demo-seed-repo/backend/models.py — synthesized Contract Shield patch
from pydantic import BaseModel, ConfigDict, Field, AliasChoices, computed_field

class CheckoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    cart_id: str
    promo_code: str | None = Field(
        default=None,
        validation_alias=AliasChoices("promo_code", "discount_code"),
        description="Promo code. `discount_code` accepted as a deprecated alias until 2027-01.",
        json_schema_extra={"deprecatedAliases": ["discount_code"], "sunset": "2027-01-01"},
    )

    @computed_field(description="DEPRECATED mirror of promo_code; removed 2027-01.")
    @property
    def discount_code(self) -> str | None:
        return self.promo_code
```

Accepts both keys on input; emits both on output for one deprecation window. **No `serialization_alias` rename.** Head 1's explanation string states the sunset date.

### 9.7 Generalization Benchmark (`/backend/mutation_fuzz.py`)

```python
import random
from cerberus_engine import run_verdict
from seed import seed_repo, seed_repo_healed, mutate   # mutate records ground-truth lines

def fuzz(n: int = 24) -> dict:
    results = []
    for i in range(n):
        variant, truth = mutate(seed_repo(), rng=random.Random(i))
        # randomizes: field names, route paths, param names, discount divisor, line offsets
        v = run_verdict(variant)
        results.append((v, truth))
    clean = run_verdict(seed_repo_healed())
    return {
        "mutants": n,
        "detection_rate": sum(v.overall_status == "FAIL" for v, _ in results) / n,      # target >= 0.95
        "false_positives_on_clean": count_findings(clean),                              # target == 0
        "line_accuracy": mean(
            v.contract_shield.blast_radius[0].line_number == t.line for v, t in results
        ),                                                                              # target == 1.0
    }
```

Rendered as a CI-computed top-bar badge. **This converts the biggest credibility liability into the strongest differentiator.**

### 9.8 Evidence Bundle (`/backend/evidence.py`)

```python
import hashlib, json, uuid

def digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def build_bundle(files: dict, seed: int, verdict: dict, timings: dict) -> dict:
    inputs = {"file_hashes": {k: digest(v) for k, v in sorted(files.items())}, "sandbox_seed": seed}
    body = {"bundle_id": str(uuid.uuid4()), "inputs": inputs, "timings": timings, "verdict": verdict}
    body["output_digest"] = digest(body)
    return body   # persisted; linked from Code Insights report + Jira ADF + MCP responses
```

---

## 10. Express Gateway (`/server.ts`)

### 10.1 Session-Scoped Workspaces

```ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID, createHmac } from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser(process.env.CERBERUS_COOKIE_SECRET));

function requireSession(req: any, res: any): string {
  let sid = req.signedCookies?.cerb_sid;
  if (!sid) {
    sid = randomUUID();
    res.cookie('cerb_sid', sid, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 36e5 });
  }
  return sid;
}

const workspaceFor = (sid: string) => path.join(process.env.CERBERUS_WS_ROOT ?? '/tmp/cerb-ws', sid);

async function ensureWorkspace(sid: string) {
  const ws = workspaceFor(sid);
  await fs.mkdir(ws, { recursive: true });
  await fs.cp(SEED_REPO, ws, { recursive: true, force: false, errorOnExist: false });
  return ws;
}
// /api/reset-trapdoor and /api/mutate-file operate ONLY on workspaceFor(sid)
```

### 10.2 Bounded Concurrency + Coalescing + Abort

```ts
const MAX_WORKERS = Number(process.env.CERBERUS_MAX_WORKERS ?? 2);
let active = 0;
const queue: Array<() => void> = [];
const acquire = () => new Promise<void>(r => (active < MAX_WORKERS ? (active++, r()) : queue.push(() => (active++, r()))));
const release = () => { active--; queue.shift()?.(); };

const inflight = new Map<string, Promise<any>>();

app.post('/api/verify', async (req, res) => {
  const sid = requireSession(req, res);
  const ws = await ensureWorkspace(sid);
  const key = `${sid}:${hashFiles(req.body.files_override ?? {})}:${req.body.source_commit ?? 'local'}`;

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      await acquire();
      const ctl = new AbortController();
      req.on('close', () => ctl.abort());          // propagates to killpg in isolation.py
      try { return await verify(ws, req.body, ctl.signal); }
      finally { release(); inflight.delete(key); }
    })());
  }
  try { res.json(await inflight.get(key)); }
  catch (e: any) { res.status(503).json({ error: 'Cerberus core unavailable', detail: String(e) }); }
});

// Async job intake for Forge triggers — returns 202 immediately, ingests later
app.post('/api/jobs', requireJobToken, (req, res) => {
  res.status(202).json({ accepted: true });
  void runJobAndIngest(req.body);   // → HMAC POST to App 1 webtrigger + Code Insights
});
```

**Cloud Run:** `--min-instances=1 --cpu=2 --memory=2Gi --concurrency=4`. Warm the worker pool on boot.

### 10.3 Localhost Hardening

```ts
app.use('/api/mcp', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:3000)?$/.test(origin)) return res.sendStatus(403);
  if (req.headers.authorization !== `Bearer ${process.env.CERBERUS_MCP_TOKEN}`) return res.sendStatus(401);
  next();
});

app.listen(3000, '127.0.0.1');   // never 0.0.0.0 in local mode
```

### 10.4 REST Surface

`/api/verify` · `/api/verdict/:prId` · `/api/replay-exploit` · `/api/commit-unified-fix` · `/api/reset-trapdoor` · `/api/mutate-file` · `/api/jira-issue` · `/api/rovo-chat` · `/api/jobs` · `/api/mcp` · `/evidence/:bundleId` · `/healthz`

---

## 11. Dual-Mode Transport (`/src/lib/transport.ts`)

```ts
export type CerberusEndpoint =
  | '/api/verify' | '/api/verdict' | '/api/replay-exploit' | '/api/commit-unified-fix'
  | '/api/reset-trapdoor' | '/api/mutate-file' | '/api/jira-issue' | '/api/rovo-chat' | '/api/mcp';

type Host = 'local' | 'bitbucket' | 'jira';
let hostPromise: Promise<Host> | null = null;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('forge-context-timeout')), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });

async function detectHost(): Promise<Host> {
  if (typeof window === 'undefined') return 'local';
  try {
    const { view } = await import('@forge/bridge');
    const ctx: any = await withTimeout(view.getContext(), 400);  // no hostname sniffing
    const t = String(ctx?.moduleType ?? ctx?.extension?.type ?? '').toLowerCase();
    if (t.includes('bitbucket')) return 'bitbucket';
    if (t.includes('jira')) return 'jira';
    return 'jira';
  } catch { return 'local'; }
}

export const getHost = (): Promise<Host> => (hostPromise ??= detectHost());

export async function cerberusRequest<T>(
  endpoint: CerberusEndpoint,
  body?: Record<string, unknown>,
): Promise<T> {
  if ((await getHost()) !== 'local') {
    const { invoke } = await import('@forge/bridge');
    const r: any = await invoke('panelResolver', { endpoint, body });   // key matches BOTH manifests
    if (r?.ok === false) throw new Error(`Cerberus resolver: ${r.error}`);
    return (r?.data ?? r) as T;
  }
  const res = await fetch(endpoint, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Cerberus transport ${res.status}: ${await res.text()}`);
  return res.json() as T;
}
```

---

## 12. MCP Specification

### 12.1 Client Configs

```jsonc
// mcp_config.http.json — Cursor / Claude Code (Streamable HTTP)
{
  "mcpServers": {
    "cerberus-pre-push-guard": {
      "type": "http",
      "url": "http://127.0.0.1:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${CERBERUS_MCP_TOKEN}" }
    }
  }
}
```

```jsonc
// mcp_config.stdio.json — offline IDE, no running server required
{
  "mcpServers": {
    "cerberus-pre-push-guard": {
      "command": "npx",
      "args": ["tsx", "server.ts", "--mcp-stdio"],
      "env": {
        "CERBERUS_TARGET_REPO": "./demo-seed-repo",
        "CERBERUS_SANDBOX_MODE": "strict-isolated",
        "CERBERUS_ALLOW_MUTATION": "true"
      }
    }
  }
}
```

> `command`+`args` (stdio) and `url` (HTTP) are **mutually exclusive**. `transport: "http-jsonrpc"` is not a recognized client value. Never ship them in one entry.

### 12.2 `initialize` Result — `serverInfo` lives here

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": { "listChanged": false } },
    "serverInfo": { "name": "cerberus-pre-push-mcp", "version": "2.6.0" }
  }
}
```

**Negotiation rule:** echo the client's `protocolVersion` if it is in `SUPPORTED_VERSIONS`; otherwise return the latest supported. Never hardcode a stale pin. Handle `notifications/initialized`. Streamable HTTP requires `Accept: application/json, text/event-stream` and returns `Mcp-Session-Id`.

### 12.3 `tools/list` Result — tools only

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "verify_schema_diff",
        "description": "Parses Python AST and TypeScript call graphs between the working branch and main to identify breaking schema field renames, compute exact downstream file:line blast radius, and synthesize a backward-compatible Pydantic V2 AliasChoices adapter.",
        "annotations": { "readOnlyHint": true, "idempotentHint": true },
        "inputSchema": {
          "type": "object",
          "properties": {
            "pr_id": { "type": "integer", "default": 12 },
            "models_source": { "type": "string", "description": "Optional uncommitted Pydantic model source." }
          },
          "required": ["pr_id"]
        }
      },
      {
        "name": "replay_route_exploit",
        "description": "AST taint tracking into ORM sinks, ephemeral SQLite sandbox with Victim and Attacker tenants, four-phase proof matrix, runnable curl PoC, and tenant-scoping patch.",
        "annotations": { "readOnlyHint": true, "idempotentHint": true },
        "inputSchema": {
          "type": "object",
          "properties": {
            "pr_id": { "type": "integer", "default": 12 },
            "target_route": { "type": "string", "default": "/api/v1/invoices/inv_victim_901" },
            "attacker_org_id": { "type": "string", "default": "org_tenant_b_attacker" }
          },
          "required": ["pr_id"]
        }
      },
      {
        "name": "diagnose_pipeline_log",
        "description": "Strips container noise, correlates the failing pytest assertion with git diff blame, runs the candidate patch in an isolated shadow runner, returns the verified diff and both timing measures.",
        "annotations": { "readOnlyHint": true, "idempotentHint": true },
        "inputSchema": {
          "type": "object",
          "properties": {
            "pr_id": { "type": "integer", "default": 12 },
            "run_shadow_pytest": { "type": "boolean", "default": true }
          },
          "required": ["pr_id"]
        }
      },
      {
        "name": "synthesize_and_commit_unified_patch",
        "description": "Merges the three head fixes into one conflict-free diff and re-verifies it. Dry-run by default; commits only when commit=true with a matching expected_parent_sha.",
        "annotations": { "readOnlyHint": false, "destructiveHint": true, "idempotentHint": false },
        "inputSchema": {
          "type": "object",
          "properties": {
            "pr_id": { "type": "integer", "default": 12 },
            "commit": { "type": "boolean", "default": false },
            "expected_parent_sha": { "type": "string", "description": "Required when commit=true." },
            "commit_message": { "type": "string", "default": "fix(cerberus): unified contract adapter, tenant guard & discount calc" }
          },
          "required": ["pr_id"]
        }
      }
    ]
  }
}
```

### 12.4 `tools/call` Result Shape

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "{\"overall_status\":\"FAIL\",\"evidence\":{\"bundle_id\":\"...\"}}" }],
    "isError": false
  }
}
```

Write tool requires bearer **and** `commit: true` **and** a matching `expected_parent_sha`; otherwise it returns the diff plus evidence bundle and changes nothing. Tool descriptions contain no model-directed instructions (tool-poisoning hygiene).

---

## 13. Trapdoor Seed Repository (`/demo-seed-repo`)

Real Python + TypeScript representing PR `#12` (`feat/promo-refactor` → `main`).

**Defect 1 — Contract Shield.** `backend/models.py:18` renames `discount_code` → `promo_code` with no alias. Consumers `frontend/src/Checkout.tsx:84` and `mobile/api/cart.ts:42` break with HTTP 422. Fix: §9.6.

**Defect 2 — RedTeam Verifier.** `backend/routes.py:47` queries `Invoice` by id with no tenant scope, and `current_user` is derived from `X-Tenant-ID` — **the header trust is the root cause, not a symptom.** Sandbox seeds `inv_victim_901` (`org_tenant_a_victim`, `cfo@acme-corp.io`, `total_cents=485000`, `tax_id=US-99-4102938`). Attacker JWT for tenant B reads it → HTTP 200 leak. Fix: §9.5 + §9.3 four-phase proof.

**Defect 3 — Pipeline Medic.** `backend/checkout.py:31` computes `rate / 1000.0` instead of `rate / 100.0`. `tests/test_checkout.py:29` fails: `assert 98.0 == 80.0` (subtotal 100.0, rate 20.0). Fix restores `rate / 100.0`; shadow runner reports actual measured timings.

> **Currency note:** the seed intentionally uses float money to make the assertion legible. The Medic explanation flags float currency as a secondary smell and recommends integer cents / `Decimal` — it does not silently rewrite the domain model.

> **PII note:** all seeded identities are synthetic. The `curl` PoC targets the ephemeral sandbox only, carries a demo-scoped token, and is labeled `SANDBOX ONLY — NOT A PRODUCTION ENDPOINT`.

---

## 14. Verification Protocol

### 14.1 Hard Gate 0 — Generalization + Contracts

```bash
forge lint --manifest forge-bitbucket-app/manifest.yml
forge lint --manifest forge-jira-app/manifest.yml
python backend/mutation_fuzz.py --n 24 --min-detection 0.95 --max-fp 0 --line-accuracy 1.0
```

### 14.2 Playwright (`/tests/e2e_cerberus.spec.ts`)

```ts
const IGNORE = [/Download the React DevTools/, /favicon/, /\[forge\] bridge handshake/];

page.on('pageerror', e => { throw e; });                       // always fatal
page.on('console', m => {
  if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) throw new Error(m.text());
});

// Latency: warm-up, then p95 over 5 runs — never a single cold call
await request.post('/api/verify', { data: warmup });
const samples = await Promise.all([...Array(5)].map(() => timedVerify()));
expect(percentile(samples, 95)).toBeLessThan(3500);
```

**Assertions:**
1. Initial gate blocked; local button carries `data-simulated="true"`; all three heads crimson.
2. `Checkout.tsx:84` and `cart.ts:42` present in the Blast-Radius DOM with correct line numbers.
3. Exploit replay renders `HTTP 200 OK` and `cfo@acme-corp.io`.
4. **Proof matrix:** `exploit_confirmed ✓ · sealed ✓ · no_lockout ✓ · header_forgery_sealed ✓`.
5. Commit → gate `PENDING` → re-verify → all heads emerald; **no PASS before ingest**.
6. Reset restores `STATE_BLOCKED_VERIFIED` **for this session only**.
7. Two concurrent browser contexts complete independently without state bleed.

### 14.3 MCP Protocol Suite

`initialize` → `notifications/initialized` → `tools/list` → `tools/call` × 4 against `/api/mcp`, validating result shapes, version negotiation, session header, and that the write tool is a no-op without `commit: true`.

### 14.4 Contract Codegen

```jsonc
"scripts": {
  "codegen:schema": "python backend/export_schema.py > src/types/verdict.schema.json && json-schema-to-typescript src/types/verdict.schema.json -o src/types/verdict.d.ts",
  "gate:0": "npm run forge:lint && python backend/mutation_fuzz.py",
  "verify:ci": "npm run codegen:schema && git diff --exit-code src/types/verdict.d.ts && tsc --noEmit && playwright test"
}
```

### 14.5 Manual Browser Verification

Use the **`browse` MCP in OpenCode** for manual UI testing instead of ad-hoc browser scripts, static mocks, or screenshot-only checks. Open the running app at `http://127.0.0.1:3000`, inspect the page before acting, use accessible refs/locators, and confirm every state change with a fresh page read.

---

## 15. Phase-by-Phase Roadmap

| Phase | Deliverable | Hard gate |
|---|---|---|
| **0 — Contracts** | `docs/platform-contracts.md`, both manifests lint-clean | **HG0:** every C1–C12 row `CONFIRMED` or `FALLBACK-SELECTED`; `forge lint` passes |
| **1 — Core** | Seed repo, `isolation.py`, `sandbox_worker.py`, `shadow_runner.py`, `cerberus_engine.py`, `evidence.py` | **HG1:** `--mode verify` exits 0 with valid verdict, exact line numbers, four-phase proof all true; fuzz benchmark meets thresholds |
| **2 — Gateway & Forge** | `server.ts`, sessions, semaphore, MCP, both Forge apps, ingest, Code Insights | **HG2:** REST + MCP round-trip pass; HMAC ingest rejects bad/stale signatures; commit writes `PENDING` only |
| **3 — UI** | Obsidian console, transport, mini-map, PoC terminal, diff viewer, editor, a11y | **HG3:** zero TS/build errors; full Playwright suite green incl. concurrency test |
| **4 — Cloud** | Deploy both apps, tunnel/Cloud Run, native gate | **HG4:** real native merge dialog blocked by required Code Insights report; gate p95 <150ms; ADF P1 bug; Rovo round-trip |
| **5 — Submission** | Out of scope — demo and submission are not required | — |

---

## 16. Latency Budget — Single Source of Truth

| Metric | Contract | Measured how |
|---|---|---|
| Merge gate response (warm cache) | p95 **< 150ms** | `Date.now()` delta inside `evaluateMergeGate` |
| Merge gate response (cache miss) | **< 150ms**, fail-closed `IN_PROGRESS` | same |
| 3-head parallel verification (warm) | p95 **< 3500ms** | server `total_execution_ms`, 5-run p95 |
| Single isolated worker | hard timeout **2.5s** → `killpg` | `isolation.run_isolated` |
| Shadow pytest suite | **reported, not asserted** | `pytest_reported_ms` and `process_wall_ms`, labeled separately |
| Cold start | **excluded and disclosed** | labeled `COLD` in telemetry, never mixed into p95 |

**Nothing ships hardcoded.** Every number shown in the UI or demo is measured at runtime.

---

## 17. Security, Privacy & Eligibility

1. **Egress disclosure.** Source snapshots leave Atlassian for the Cerberus backend. Disclosed in-product (§4.4.5), in the README, and in the submission form.
2. **"Runs on Atlassian" trade-off.** A remote Python backend forfeits that eligibility signal `[CONTRACT C11]`. Mitigation: scope the remote backend to the **demo repository only**; publish a roadmap for a Forge-native deterministic core. State the trade-off explicitly rather than hoping no one asks.
3. **Mutation kill switch.** `CERBERUS_ALLOW_MUTATION=false` in cloud. Live arbitrary-code editing is local-only. The UI labels isolation honestly (D2).
4. **Secrets.** Worker env is scrubbed. No cloud credentials, backend URLs, or tokens inside any subprocess.
5. **Auth.** HMAC + timestamp on ingest; job token on `/api/jobs`; bearer + Origin allowlist + loopback on MCP; signed session cookies.
6. **Data retention.** Verdicts TTL 30min in Forge; evidence bundles TTL 24h in backend; hourly GC.
7. **Synthetic data only.** No real customer identifiers, tokens, or endpoints anywhere in the seed repo or PoC.

---

## 18. Three-Minute Demo Choreography (Optional)

> **Optional — not part of build acceptance.** This section is useful only as a manual walkthrough script. Do not record a video or build submission assets as part of the build.

| Time | Beat | Notes |
|---|---|---|
| 0:00–0:20 | **Native merge lock.** Real Bitbucket PR `#12`, native merge dialog blocked by the required Cerberus report. Live gate ms in the check message. | The money shot. Not a replica. |
| 0:20–0:32 | **Fuzz benchmark.** `24/24 mutants · 0 false positives · 100% line accuracy`. One sentence: "this is not pattern-matching a demo." | Kills the #1 judge objection in 12 seconds. |
| 0:32–1:02 | **Head 1.** AST diff `models.py:18`; click mini-map → `Checkout.tsx:84`, `cart.ts:42`; adapter diff with sunset date. | |
| 1:02–1:42 | **Head 2.** Taint path → live replay → `HTTP 200 — LEAKED cfo@acme-corp.io, $4,850.00`. Then the **four-phase proof matrix**, lingering on `OWNER ACCESS PRESERVED ✓`. | The positive control is what separates a security product from a security animation. |
| 1:42–2:05 | **Head 3.** 420-line log → 7-line traceback at `checkout.py:31`; both timing measures shown. | |
| 2:05–2:35 | **Cross-head synthesis + commit.** Unified diff → commit with `parents` pinning → `PENDING` → re-verify → emerald → **native merge dialog unlocks**. | Show the PENDING state. It proves you don't fake green. |
| 2:35–2:52 | **Rovo.** One real conversation: apply the fix / escalate. Jira P1 ADF bug pre-rolled and shown in 4s. | Depth on one beats a blur across four. |
| 2:52–3:00 | **MCP.** 5-second flash of a real `tools/call` response with the evidence digest. Close on the bundle. | |

---

## 19. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bitbucket:mergeCheck` unavailable/renamed | Med | High | Code Insights required report (C2/C12 fallback) |
| Pipelines event not exposed to Forge | High | Med | `repo:build_status_updated` webhook or REST polling |
| `rovo:mcp` module does not exist | Med | Med | Remote MCP server over Streamable HTTP + OAuth 2.1 |
| Cold start blows latency demo | High | Med | `min-instances=1`, warm-up, disclose cold vs warm |
| Judge concurrency corrupts state | Med | High | Per-session workspaces + concurrency E2E test |
| Code Insights merge check requires Premium | Med | High | Verify workspace plan at Phase 0; fall back to C2 |
| Multipart unsupported in Forge runtime | Med | Low | urlencoded `/src` (§7.5) |
| Schema drift Pydantic ↔ TS | Med | Med | Codegen + `git diff --exit-code` in CI |

---

## 20. Environment & Run

```bash
# Backend / local
CERBERUS_BACKEND_URL=http://127.0.0.1:3000
CERBERUS_MCP_TOKEN=<random-32>
CERBERUS_COOKIE_SECRET=<random-32>
CERBERUS_JOB_TOKEN=<random-32>
CERBERUS_INGEST_SECRET=<random-32>
CERBERUS_WS_ROOT=/tmp/cerb-ws
CERBERUS_MAX_WORKERS=2
CERBERUS_ALLOW_MUTATION=true          # false in cloud

# Forge (forge variables set …)
CERBERUS_BACKEND_URL=https://<cloud-run-or-tunnel>
CERBERUS_INGEST_SECRET=<same-as-backend>
CERBERUS_JOB_TOKEN=<same-as-backend>
CERBERUS_BB_INGEST_URL=<forge webtrigger url>
```

```bash
npm run gate:0            # lint + fuzz benchmark
npm run dev               # Express + Vite on 127.0.0.1:3000
npm run verify:ci         # codegen + tsc + Playwright
forge deploy && forge install
```

### 20.1 Windows Local Notes

- Use `py -3.12` or `.venv\Scripts\python.exe`; the machine default `python` may be newer and unsupported by some dependencies.
- Set `CERBERUS_WS_ROOT=./.cerberus-ws` instead of `/tmp/cerb-ws`.
- `isolation.py` must branch on `sys.platform`: Windows uses Job Objects + `taskkill /T /F`; POSIX keeps `resource`, `start_new_session`, and `killpg`. Never import `resource` on Windows.
- Forge CLI 15.x requires Node 24.22.1+ or 26.12.1+; verify with `forge --version` after changing Node versions.
- Manual UI checks use the `browse` MCP in OpenCode (§14.5).

---

## 21. Definition of Done

- [ ] HG0–HG4 all green, dated, with logs archived in `docs/gates/`
- [ ] Every C1–C12 contract confirmed or fallback selected
- [ ] Four-phase proof true on the seeded trapdoor **and** on ≥95% of 24 mutants
- [ ] Zero false positives on the healed repo
- [ ] No PASS ever written without signed backend ingest
- [ ] Native Bitbucket merge dialog blocked and unlocked with a real required report
- [ ] Two concurrent sessions verified independent
- [ ] Zero hardcoded timings in UI or tests
- [ ] Egress disclosed in-product

**Done means the native gate blocks and unlocks, Rovo commits through App 1, the four-phase proof holds, and every contract is verified — with every number measured live.**
