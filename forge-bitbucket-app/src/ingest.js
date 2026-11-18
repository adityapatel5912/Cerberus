/**
 * Cerberus — Forge App 1 — verdict ingest webtrigger.
 *
 * THE ONLY WRITER OF PASS (plan D3/D5). The Cerberus backend calls this
 * webtrigger URL after completing the full three-head re-verification. The
 * request must carry:
 *
 *   Authorization: Cerberus-HMAC <hex hmac of (timestamp + body)>
 *   X-Cerberus-Timestamp: <unix seconds>
 *
 * A verdict whose signature is invalid, or whose timestamp is outside the
 * replay window, is rejected with 401. Nothing unverified ever lands in the
 * cache; therefore the read-only merge gate can trust whatever it reads.
 *
 * Phase 0 stub: signature verification and storage writes land in Phase 2
 * (the HMAC secret is shared with the backend via `forge variables set`).
 */

const MAX_CLOCK_SKEW_SECONDS = 300;

export const handleVerdictIngest = async (request) => {
  const auth = request?.headers?.["authorization"] ?? "";
  const timestamp = Number(request?.headers?.["x-cerberus-timestamp"] ?? 0);
  const payload = await request?.json?.();

  // Fail-closed: no signature, no ingest.
  if (!auth.startsWith("Cerberus-HMAC ")) {
    return new Response("missing hmac", { status: 401 });
  }
  if (!Number.isFinite(timestamp)) {
    return new Response("missing timestamp", { status: 401 });
  }
  if (!payload || payload.merge_check_allowed !== false && payload.merge_check_allowed !== true) {
    return new Response("invalid verdict envelope", { status: 400 });
  }

  // Phase 2: verify HMAC-SHA256(secret, `${timestamp}.${rawBody}`) and reject
  // timestamps older than MAX_CLOCK_SKEW_SECONDS to stop replay attacks, then
  // kvs.set(`verdict:${prId}:${headHash}`, payload) with a 30-minute TTL.

  return new Response("ingest not yet enabled", { status: 501 });
};
