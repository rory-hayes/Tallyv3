# Expected Variances (Structured Overrides)

## Purpose
Handle “this mismatch is normal for this client” without turning the product into a bespoke rules engine.

Examples:
- Directors are paid outside the main bank batch
- Pension is paid separately
- Expense reimbursements are included/excluded in bank totals
- Rounding differences

## Design
Expected variances are **declarative** objects that checks consult before producing FAIL exceptions.

## Data structure
ExpectedVariance
- id
- firm_id
- client_id
- applies_to_check_id (nullable: can apply to a category)
- variance_type: DIRECTORS_SEPARATE | PENSION_SEPARATE | ROUNDING | OTHER
- condition (structured):
  - amount_bounds: { min, max } (optional)
  - pct_bounds: { min, max } (optional)
  - reference_contains (optional)
  - payee_contains (optional)
- effect:
  - downgrade_to: PASS | WARN
  - requires_note: boolean
  - requires_attachment: boolean
  - requires_reviewer_ack: boolean
- active (boolean)
- created_by, created_at

## Workflow
- When a check would emit FAIL, it evaluates applicable ExpectedVariance records.
- If a record matches and bounds contain the delta:
  - status is downgraded per effect
  - a note is required if configured
  - reviewer acknowledgment required if configured

## UI requirements
- Admin/Reviewer can create ExpectedVariance templates per client.
- During exception resolution, preparer can suggest a new ExpectedVariance but it must be approved by Reviewer.

## Acceptance criteria
- Every downgrade is recorded in the audit log and reconciliation metadata.
- Variances are versioned (edits create a new version or record state change).
