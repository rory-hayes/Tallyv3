# Production Readiness Gap Epics — Sprint Backlog (Engineers)

**Project:** Tally (Payroll Reconciliation Verification Layer — UK & Ireland)  
**Doc purpose:** This is the sprint execution backlog to harden Tally from “demo-ready” to “bureau-grade” with auditable controls, robust ingestion, explainable exceptions, and pack reliability.

---

## How to use this backlog

- Treat each **Epic** as a sprint goal candidate.  
- Each Epic is broken into **Stories** with:
  - **Scope**
  - **Acceptance Criteria (Given/When/Then)**
  - **Implementation Notes** (how to build it and where in the repo)
  - **Test Requirements**
- **Definition of Done (DoD)** applies to every story:
  1. Server-side enforcement (not just UI)
  2. Audited events emitted
  3. Tests added/updated and passing (`pnpm test`)
  4. CI passes (`lint`, `typecheck`, `test`)
  5. Docs updated if behavior changed (state machine, data model, user journey)

---

## Sprint gating principles (non-negotiable)

1) **Immutability:** source files are immutable; corrections create a new import version.  
2) **Explainability:** every failed check must provide numbers, a delta, and evidence pointers.  
3) **Determinism:** checks are typed controls, not a user-programmable rules DSL (configurable thresholds only).  
4) **Auditability:** every workflow step emits an audit event.  
5) **Security:** no raw storage URLs exposed; download is RBAC-scoped via server.

---

# Epic A — Trust Hardening (P0 Blockers)

## A1. Strict file validation (stop accepting invalid XLSX/CSV)

**Problem:** Tool accepts malformed “xlsx” files (e.g., zip bundles) without error; undermines trust and causes downstream failures.

### Scope
- Validate uploaded files at **upload** time and again at **parse** time.
- Reject invalid files with clear, user-facing errors and logged diagnostics.

### Acceptance Criteria
- **Given** a user uploads a file with `.xlsx` extension that is not a valid workbook  
  **When** the import is created  
  **Then** the import status becomes `ERROR_FILE_INVALID` and the UI shows: “Invalid Excel file. Export again as .xlsx or .csv.”
- **Given** a user uploads a `.xlsx` that is structurally valid but contains no readable sheets  
  **When** parsing runs  
  **Then** import becomes `ERROR_PARSE_FAILED` and UI shows a deterministic error.
- **Given** a user uploads a `.csv` that is not parseable (binary/invalid encoding)  
  **When** parsing runs  
  **Then** import becomes `ERROR_PARSE_FAILED`.
- **Given** a valid workbook/csv  
  **When** parsing runs  
  **Then** import progresses to `PARSED` and exposes sheet/column metadata.

### Implementation Notes
- Storage layer: store `content_type`, `size_bytes`, `sha256`, `original_filename`, `uploaded_at`.
- Upload validation:
  - `.xlsx`: verify ZIP signature (PK) AND presence of `xl/workbook.xml` (minimum viable workbook validation).
  - `.csv`: validate UTF-8 (or detect common encodings), ensure >0 rows and delimiter detect.
- Parse validation:
  - Use a single parsing module in worker: open workbook, enumerate sheets; fail fast.
- Where:
  - `apps/web` upload route/action + `apps/worker` parsing job.
  - Database: extend Import model to carry `error_code`, `error_message`, `sha256`, `content_type`, `size_bytes`.

### Test Requirements
- Unit tests: file signature validator for xlsx/csv
- Integration tests:
  - upload invalid xlsx → import ERROR
  - upload valid xlsx → import PARSED

---

## A2. Import pipeline statuses (make them real and consistent)

**Problem:** UI shows “Version 1 · PENDING” even after reconciliation; status semantics unclear.

### Scope
Implement a strict import pipeline with clear state transitions.

### Target statuses (minimum)
- `UPLOADED` (stored in object storage)
- `PARSING` (worker running)
- `PARSED` (sheet/columns detected; row count known)
- `MAPPING_REQUIRED` (no template applied yet)
- `MAPPED` (mapping saved & applied)
- `READY` (normalized rows persisted; ready for checks)
- `ERROR_*` (typed error codes)

### Acceptance Criteria
- **Given** a file upload completes  
  **Then** import shows `UPLOADED` immediately.
- **Given** worker parsing starts  
  **Then** import shows `PARSING`.
- **Given** parsing completes successfully  
  **Then** import shows `PARSED` with sheet count + row count.
- **Given** mapping saved successfully  
  **Then** import shows `MAPPED`.
- **Given** normalization completes  
  **Then** import shows `READY`.
- **Given** reconciliation completes  
  **Then** import statuses remain correct (not reset) and pay run reconciliation status updates.

### Implementation Notes
- Add a `ImportStatus` enum and enforce transitions server-side.
- Worker jobs must update status using idempotent updates.
- UI should display:
  - Import version (V1, V2…)
  - Status badge
  - Parsed metadata (rows, columns)
  - Mapping template name/version

### Test Requirements
- Integration: upload → parse → map → normalize should produce expected statuses in order.

---

## A3. Exceptions routes must always work (even if empty)

**Problem:** “View exceptions” and sidebar Exceptions are dead/unresponsive.

### Scope
- Implement functional routes:
  - `/exceptions` (portfolio view)
  - `/pay-runs/:id/exceptions` (run view)

### Acceptance Criteria
- **Given** a pay run has zero exceptions  
  **When** user visits exceptions routes  
  **Then** show empty-state with explanation and link back.
- **Given** a pay run has exceptions  
  **Then** show list view with severity, category, status, assignee, and last update.

### Implementation Notes
- Ensure RBAC + firm scoping on exceptions queries.
- Default empty-state message should explain: “Exceptions are generated when reconciliation checks fail.”

### Test Requirements
- Integration: reconcile with mismatch dataset → exceptions appear and page renders.

---

## A4. Pack download must be secure and reliable (no raw S3 URLs)

**Problem:** pack download currently breaks with environment restrictions and likely leaks storage URLs.

### Scope
- Replace pack download links with server endpoint:
  - `GET /packs/:packId/download`
- Endpoint validates RBAC + firm scoping, then streams file OR returns a short-lived signed URL (redirect).

### Acceptance Criteria
- **Given** user in firm A requests pack in firm A  
  **Then** download succeeds.
- **Given** user in firm B requests pack in firm A  
  **Then** 404 or 403 (do not leak existence).
- **Given** storage is unavailable  
  **Then** user sees friendly error and audit logs capture failure.

### Implementation Notes
- Packs table should store `storage_key`, `content_type`, `size_bytes`, `sha256`.
- Streaming recommended for simplicity; signed URLs acceptable if expiring quickly.
- Add download audit event: `PACK_DOWNLOADED`.

### Test Requirements
- Integration: create pack → download endpoint returns 200.
- RBAC test: cross-firm access fails.

---

## A5. Test discipline enforcement (no more “tests not run”)

### Scope
- Ensure root scripts exist and are consistent:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Ensure GitHub Actions runs all three.

### Acceptance Criteria
- **Given** clean checkout  
  **When** engineer runs above commands  
  **Then** they complete successfully.
- CI workflow fails if any step fails.

### Implementation Notes
- Add workspace-level scripts that delegate to packages/apps.
- Ensure worker and web tests are included.

### Test Requirements
- N/A (this is the testing system).

---

# Epic B — Core Reconciliation Completeness (Minimum viable bureau-grade checks)

## B1. Register ↔ Statutory totals reconciliation (category-level)

### Scope
- Implement check comparing register totals to statutory totals by category.
- Support UK and IE bundles:
  - UK: PAYE tax, Employee NI, Employer NI, pensions (if provided), other deductions
  - IE: PAYE, USC, PRSI (employee/employer), pensions (if provided)

### Acceptance Criteria
- **Given** mapped statutory file includes categories and amounts  
  **When** reconciliation runs  
  **Then** system compares mapped statutory categories to derived register totals.
- **Given** delta exceeds tolerance  
  **Then** check FAILS and exception created `STATUTORY_MISMATCH`.
- **Given** statutory file missing and is optional  
  **Then** WARN “Statutory file missing” (no blocking), unless firm config marks it required.

### Implementation Notes
- Use mapping to normalize statutory rows:
  - `category_key` (internal enum) + `amount`
- Provide category mapping UI:
  - Map raw text (e.g., “PAYE”, “Income Tax”) to internal keys.
- Tolerance model:
  - absolute and percent thresholds, firm defaults, client overrides.

### Test Requirements
- Unit: category mapping resolver
- Integration: mismatch statutory totals creates exception.

---

## B2. Register ↔ GL journal totals reconciliation (expense + liabilities)

### Scope
Implement checks:
1) Journal balances (already)
2) Register-derived totals tie to journal totals:
   - Payroll expense (gross)
   - Employer costs (employer NI/PRSI, employer pension if present)
   - Net wages payable liability
   - Tax/NI/PRSI liabilities
   - Pension liabilities

### Acceptance Criteria
- **Given** GL journal is mapped to include account code and amount debit/credit  
  **When** reconciliation runs  
  **Then** Tally computes expected journal totals and compares within tolerance.
- **Given** the journal is balanced but misallocated  
  **Then** Tally raises a `JOURNAL_MISMATCH` exception with clear delta and evidence pointers.

### Implementation Notes
- You will need a minimal account classification system:
  - firm-level or client-level mapping of account codes to classes: EXPENSE, NET_PAYABLE, TAX_PAYABLE, NI/PRSI_PAYABLE, PENSION_PAYABLE, CASH/BANK, OTHER
- Start with a UI that allows the user to classify accounts for a client.
- If no classification exists, downgrade this check to WARN with guidance.

### Test Requirements
- Integration: misclassified or mismatching journal creates exceptions.

---

## B3. Bank payments sanity checks (data quality controls)

### Scope
Add checks that payroll specialists routinely do:
- Duplicate payments (same payee + amount + date/ref)
- Zero/negative payments
- Payment count mismatch vs number of paid employees (WARN)
- Bank total matches net but there are unmatched records (if employee matching enabled)

### Acceptance Criteria
- **Given** duplicate lines exist beyond threshold  
  **Then** create `BANK_DATA_QUALITY` exception (severity HIGH).
- **Given** a negative payment exists  
  **Then** exception created.
- **Given** count mismatch > X%  
  **Then** WARN.

### Test Requirements
- Unit: duplicate detection
- Integration: mismatching bank data triggers expected exceptions.

---

# Epic C — Explainability & Evidence (Make issues easy to find)

## C1. Evidence pointers and contributor breakdown for each check

### Scope
For each FAIL check, provide:
- delta math
- top contributors (ranked)
- evidence pointers referencing source rows (import_id + row_id)

### Acceptance Criteria
- **Given** Register vs Bank mismatch  
  **Then** exception detail shows:
  - register total, bank total, delta
  - list of missing employees and/or unmatched payments (top contributors)
  - click into evidence rows showing relevant source values

### Implementation Notes
- Normalized tables must carry `source_import_id` and `source_row_number` (or stable row ID).
- Provide a “Raw row” view and “Normalized row” view.

### Test Requirements
- Integration: mismatch dataset yields contributor list and evidence pointers.

---

## C2. Exception detail view with guided remediation

### Scope
Exception detail should show:
- What failed
- Why it typically fails (2–3 common causes)
- What to do next (upload corrected file, adjust account classification, add expected variance)

### Acceptance Criteria
- Every exception has a remediation panel with deterministic text (no AI required).
- Provide CTA buttons:
  - “Upload corrected source”
  - “Update mapping”
  - “Add expected variance” (if permitted)

---

# Epic D — Noise Control & Governance (Expected variances + tolerances)

## D1. Firm/client tolerance configuration

### Scope
Implement hierarchical config:
- firm defaults
- client overrides
- pay run overrides (optional; requires reviewer)

### Acceptance Criteria
- Changing tolerance triggers an audit event and affects subsequent reconciliations.
- Tolerances shown in check detail so results are explainable.

---

## D2. Expected Variances (structured overrides)

### Scope
First-class model for known recurring differences:
- directors paid separately
- pension paid separately
- rounding differences
- multi-batch payments

### Acceptance Criteria
- **Given** an expected variance exists  
  **When** reconciliation runs and mismatch fits the variance  
  **Then** downgrade severity (e.g., FAIL → WARN) and annotate “Expected variance applied”.
- Expected variances require reviewer/admin permission.
- Changes to expected variances are audited.

### Implementation Notes
- Avoid arbitrary logic. Use structured types:
  - variance_type, min/max delta, optional pattern match on payee/reference, required note/attachment.

### Test Requirements
- Unit: variance matching engine
- Integration: same mismatch becomes WARN when variance enabled.

---

# Epic E — Workflow Hygiene (Review/approval and revisions)

## E1. Approval hygiene: comments required + maker/checker enforcement

### Scope
- Require a comment on approve/reject OR explicit “No comment” checkbox captured in audit.
- Prevent preparer approving their own pay run unless explicit firm setting allows.

### Acceptance Criteria
- Approve/reject always records reviewer_id, timestamp, and comment artifact.
- Attempt by preparer to approve is blocked unless allowed.

---

## E2. Revision creation rules are enforced

### Scope
- Only create revision when previous is LOCKED.
- Revision inherits metadata but resets imports/results.

### Acceptance Criteria
- Illegal revision creation fails server-side with clear message.

---

# Epic F — Optional but high impact for real-world parity

## F1. Pension schedule as optional source

### Scope
Add a 5th optional source type: `PENSION_SCHEDULE`.
- Used to reconcile employer/employee pension totals and timing.

### Acceptance Criteria
- If provided, check pension totals in register align with pension schedule.
- If not provided, no fail, only optional note.

---

## F2. Posted journal confirmation (accounting API or file)

### Scope
Allow optional “posted journal” import to prove the journal was actually posted.
- Start file-based; later integrate Xero/QBO APIs.

---

# Epic G — Release readiness & security

## G1. PII controls and redaction for packs

### Scope
- Redaction policy for PDF packs: allow masking NI numbers, bank details, etc.
- Store only what is necessary; avoid exposing PII in audit events.

### Acceptance Criteria
- Pack generation respects firm-level redaction settings.
- Audit events contain IDs, not names.

---

## G2. Retention and deletion policy (baseline)

### Scope
- Firm setting for retention period.
- Archive and (optional) delete old packs/imports with audit trail.

---

# Audit Events (minimum catalog for the above work)

Engineers must ensure these are emitted consistently:
- `IMPORT_UPLOADED`, `IMPORT_PARSING_STARTED`, `IMPORT_PARSED`, `IMPORT_MAPPING_SAVED`, `IMPORT_READY`, `IMPORT_ERROR`
- `RECONCILIATION_STARTED`, `RECONCILIATION_COMPLETED`, `RECONCILIATION_FAILED`
- `EXCEPTION_CREATED`, `EXCEPTION_RESOLVED`, `EXCEPTION_DISMISSED`, `EXCEPTION_OVERRIDDEN`
- `PAY_RUN_SUBMITTED_FOR_REVIEW`, `PAY_RUN_APPROVED`, `PAY_RUN_REJECTED`
- `PACK_GENERATED`, `PACK_DOWNLOADED`, `PACK_LOCKED`
- `TOLERANCE_UPDATED`, `EXPECTED_VARIANCE_CREATED/UPDATED/ARCHIVED`

---

# Suggested sprint sequencing (recommended)

## Sprint 1 (Hardening / Trust)
- A1 Strict file validation
- A2 Import pipeline statuses
- A3 Exceptions routes always work
- A4 Secure pack download endpoint
- A5 Test discipline enforced

## Sprint 2 (Core reconciliation parity)
- B1 Register ↔ Statutory checks
- B2 Register ↔ GL totals checks (with account classification)
- B3 Bank sanity checks

## Sprint 3 (Explainability + noise control)
- C1 Evidence pointers + top contributors
- C2 Guided remediation UI
- D1 tolerances config
- D2 expected variances

## Sprint 4 (Operational polish)
- E1 approval hygiene
- E2 revision enforcement polish
- F1 pension schedule optional source (if demanded by pilots)
- G1 pack redaction baseline

---

# Done means “pilotable”

Tally is **pilotable** when:
- Invalid files cannot enter the system.
- Every status on screen is correct and stable.
- Exceptions list and detail pages work reliably.
- Pack download works via secure endpoint.
- Minimum viable checks beyond the initial two exist (Statutory + Journal tie-out).
- Evidence pointers make finding the root cause faster than Excel.
- Tests run on every sprint and CI is green.

