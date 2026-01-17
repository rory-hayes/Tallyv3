# Testing — Tally

## 1. Testing goals
Tally is a controls product. The test strategy prioritizes:
- Correctness of parsing/normalization
- Deterministic reconciliation outputs
- Explainability (math + evidence pointers)
- Security (RBAC, audit log, no PII leakage)
- Regression safety (template drift, rounding, large files)

## 2. Test pyramid
### Unit tests (fast, many)
- Parsers and normalizers
- Check functions (each check type)
- Matching helpers (key derivations, rounding)
- State machine transitions

### Integration tests (fewer)
- Upload → parse → normalize → reconcile pipeline
- Template creation + application + versioning
- Exception workflow + approvals
- Pack generation includes correct metadata

### E2E tests (critical flows only)
- Happy path: create client, pay run, upload, map, reconcile, resolve, approve, generate pack, lock
- Sad path: wrong file, missing sources, mapping missing columns, pack lock prevents edits

## 3. Determinism requirements
- Given identical imports and templates, reconciliation output must be identical.
- Use fixed rounding rules and stable sort orders.
- Store versions: template_version, check_version, import_ids.

## 4. Golden test fixtures
Maintain a `/fixtures` directory in the repo (not included here) containing anonymized sample exports:
- register.csv, bank.csv, gl.csv, statutory.csv
- variants: missing columns, extra columns, different header names, different delimiters

Fixtures must be sanitized and contain no real PII.

## 5. Property-based / fuzz testing (recommended)
- Randomized row order should not change totals reconciliation.
- Small rounding perturbations within tolerance should not trigger FAIL.
- Duplicate imports should be idempotent.

## 6. Security tests
- RBAC tests for each route/action
- Attempt access to other firm’s resources must fail
- Ensure logs do not contain PII (add log-scrubber tests)

## 7. Performance tests (lightweight)
- Parsing 50k-row CSV within acceptable time
- Reconciliation job completes within defined thresholds (see NFRs)

## 8. Definition of Done (testing)
A story is done only if:
- Acceptance criteria are verified by automated tests where feasible
- Critical path has E2E coverage
- New checks include unit tests and at least one integration test
- Bugs add regression tests

## 9. Release checklist
- Run full test suite
- Run E2E suite
- Review audit log coverage
- Validate pack immutability
- Verify PII redaction settings
