/**
 * Cerberus — Forge App 1 — verdict cache garbage collection.
 *
 * Runs hourly (scheduledTrigger in manifest.yml). Verdict cache entries carry
 * a 30-minute TTL (plan section 7.6); the sweep walks the key prefix with the
 * cursor-paginated kvs query (contract C8) and deletes anything expired,
 * so the cache can never grow unbounded.
 */

import { kvs, WhereConditions } from "@forge/kvs";

export const sweepExpiredVerdicts = async () => {
  const now = Date.now();
  let cursor;
  let scanned = 0;
  let deleted = 0;

  do {
    // One page at a time; cursors are never persisted (C8).
    let query = kvs
      .query()
      .where("key", WhereConditions.beginsWith("verdict:"))
      .limit(20);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();

    for (const entry of page.results ?? []) {
      scanned += 1;
      const storedAt = entry.value?.stored_at_ms;
      if (typeof storedAt === "number" && now - storedAt > 30 * 60 * 1000) {
        await kvs.delete(entry.key);
        deleted += 1;
      }
    }

    cursor = page.nextCursor;
  } while (cursor);

  console.log(JSON.stringify({ kind: "cerberus.gc", scanned, deleted }));
};
