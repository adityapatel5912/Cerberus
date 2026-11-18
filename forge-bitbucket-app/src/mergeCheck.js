/**
 * Cerberus — Forge App 1 — the merge gate.
 *
 * READ-ONLY and FAIL-CLOSED (plan D4):
 *   - performs storage reads only,
 *   - never awaits the backend,
 *   - a cache miss returns a fast IN_PROGRESS-style failure,
 *   - never writes anything, and never self-attests PASS (plan D5).
 *
 * Bitbucket invokes this function on the merge-check triggers declared in the
 * manifest (on-code-pushed) and stores the returned result itself. If this
 * function throws, Bitbucket treats the check as FAILED — which is exactly
 * the fail-closed behaviour we want.
 */

import { kvs, WhereConditions } from "@forge/kvs";

/** Cache key mirroring the backend's verdict key (populated by ingest.js). */
const verdictKeyFor = (prId, headHash) => `verdict:${prId}:${headHash}`;

/** Lozenge-style message shown next to the check in the PR merge checklist. */
const message = (state, heads) =>
  `CERBERUS · ${state} · contract ${heads.contract} · exploit ${heads.redteam} · pipeline ${heads.pipeline}`;

/**
 * The merge check entrypoint.
 *
 * @param {object} event - merge-check payload: workspace/repository/pullrequest/trigger
 * @returns {Promise<{success: boolean, message: string}>} MergeCheckResponse
 */
export const evaluateMergeGate = async (event) => {
  const startedAt = Date.now();

  const prId = event?.pullrequest?.id;
  if (!prId) {
    // No PR context: fail closed immediately.
    return { success: false, message: "CERBERUS · missing pull request context · fail-closed" };
  }

  // Read every verdict cache entry that could match this PR. The ingest flow
  // stores the entry under the PR head's content hash; the trigger payload for
  // on-code-pushed tells us the PR but not always the head hash, so we scan
  // the verdict: prefix for this PR (bounded by the ingest TTL of 30 minutes).
  const scan = await kvs
    .query()
    .where("key", WhereConditions.beginsWith(`verdict:${prId}:`))
    .limit(20)
    .getMany();

  if (!scan.results?.length) {
    // Fail-closed IN_PROGRESS: never block on the backend, never guess.
    return { success: false, message: "CERBERUS · IN_PROGRESS · verdict cache miss · fail-closed" };
  }

  // The newest entry wins (ingest writes one entry per verified head).
  const newest = scan.results[scan.results.length - 1].value;
  const allowed = newest?.merge_check_allowed === true;

  // Gate p95 budget is <150 ms (plan section 16); we measure, never assert.
  const elapsedMs = Date.now() - startedAt;

  if (!allowed) {
    return {
      success: false,
      message: message(newest.status ?? "BLOCKED", newest.heads ?? {}),
    };
  }

  // PASS state — only ever present because the signed ingest wrote it
  // after the backend's full re-verification (ingest.js verifies the HMAC).
  return {
    success: true,
    message: `CERBERUS · READY TO SHIP · gate ${elapsedMs}ms (measured)`,
  };
};
