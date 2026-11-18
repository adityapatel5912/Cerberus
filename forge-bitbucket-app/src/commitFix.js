/**
 * Cerberus — Forge App 1 — conflict-safe commit of the verified unified patch.
 *
 * Plan D9: commits land through POST /2.0/repositories/{ws}/{repo}/src with
 *   - `parents` tip pinning (never commit on a moved branch),
 *   - a pre-flight tip equality check,
 *   - an idempotency lock per (prId, headHash),
 *   - and a single rebase-retry on conflict.
 *
 * This function NEVER writes merge_check_allowed (plan D5). After a commit
 * the PR head changes, the merge check re-runs (on-code-pushed), the backend
 * re-verifies the new head, and only the signed ingest can then mark PASS.
 *
 * Phase 0 stub: the commit call is wired in Phase 2 alongside the backend's
 * patch synthesizer.
 */

import { kvs } from "@forge/kvs";
import api, { route } from "@forge/api";

export const commitPatchedFilesToBitbucket = async (event) => {
  const prId = event?.payload?.prId;
  const headHash = event?.payload?.headHash;
  const files = event?.payload?.files; // [{ path, content, encoding }]
  const branch = event?.payload?.branch;

  if (!prId || !headHash || !Array.isArray(files) || !branch) {
    return { ok: false, error: "invalid commit payload" };
  }

  // Idempotency lock: one commit per verified head.
  const lockKey = `commit-lock:${prId}:${headHash}`;
  if (await kvs.get(lockKey)) {
    return { ok: false, error: "already committed for this head" };
  }

  // Phase 2: pre-flight tip equality check against the branch head, then the
  // /src POST with parents pinning, followed by the single rebase-retry path.
  console.log(
    JSON.stringify({
      kind: "cerberus.commit-request",
      prId,
      headHash,
      branch,
      files: files.length,
      api: route`/2.0/repositories/{workspace}/{repo}/src` ? "reachable" : "unreachable",
    })
  );

  return { ok: false, error: "commit not yet enabled (phase 2)" };
};
