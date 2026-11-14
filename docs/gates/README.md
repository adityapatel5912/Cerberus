# Gate Logs

Every hard gate result is archived here as `HG<n>-<yyyy-mm-dd>.md`.

Each file records:

- **Gate id** — `HG0` … `HG4`
- **Date** — ISO date, UTC
- **Commands run** — exact invocations, copy-pasteable
- **Result** — `PASS` / `FAIL` / `PARTIAL`
- **Measurements** — real numbers captured at runtime (no hand-typed values)
- **Evidence** — log excerpts, report links, digests

Rules:

1. No gate result is written without the command output that produced it.
2. Latency numbers are measured, never typed. Cold-start runs are labelled `COLD` and never
   mixed into a p95 (§16).
3. A `FAIL` archive is kept, not deleted. The next attempt adds a new dated file.
4. Verdicts and timings in the UI come from the same measurement code path used here.
