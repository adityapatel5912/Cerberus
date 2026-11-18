/**
 * Cerberus — Forge App 2 — Jira panel resolver.
 *
 * Read-only surface for the issue panel: fetches the live verdict for a PR
 * from the Cerberus backend (CERBERUS_BACKEND_URL, set via forge variables).
 * Nothing here writes to Bitbucket (plan D10) and nothing self-attests a
 * verdict (plan D5) — the backend is the single source of truth.
 */

import Resolver from "@forge/resolver";

const resolver = new Resolver();

resolver.define("getLinkedVerdict", async ({ payload }) => {
  const { prId } = payload ?? {};
  if (!prId) {
    return { status: "UNKNOWN", error: "missing prId" };
  }

  // Phase 2: fetch `${backendUrl}/api/verdicts/${prId}` with the job token.
  // Until the backend exists this returns UNKNOWN so the panel renders an
  // honest empty state instead of a fabricated verdict.
  return { status: "UNKNOWN", prId };
});

resolver.define("getEvidenceBundle", async ({ payload }) => {
  const { evidenceKey } = payload ?? {};
  if (!evidenceKey) return { bundle: null };
  // Phase 2: lazy fetch by key (keeps invoke() payloads under the 500 KB cap, C9).
  return { bundle: null };
});

export const panelResolver = resolver.getDefinitions();
