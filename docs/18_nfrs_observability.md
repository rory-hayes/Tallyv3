# Non-Functional Requirements (NFRs) & Observability

## Performance targets (MVP)
- Upload finalize response < 1s (async processing afterwards)
- Parse + normalize a 50k-row CSV in < 60s (worker)
- Reconciliation checks complete in < 30s for typical pay runs
- Pack generation < 30s for typical packs

## Reliability
- All background jobs must be idempotent.
- Jobs must record status and error details for user visibility.
- Import processing is recoverable: retry is safe.

## Observability
- Structured logging (JSON) with correlation IDs (pay_run_id, import_id, job_id)
- Error tracking (Sentry or equivalent)
- Basic metrics: job durations, queue depth, failure rates

## Logging hygiene
- Never log:
  - file contents
  - employee names, NI numbers, bank details
  - raw rows
- Log only counts, hashes, and IDs.

## Backups
- Automated DB backups and object storage lifecycle policies (prod).

## Acceptance criteria
- Any failed job is visible to the user with a retry action.
- Sentry alerts for unhandled exceptions.
- A single pay run can be traced end-to-end via correlation IDs.
