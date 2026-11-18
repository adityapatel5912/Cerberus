/**
 * Cerberus — Forge App 1 — push and build-status triggers.
 *
 * Both handlers are FIRE-AND-FORGET (plan section 7.4): they never block the
 * event, never write verdicts, and simply dispatch a verification job to the
 * Cerberus backend at CERBERUS_BACKEND_URL (set via `forge variables set`).
 *
 * Phase 0 stubs: the dispatch call is wired in Phase 2 together with the
 * backend's /api/jobs endpoint. Until then both handlers log and no-op so
 * the events are observable in `forge logs` during development.
 */

/**
 * avi:bitbucket:updated:pullrequest — fired when a PR is updated; the payload
 * carries a `changes` object ONLY when a new commit reached the source branch
 * (contract C3, corrected identifier). We dispatch verification jobs solely
 * on code-level updates, not metadata edits.
 */
export const onCodePushed = async (event) => {
  const prId = event?.pullrequest?.id;
  const isCodePush = Boolean(event?.changes?.sourceBranch);

  console.log(
    JSON.stringify({
      kind: "cerberus.push",
      prId,
      isCodePush,
      repository: event?.repository?.uuid,
      workspace: event?.workspace?.uuid,
    })
  );

  if (!isCodePush) {
    // Metadata-only update (title, description, reviewers): nothing to verify.
    return;
  }

  // Phase 2: POST CERBERUS_BACKEND_URL/api/jobs with the job token.
};

/**
 * avi:bitbucket:created:build-status / avi:bitbucket:updated:build-status —
 * fired when a commit build status is created or updated (contract C4,
 * corrected identifiers; there is no avi:bitbucket:pipeline:failed event).
 * Pipeline Medic subscribes here and filters for failed states in code.
 */
export const onPipelineFailed = async (event) => {
  console.log(
    JSON.stringify({
      kind: "cerberus.build-status",
      keys: Object.keys(event ?? {}),
    })
  );

  // Phase 2: forward failed build statuses to the backend for log triage.
};
