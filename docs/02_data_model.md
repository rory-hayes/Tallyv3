# Data Model

## Purpose
Define the core entities and relationships. This should remain stable; migrations must be additive where possible.

## Core entities (MVP)
### Firm
- id
- name
- region (UK | IE)
- timezone
- branding settings
- defaults (JSON: requiredSources, tolerances, approvalSettings, redaction)
- created_at

### User
- id
- firm_id
- email
- role (ADMIN | PREPARER | REVIEWER)
- status (INVITED | ACTIVE | DISABLED)
- created_at

### Client
- id
- firm_id
- name
- external_id (optional)
- region_override (optional)
- payroll_system (ENUM + Other)
- payroll_frequency (weekly | fortnightly | monthly | other)
- required_sources configuration
- settings (JSON: tolerance overrides, future per-client defaults)
- created_at

### PayRun
- id
- firm_id
- client_id
- period_start
- period_end
- period_label
- revision (int, starts at 1)
- status (see state machine doc)
- assigned_preparer_user_id (optional)
- assigned_reviewer_user_id (optional)
- settings (JSON: pay-run overrides such as tolerances)
- created_at

### Import
Represents an immutable uploaded file and its parsing output.
- id
- pay_run_id
- source_type (REGISTER | BANK | GL | STATUTORY | PENSION_SCHEDULE)
- version (int, increments per source_type within pay run)
- storage_uri
- file_hash (sha256)
- filename
- mime_type
- size_bytes
- uploaded_by_user_id
- uploaded_at
- parse_status (UPLOADED | PARSING | PARSED | MAPPING_REQUIRED | MAPPED | READY | ERROR_FILE_INVALID | ERROR_PARSE_FAILED)
- error_code (optional; ERROR_FILE_INVALID | ERROR_PARSE_FAILED)
- error_message (optional)
- template_id used (optional)
- parse_summary JSON (row counts, header info, warnings)

### MappingTemplate
Versioned template for a source type.
- id
- firm_id
- client_id (nullable; null = firm-wide)
- source_type
- version
- name
- column_map JSON
- normalization_rules JSON
- created_by
- created_at
- status (DRAFT | ACTIVE | DEPRECATED)

### AccountClassification
Maps client GL account codes to reconciliation classes.
- id
- firm_id
- client_id
- account_code
- account_name (optional)
- classification (EXPENSE | NET_PAYABLE | TAX_PAYABLE | NI_PRSI_PAYABLE | PENSION_PAYABLE | CASH | OTHER)
- created_at

### NormalizedRecord
Stores normalized rows (optional storage strategy).
MVP recommendation:
- Store in object storage as parquet/jsonl keyed by import_id.
- Store only metadata in DB.

### ReconciliationRun
- id
- pay_run_id
- run_number (int)
- created_at
- executed_by
- inputs: import_ids used (REGISTER/BANK/GL/STATUTORY)
- check_bundle_version
- status (SUCCESS | FAILED)
- summary JSON

### CheckResult
- id
- reconciliation_run_id
- check_type (e.g., REGISTER_BANK_NET_TOTAL)
- status (PASS | WARN | FAIL)
- severity (INFO|LOW|MEDIUM|HIGH|CRITICAL)
- message
- calc JSON (numbers, formula)
- evidence JSON (pointers)

### Exception
Exceptions are derived from FAIL/WARN check results plus evidence.
- id
- pay_run_id
- reconciliation_run_id
- check_result_id
- category (BANK_MISMATCH | BANK_DATA_QUALITY | JOURNAL_MISMATCH | STATUTORY_MISMATCH | SANITY)
- severity
- status (OPEN | RESOLVED | DISMISSED | OVERRIDDEN)
- assigned_to_user_id (optional)
- resolution_note (optional)
- resolution_attachment_uri (optional)
- resolved_by_user_id (optional)
- resolved_at (optional)

### Approval
- id
- pay_run_id
- reviewer_user_id
- status (APPROVED | REJECTED)
- comment
- created_at

### Pack
- id
- pay_run_id
- reconciliation_run_id
- generated_at
- generated_by
- pack_version (int)
- storage_uri_pdf
- storage_key_pdf
- content_type
- size_bytes
- file_hash_sha256
- storage_uri_bundle (optional)
- locked_at (optional)
- locked_by (optional)
- metadata JSON (template versions, check bundle version, import hashes)

### AuditEvent
See audit log doc.

### ExpectedVariance
Structured overrides for known recurring differences.
- id
- firm_id
- client_id
- applies_to_check_id (optional)
- variance_type (DIRECTORS_SEPARATE | PENSION_SEPARATE | ROUNDING | OTHER)
- condition (JSON: amount/pct bounds, payee/reference patterns)
- effect (JSON: downgrade_to, requires_note, requires_attachment, requires_reviewer_ack)
- active (boolean)
- created_by
- created_at

## Acceptance criteria
- All entities include firm_id or are reachable from firm-scoped parent.
- Pay run revisions are immutable snapshots (new revision instead of mutation after lock).
- Imports are immutable; “replace” creates a new Import version.
