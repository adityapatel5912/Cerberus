/**
 * Cerberus — Forge App 1 — panel resolver.
 *
 * The PR panel (bitbucket:repoPullRequestOverviewPanel) invokes these backend
 * functions from the Custom UI via the @forge/bridge `invoke` method.
 *
 * Everything here is READ-ONLY against the verdict cache. Nothing in this file
 * may ever grant a PASS (plan D5): PASS only enters the cache through the
 * HMAC-authenticated webtrigger ingest (`ingest.js`), which the Cerberus
 * backend calls after full re-verification.
 */

import Resolver from "@forge/resolver";
import { kvs } from "@forge/kvs";

const resolver = new Resolver();

/**
 * Cache key for a PR verdict entry. Keyed by content hash of the PR head,
 * exactly like the backend's single source of truth (plan D3).
 * NOTE: the content hash is provided by the panel context / ingest flow;
 * the cache here is only an installation-local COPY of the backend verdict.
 */
const verdictKeyFor = (prId, headHash) => `verdict:${prId}:${headHash}`;

/** Default value returned when the backend has not published a verdict yet. */
const IN_PROGRESS = Object.freeze({
  status: "IN_PROGRESS",
  heads: {
    contract: "UNKNOWN",
    redteam: "UNKNOWN",
    pipeline: "UNKNOWN",
  },
  merge_check_allowed: false,
});

resolver.define("getVerdict", async ({ payload, context }) => {
  const { prId, headHash } = payload ?? {};
  if (!prId || !headHash) {
    return { ...IN_PROGRESS, error: "missing prId/headHash" };
  }
  const cached = await kvs.get(verdictKeyFor(prId, headHash));
  // Cache miss stays fail-closed: the UI shows IN_PROGRESS, never a verdict.
  return cached ?? IN_PROGRESS;
});

resolver.define("getEvidenceBundleKey", async ({ payload }) => {
  const { prId, headHash } = payload ?? {};
  if (!prId || !headHash) return { evidence_key: null };
  const cached = await kvs.get(verdictKeyFor(prId, headHash));
  // The bundle itself lives on the backend (TTL 24h); the panel fetches it
  // lazily by key so invoke() payloads stay far below the 500 KB cap (C9).
  return { evidence_key: cached?.evidence_key ?? null };
});

export const panelResolver = resolver.getDefinitions();
