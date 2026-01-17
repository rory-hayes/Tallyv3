# Tally — Agents Instructions (for Codex)

## Purpose
This repository contains a payroll reconciliation and verification product for payroll bureaus and accounting firms in the UK and Ireland.

Codex (and any other coding agent) must use these documents as the single source of truth. The goal is to ship an MVP that is **file-first**, **audit-ready**, and **low-support**.

## Operating rules (anti-scope-creep)
1. **Follow the specs**: All implementation must map to an Epic/Story in `roadmap.md` or `docs/21_backlog.md`.
2. **No new features by default**: If a requested change is not explicitly in scope, create an entry under **Open Questions / Proposed Changes** in the relevant doc and stop.
3. **Immutability is non-negotiable**: Imports are immutable; “replace” creates a new version. Packs can be locked.
4. **Explainability over cleverness**: Every reconciliation failure must be explainable (math + evidence pointers).
5. **Configurable, not programmable**: No general-purpose rules engine or DSL in MVP.
6. **Security baseline**: Least-privilege RBAC, audit log for sensitive actions, secure file storage, and PII redaction controls.
7. **Region-aware defaults**: UK/IE defaults exist, but are overrideable at firm/client level in structured ways.
8. **Keep it a modular monolith**: Start with a single deployable app + worker. No microservices.

## Documents (read in this order)
1. `PRD.md` — product goals, scope, success criteria
2. `productspec.md` — architecture, modules, data contracts
3. `roadmap.md` — sprints, epics, milestones
4. `testing.md` — test strategy and Definition of Done
5. `/docs/*` — detailed functional specifications

## MVP Definition (non-negotiable outcomes)
- Multi-tenant firm workspace with RBAC
- Clients and Pay Runs with a clear state machine
- File uploads for 4 source types: Register, Bank/Payments, GL Journal, Statutory Totals
- Mapping templates with validation and preview
- Reconciliation checks (totals-first) producing structured exceptions with evidence pointers
- Exception workflow: triage, resolve with notes/attachments, assignment
- Reviewer approval flow
- Pack generation (PDF) with immutable metadata + audit trail
- Pack locking (no edits after lock; revisions required)
- Search/retrieval for packs and pay runs

## Build order (enforced)
Codex must implement features in this order unless explicitly instructed otherwise:
1. Foundations: auth, orgs, RBAC, audit log skeleton
2. Client + pay run objects and state machine
3. File ingestion and storage (hashing, versioning)
4. Mapping templates and normalization pipeline
5. Reconciliation checks + exception model
6. Exception workflow UI + approvals
7. Pack generator + locking
8. Search + retrieval
9. Hardening: redaction, observability, testing coverage

## Change control
- Any deviation must be recorded in `docs/decision_log.md` with:
  - Date
  - Decision
  - Context
  - Alternatives
  - Consequences

## Definition of Done (DoD)
A story is done only if:
- It meets its acceptance criteria
- Tests are added per `testing.md`
- RBAC and audit logging are correct
- No PII is logged
- UI has happy + sad path handling

