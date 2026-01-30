# Backlog (Prioritized Stories)

This backlog is the canonical list Codex can implement. If work is not here (or in `roadmap.md`), it is out of scope.

Each story includes acceptance criteria. Stories are grouped by epic.

---

## E1 Workspace & RBAC
### S1.1 Firm creation + basic settings
**Acceptance criteria**
- User can create a firm workspace with region (UK/IE) and timezone.
- Firm defaults are stored.
- All records are firm-scoped.

### S1.2 User invites & roles
**Acceptance criteria**
- Admin can invite a user by email.
- Invited user can accept invite and set password.
- Admin can assign roles ADMIN/PREPARER/REVIEWER.
- Role changes emit audit events.

---

## E2 Audit logging
### S2.1 Audit event infrastructure
**Acceptance criteria**
- AuditEvent table exists and write helper functions are available.
- Key actions emit events per `docs/12_audit_log.md`.

---

## E3 Clients
### S3.1 Client CRUD
**Acceptance criteria**
- Create, edit, archive clients.
- Client has payroll_system, frequency, default reviewer.

---

## E4 Pay runs
### S4.1 Pay run create + list
**Acceptance criteria**
- Create pay runs with period and revision number.
- Duplicates prevented; revision flow available.

### S4.2 State machine enforcement
**Acceptance criteria**
- Illegal transitions rejected server-side.
- State transitions emit audit events.

---

## E5 File ingestion
### S5.1 Upload flow (signed URL + finalize)
**Acceptance criteria**
- User uploads file, sees import created.
- Import hash computed.
- Duplicate file detection.

### S5.2 Async parsing job
**Acceptance criteria**
- Worker parses CSV/XLSX.
- Stores row numbers.
- Errors visible in UI.

### S5.3 Direct-to-S3 uploads with production CORS + size handling
**Acceptance criteria**
- Direct browser uploads to S3 work without CORS errors.
- Bucket CORS is configured for the production app origin.
- Large uploads avoid serverless memory/timeouts.
- Upload flow remains audited and firm-scoped.

---

## E6 Mapping templates
### S6.1 Mapping wizard UI
**Acceptance criteria**
- User maps columns to required fields per source type.
- Preview normalized rows and totals.
- Save client-scoped template.

### S6.2 Template versioning + drift detection
**Acceptance criteria**
- Template edits create new version.
- If columns differ, drift flagged and user prompted.

---

## E7 Reconciliation checks
### S7.1 Implement MVP check functions
**Acceptance criteria**
- CHK_REGISTER_NET_TO_BANK_TOTAL works and creates exception with evidence.
- CHK_JOURNAL_DEBITS_EQUAL_CREDITS works.
- Results deterministic.

### S7.2 Reconciliation run orchestration
**Acceptance criteria**
- ReconciliationRun stored with bundle version and template versions.
- Re-run invalidates previous run and supersedes exceptions.

---

## E9 Exceptions
### S9.1 Exception queue + detail view
**Acceptance criteria**
- Filter by severity/status.
- Detail shows formula + evidence.

### S9.2 Resolution actions
**Acceptance criteria**
- Resolve and dismiss require notes.
- Override requires reviewer.

---

## E10 Approvals + packs
### S10.1 Submit for review + approve/reject
**Acceptance criteria**
- Gating checks enforced.
- Approve/reject recorded with comment.

### S10.2 Pack generation
**Acceptance criteria**
- Generates PDF with required sections.
- Stores metadata.

### S10.3 Pack locking
**Acceptance criteria**
- After lock, pay run becomes read-only.
- Changes require revision.

---

## E11 Search
### S11.1 Search pay runs and packs
**Acceptance criteria**
- Search by client + period.
- Pack download available.

---

## E12 Hardening
### S12.1 Redaction settings applied to packs
### S12.2 Logging hygiene + PII scrub
### S12.3 Observability + job retries

---

## E13 Dashboard
### S13.1 Operational overview dashboard
**Acceptance criteria**
- Shows firm-scoped counts for pay runs by key states (draft, mapped, exceptions open, ready for review, locked).
- Surfaces "Next steps" tiles for missing sources, mapping required, and approvals pending.
- Recent activity list shows latest audit events (firm-scoped, non-PII).
- Quick actions link to create client/pay run and run reconciliation.

---

## E14 Templates Library
### S14.1 Template library list + filters
**Acceptance criteria**
- Lists latest template versions for each (client, source type, name).
- Filters by client scope, source type, and status (draft/active/deprecated).
- Shows drift status and last-used timestamp (if available).
- Firm-scoped queries and RBAC enforced.

### S14.2 Template detail + history
**Acceptance criteria**
- Detail view shows current mapping summary, required fields coverage, and source columns.
- Version history list includes status, created-by, created-at, and drift notes.
- Actions to set a template version active or deprecated (admin/preparer only).

---

## Epic X — Remaining Work (Audit Consolidation)
This epic is the **authoritative list of remaining work** across the PRD, ProductSpec, Roadmap, and `/docs/*`.
All new build work should be added here first.

### X1 Background jobs + queue (worker real implementation)
**Acceptance criteria**
- Worker app runs job handlers for: parse import, normalize import, run reconciliation, generate pack.
- Jobs are idempotent with retry-safe updates and audited transitions.
- Web triggers enqueue jobs instead of running heavy tasks inline.
- Job status and failures are visible in UI (with retry action where appropriate).

### X2 Import pipeline completeness
**Acceptance criteria**
- Import status transitions follow: `UPLOADED → PARSING → PARSED → MAPPED → READY` with strict enforcement.
- Async parsing persists `parseSummary` (rows/columns/sheet metadata).
- A user can retry parse after `ERROR_PARSE_FAILED`.
- Import delete/void is supported (tombstone + `IMPORT_DELETED` audit event).

### X3 Normalization storage (deterministic evidence)
**Acceptance criteria**
- Normalized datasets are persisted (DB or object storage) per import/version.
- Evidence pointers resolve without re-reading raw files.
- Normalization is deterministic and versioned in pack metadata.

### X4 Reconciliation check gaps
**Acceptance criteria**
- Implement import sanity checks (rowcount nonzero, duplicate rows) with evidence pointers.
- Add reasonableness checks (period variance, new pay element detection) as WARN-only.
- Optional line-level matching (employee net → bank line) with deterministic matching and explainability.

### X5 Bank/payment summary alternative
**Acceptance criteria**
- Support a payment summary export as an alternative to bank file.
- Review gating accepts the configured substitute source.
- Mapping + reconciliation work correctly for the summary source type.

### X6 Pack fidelity vs spec
**Acceptance criteria**
- Pack PDF includes all sections in `docs/11_pack_generation_and_locking.md`.
- Exceptions section includes outcomes + notes and evidence pointers.
- Optional evidence bundle ZIP can be generated (if enabled).

### X7 Security, observability, retention
**Acceptance criteria**
- Sentry (or equivalent) is wired for web + worker with correlation IDs.
- Job metrics (durations, failures) are captured.
- PII scrubbing tests cover logs and audit metadata.
- Retention/deletion policy implemented for imports and packs (per `docs/14_security_privacy_redaction.md`).

### X8 User lifecycle management
**Acceptance criteria**
- Admin can disable users; disabled users cannot sign in.
- `USER_DISABLED` audit event emitted.
- UI shows disabled state and blocks actions for disabled users.

### X9 Fixtures + integration coverage
**Acceptance criteria**
- Sanitized fixtures added (register/bank/gl/statutory + variants).
- Integration tests cover upload → parse → map → reconcile → pack using fixtures.

---

## Open Questions / Proposed Changes
- Auto-populate mapping wizard selections by matching uploaded column headers to known field aliases (header heuristics), so users start with best-guess mappings.
- 2026-01-29: Expand E2E coverage beyond critical flows to cover all app functionality with Playwright; this conflicts with `testing.md` (E2E = critical flows only) and needs a scope/time decision.
