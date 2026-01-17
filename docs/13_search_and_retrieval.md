# Search & Retrieval

## Purpose
Enable users to quickly retrieve pay runs and packs for audits and client queries.

## MVP requirements
- Search by client name and period
- Filter by status (Draft/Reconciled/Approved/Locked)
- Pack list per client
- Direct download of pack PDF

## Indexing approach
MVP can rely on SQL queries with indexed columns:
- client.name (normalized)
- pay_run.period_start, period_end
- pay_run.status
- pack.generated_at

## UI
- Global search bar in app shell
- Client page includes “Packs” tab with pagination
- Pay run page includes “Pack” section with download link

## Sad paths
- Pack missing: show clear message and state (not generated, or job failed)
- Permission denied: show 404/denied

## Acceptance criteria
- Search results are firm-scoped
- Response time under NFR targets
- Pagination is stable and deterministic
