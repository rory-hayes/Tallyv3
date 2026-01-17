# Dashboard Overview

## Purpose
Give preparers and reviewers a firm-wide operational view of where work stands and what needs attention next.

## MVP requirements
- Show firm-scoped counts for key pay run states: DRAFT, MAPPED, EXCEPTIONS_OPEN, READY_FOR_REVIEW, LOCKED.
- Show "Next steps" tiles:
  - Missing required sources (latest imports missing for required source types).
  - Mapping required (latest import lacks template).
  - Approvals pending (READY_FOR_REVIEW pay runs).
- Recent activity list from audit events (non-PII, firm-scoped).
- Quick actions: create client, create pay run, run reconciliation.

## Data + queries (MVP)
- Pay run counts grouped by status.
- Missing sources: pay runs with required sources missing for latest import versions.
- Mapping required: pay runs where latest import for a required source has no template.
- Approvals pending: pay runs in READY_FOR_REVIEW.
- Recent activity: latest 10 audit events for the firm.

## UI
- Summary card grid (counts).
- Action tiles for next steps with counts and deep links.
- Recent activity list with timestamps and actions.

## Acceptance criteria
- Firm scoping enforced on all data.
- No PII displayed in audit feed (IDs or action labels only).
- Dashboard loads under NFR targets.
