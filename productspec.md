# ProductSpec — Tally (Technical + Functional)

## 1. Architecture (MVP)
### 1.1 Deployment model
- **Modular monolith**: single web app (API + UI) and a background **worker** for CPU/IO heavy jobs.
- **PostgreSQL** for relational data.
- **Object storage (S3-compatible)** for uploaded exports and generated packs.
- **Queue (Redis + job runner)** for parsing, normalization, reconciliation, PDF generation.

### 1.2 Major modules
1. Auth + tenancy + RBAC
2. Clients + Pay Runs
3. File ingestion + versioning
4. Mapping templates + normalization pipeline
5. Reconciliation checks framework
6. Exceptions + resolution workflow
7. Review/approval workflow
8. Pack generation + locking
9. Audit log
10. Search/retrieval

### 1.3 Guiding constraints
- Tally **does not compute payroll**; it verifies consistency between exports.
- Every output (exceptions, packs) must be reproducible from versioned inputs.

## 2. Core data contracts
### 2.1 Source imports
Each uploaded file becomes a `SourceImport`:
- `id`
- `firm_id`, `client_id`, `pay_run_id`
- `source_type`: `REGISTER | BANK | GL | STATUTORY`
- `original_filename`
- `uploaded_by_user_id`
- `uploaded_at`
- `file_hash_sha256`
- `storage_uri`
- `parse_status`: `PENDING | PARSED | FAILED`
- `mapping_template_version_id` (nullable)
- `normalized_dataset_id` (nullable)

**Immutability:** a new file creates a new `SourceImport` row.

### 2.2 Normalized records (internal schema)
Use narrow, typed schemas per source type, e.g.:

**RegisterLine** (minimum fields)
- `employee_ref` (string)
- `employee_name` (string, optional)
- `gross_pay` (decimal, optional in v1)
- `net_pay` (decimal)
- `tax` (decimal, optional)
- `employee_deductions_total` (decimal, optional)
- `employer_costs_total` (decimal, optional)
- `period_start`, `period_end` (optional)

**BankLine**
- `payee_ref` (string, optional)
- `payee_name` (string)
- `amount` (decimal)
- `reference` (string, optional)

**GLLine**
- `account_code` (string)
- `description` (string, optional)
- `cost_centre` (string, optional)
- `debit` (decimal, nullable)
- `credit` (decimal, nullable)

**StatutoryTotal**
- `category` (enum/string)
- `amount` (decimal)

### 2.3 Reconciliation checks
A check is a typed computation:
- Inputs: one or more normalized datasets
- Config: thresholds, rounding, enabled state
- Output: `CheckResult`

**CheckResult**
- `id`, `pay_run_id`, `check_type`, `check_version`
- `status`: `PASS | WARN | FAIL`
- `severity`: `INFO | LOW | MEDIUM | HIGH | CRITICAL`
- `summary`: human-readable
- `details`: structured JSON (the math)
- `evidence`: array of pointers `{source_import_id, row_ids[]}`
- `created_at`

### 2.4 Exceptions
An exception is a `FAIL` (or selected `WARN`) surfaced for workflow:
- `id`, `pay_run_id`
- `category`: `BANK_MISMATCH | GL_MISMATCH | STATUTORY_MISMATCH | DATA_QUALITY | OTHER`
- `title`, `description`
- `materiality_amount`
- `status`: `OPEN | IN_REVIEW | RESOLVED | DISMISSED`
- `assigned_to_user_id` (nullable)
- `resolution_note` (nullable)
- `resolution_evidence_uris[]` (optional)
- `audit_trail_ref`

## 3. Pay run lifecycle
See `docs/03_pay_run_state_machine.md`. The system must enforce:
- Pack cannot be locked until approved.
- Locked pay run cannot be mutated; revisions are required.

## 4. Background jobs
- `parse_import(import_id)`
- `normalize_import(import_id, template_version_id)`
- `run_reconciliation(pay_run_id)`
- `generate_pack(pay_run_id)`
- `index_search(pay_run_id)`

All jobs must be **idempotent**.

## 5. APIs (internal)
MVP can use server actions / internal APIs; define stable boundaries anyway.

Minimum endpoints / actions:
- Firms/users/invites/roles
- Clients CRUD
- Pay runs CRUD + state transitions
- Upload import (signed upload + finalize)
- Template CRUD + apply
- Run reconciliation
- Exceptions CRUD (status changes, assignment)
- Approve/reject
- Generate/download pack

## 6. Non-functional requirements
See `docs/18_nfrs_observability.md` and `docs/14_security_privacy_redaction.md`.
