# Exceptions Workflow

## Purpose
Define how exceptions are created, displayed, triaged, resolved, and audited.

## Exception model
An exception is a user-actionable item that blocks or informs pay run approval.

Fields:
- id
- pay_run_id
- reconciliation_run_id
- category: BANK_MISMATCH | JOURNAL_MISMATCH | STATUTORY_MISMATCH | SANITY
- severity: INFO | LOW | MEDIUM | HIGH | CRITICAL
- status: OPEN | RESOLVED | DISMISSED | OVERRIDDEN
- title (short)
- description (more detail)
- delta_value (decimal, optional)
- evidence_pointers (list)
- assigned_to (user_id, optional)
- resolution_note (optional)
- resolution_attachments (optional)
- created_at, updated_at

## Creation
- Exceptions are created from failing checks.
- Deduplicate by:
  - check_id + affected_totals signature
  - evidence pointers overlap

## UI flows
### Exception queue (happy path)
- Filter by severity/category/status/assignee
- Clicking an exception opens detail panel:
  - summary, delta, formula
  - evidence table(s) with highlighted rows
  - remediation hint

### Resolution actions
1) **Resolve**
   - requires a note
   - may require attachment (policy-based)
2) **Dismiss** (false positive)
   - requires a reason
   - tracked for improving templates/checks
3) **Override** (accept mismatch)
   - requires reviewer acknowledgment
   - includes explicit statement in pack
4) **Re-run reconciliation**
   - when imports/templates change, previous exceptions are superseded

## Severity rules (defaults)
- CRITICAL: register-to-bank net mismatch beyond tolerance
- HIGH: journal unbalanced, large statutory mismatch
- MEDIUM: line-level unmatched items
- LOW/INFO: reasonableness checks

## Acceptance criteria
- Every status change creates an audit event.
- Overrides require reviewer role.
- Pack includes exceptions with outcomes and notes.
