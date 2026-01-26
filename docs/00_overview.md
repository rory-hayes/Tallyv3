# Overview — What we are building

## Product definition
Tally is a payroll reconciliation and verification platform for payroll bureaus and accounting firms.

It is not a payroll calculation engine. The payroll register export is treated as the calculation truth, and Tally verifies that downstream artifacts (payments, GL postings, statutory totals) are consistent with that truth.

## MVP posture
- File-first ingestion
- Deterministic checks with explainable outputs
- Evidence-first exceptions
- Audit-ready pack generation

## Key principles
1. **Immutability**: imports and packs are versioned; locked packs cannot be mutated.
2. **Explainability**: failures must include the math and evidence pointers.
3. **Configurable, not programmable**: toggles/thresholds/expected variances, not customer-authored code.
4. **Least privilege**: RBAC by role; audit log for sensitive actions.

## The core sources
- Payroll Register (CSV/XLSX export)
- Bank / Payments (BACS/SEPA file or payment summary export)
- GL Journal export (CSV/XLSX)
- Statutory Totals export (summary report)
Optional:
- Pension Schedule export (optional; reconciles pension totals)

## Output artifact
- Reconciliation Pack (PDF) + optional evidence bundle
- Must contain: version IDs, timestamps, preparer/reviewer sign-off, exception outcomes.
