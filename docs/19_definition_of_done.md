# Definition of Done (DoD)

A task/story is considered done only when:

## Functional
- Acceptance criteria are met.
- Happy path works end-to-end.
- Sad paths described in spec are handled and tested.

## Quality
- Unit tests exist for core logic.
- Integration tests cover DB + worker boundaries.
- Any bug fix includes a regression test.

## Security & compliance
- RBAC enforced server-side.
- Relevant actions emit audit events.
- No PII in logs.
- Pack redaction settings respected.

## UX
- No dead ends: errors show next steps.
- Loading/progress states for async operations.
- Locked state is clearly read-only.

## Documentation
- Any new behavior is reflected in the relevant `/docs/*.md`.
- Any scope change recorded in `docs/decision_log.md`.
