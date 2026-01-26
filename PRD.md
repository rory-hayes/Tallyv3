# PRD — Tally (Payroll Reconciliation & Verification)

## 1. Product statement
Tally is a reconciliation and verification layer for payroll bureaus and accounting firms in the UK and Ireland. It ingests payroll exports (registers, bank/payment files, GL journals, and statutory totals), ties them together, flags only real exceptions with row-level evidence, and generates an audit-ready reconciliation pack with preparer/reviewer sign-off.

**Tally does not calculate payroll** and does not replace existing payroll systems. It verifies and proves correctness.

## 2. Problem
Payroll teams can run payroll; they struggle to **prove** it’s correct across:
- what payroll says happened (register)
- what will be paid (bank/payment instruction)
- what will be posted (GL journal)
- what will be reported/submitted (statutory totals)

Today this is done with spreadsheets, screenshots, and ad hoc checklists—slow, inconsistent, and risky.

## 3. Target customers & personas
### 3.1 Primary customer
- Payroll bureaus and accounting firms running multi-client payroll in UK/Ireland.

### 3.2 Personas
- **Firm Admin**: configures workspace, users, branding, defaults.
- **Payroll Preparer**: creates pay runs, uploads exports, resolves exceptions, submits for review.
- **Payroll Reviewer/Manager**: reviews exceptions and approvals, locks packs.

(External client approval/auditor access is out of scope for MVP; see Roadmap.)

## 4. Goals & non-goals
### 4.1 Goals (MVP)
1. Reduce payroll close time by making reconciliation **exception-driven**.
2. Increase auditability: every exception has evidence and every action is logged.
3. Standardize process across all clients, regardless of payroll engine.
4. Generate a client/auditor-ready **Reconciliation Pack**.

### 4.2 Non-goals (explicitly out of scope for MVP)
- Payroll calculation, tax engines, payslip generation
- Submitting RTI/PAYE to HMRC/Revenue
- Timesheets/time & attendance validation
- IP warmup/content deliverability-style heuristics (not relevant)
- Custom scripting/DSL rules engine
- Full client portal / external approvals

## 5. MVP scope (what we will ship)
### 5.1 Core workflow
- Workspace (firm), RBAC, audit log
- Clients and pay runs with revisioning
- File ingestion for 4 sources:
  - Payroll Register
  - Bank/Payments (file or payment summary)
  - GL Journal
  - Statutory Totals summary
- Optional source:
  - Pension Schedule
- Mapping templates with validation + preview
- Reconciliation checks (totals-first) producing structured exceptions
- Exception workflow (triage, assign, resolve with notes/attachments)
- Submit for review, reviewer approve/reject
- Reconciliation Pack PDF generation
- Pack locking (immutable; revisions required)
- Search/retrieval by client and period

### 5.2 MVP reconciliation depth
- Totals reconciliation is mandatory.
- Employee-level matching is **optional** and only for sources where identifiers are available and stable.

## 6. Success metrics
### 6.1 Early (pilot) success
- < 15 minutes average time to onboard a new client template after first contact with exports
- > 80% of pay runs produce **< 10** exceptions after template stabilization
- Pack generated in < 60 seconds for typical pay run
- Strong qualitative signal: “We would not go back to spreadsheets.”

### 6.2 Business success (post-pilot)
- Activation: % of trials that generate 1 locked pack within 7 days
- Retention: pay-run throughput month-over-month
- Expansion: increasing payslip/client tiers

## 7. Key constraints / principles
- **Audit-first**: every sensitive action creates an audit event.
- **Immutability**: imports and check results are versioned; lock prevents mutation.
- **Explainability**: every failure includes the math and the evidence.
- **Configurable not programmable**: toggles + thresholds + expected variances.

## 8. Risks & mitigations
1. **Export variability** → template system + robust preview/validation + drift detection.
2. **Noisy exceptions** → materiality thresholds + rounding/tolerance rules + expected variances.
3. **Security/procurement** → minimum baseline (RBAC, encryption, redaction, audit log) + clear roadmap.
4. **Perceived “already solved in payroll system”** → position as cross-source verification + pack artifact.

## 9. Release criteria (MVP)
- All MVP items implemented with tests per `testing.md`.
- “Locked pack” is immutable; revisions are required to change results.
- No PII in logs.
- Parsing and reconciliation handle common sad paths (missing sources, wrong files, template drift).
 - Upload validation blocks invalid files (magic bytes + parseability).
 - Import + reconciliation statuses are accurate and clearly separated in UI.
 - Exceptions routes work with empty-state handling.
 - Pack download works via a secure server endpoint with user-friendly errors.

## 10. Open questions
- Which 2 payroll systems are the first-class template targets in v1 (e.g., BrightPay + Staffology)?
- Which bank/payment formats are most common for early adopters (BACS file vs summary)?
- What minimum statutory totals exports do bureaus reliably have available?

## 11. Production readiness additions (MVP hardening)
- Strict file validation and size/row limits.
- Deterministic import status pipeline and reconciliation statuses.
- Exceptions UI must be reachable and deterministic even with zero exceptions.
- Pack download must be access-controlled and reliable.
- CI must run lint, typecheck, and tests on every change.
