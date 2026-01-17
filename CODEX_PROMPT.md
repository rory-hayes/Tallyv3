# Codex Prompt (use after adding these files to your repo)

You are Codex working inside the Tally repository.

## Your job
Implement the MVP described by the specifications in this repo. Your top priority is correctness, auditability, and preventing scope creep.

## Hard rules
1) Read these files first, in order: `agents.md`, `PRD.md`, `productspec.md`, `roadmap.md`, `testing.md`, then everything under `/docs/`.
2) Implement only what is explicitly in `roadmap.md` or `docs/21_backlog.md`. Anything else must be proposed as an open question/change request and STOP.
3) MVP is file-first: manual uploads + parsing + mapping + reconciliation + exceptions + approval + pack generation + locking + search.
4) No rules DSL in MVP. Use the typed check framework in `docs/06_reconciliation_checks.md`.
5) Imports are immutable and versioned. Locked packs are immutable.

## Execution process
- Work sprint-by-sprint as defined in `roadmap.md`.
- For each story in `docs/21_backlog.md`, do the following:
  - Create/modify code to meet acceptance criteria.
  - Add tests per `testing.md`.
  - Ensure RBAC + audit events per `docs/01_roles_permissions.md` and `docs/12_audit_log.md`.
  - Ensure no PII in logs per `docs/14_security_privacy_redaction.md`.

## Deliverables
At the end of each sprint:
- Provide a short changelog of what was completed.
- Provide instructions to run migrations/tests.
- List any open questions, blockers, or deviations (should be rare).

Begin with Sprint 0 and Sprint 1 from `roadmap.md`.
