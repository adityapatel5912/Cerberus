/**
 * Cerberus — Forge App 2 — Rovo action verbs.
 *
 * The Rovo agent calls these deterministic verbs (plan D10). They are thin,
 * honest proxies to the Cerberus backend:
 *   - never fabricate line numbers, timings, or verdicts;
 *   - an unavailable proof phase is reported as INCOMPLETE, never as safe;
 *   - Bitbucket writes are requested from the backend, never performed here;
 *   - Jira writes go through api.asUser() so Jira checks authorization itself.
 */

const UNAVAILABLE = (verb, reason) => ({
  verb,
  status: "UNAVAILABLE",
  reason,
});

/**
 * GET — live 3-head verdict for a PR.
 */
export const fetchVerdict = async ({ payload }) => {
  const { prId } = payload ?? {};
  if (!prId) return UNAVAILABLE("fetch-pr-verdict", "missing prId");
  // Phase 2: GET `${backendUrl}/api/verdicts/${prId}`.
  return UNAVAILABLE("fetch-pr-verdict", "backend wiring lands in phase 2");
};

/**
 * GET — replay the exploit in the ephemeral sandbox; returns the four-phase
 * proof matrix (leak confirmed / sealed / owner preserved / forgery sealed).
 */
export const replayExploit = async ({ payload }) => {
  const { prId, endpoint } = payload ?? {};
  if (!prId) return UNAVAILABLE("replay-sandbox-exploit", "missing prId");
  // Phase 2: POST `${backendUrl}/api/sandbox/replay` with prId + endpoint.
  return UNAVAILABLE("replay-sandbox-exploit", `sandbox replay for PR ${prId} (${endpoint ?? "default"}) lands in phase 2`);
};

/**
 * UPDATE — request that the backend commit the verified unified patch through
 * App 1. This app holds no Bitbucket scopes, so the write is proxied.
 */
export const applyUnifiedFix = async ({ payload }) => {
  const { prId } = payload ?? {};
  if (!prId) return UNAVAILABLE("apply-unified-fix", "missing prId");
  // Phase 2: POST `${backendUrl}/api/commits/unified-fix` — the backend then
  // drives App 1's commit flow with parents pinning (plan D9).
  return UNAVAILABLE("apply-unified-fix", "unified commit wiring lands in phase 2");
};

/**
 * CREATE — escalate a confirmed exploit into a P1 Jira Bug with an ADF
 * description (runnable curl PoC, blast radius, evidence digest) plus a
 * remote link back to the Bitbucket verdict.
 */
export const escalateJiraBug = async ({ payload, context }) => {
  const { issueKey } = payload ?? {};
  if (!issueKey) return UNAVAILABLE("escalate-jira-bug", "missing issueKey");

  // Phase 2: POST via api.asUser().requestJira(route`/rest/api/3/issue`) with
  // the ADF body, then attach the remote link. asUser() means Jira performs
  // its own authorization check for the acting user.
  return UNAVAILABLE("escalate-jira-bug", `escalation for ${issueKey} lands in phase 2`);
};
