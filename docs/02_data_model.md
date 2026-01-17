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
- default thresholds
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
- created_at

### Import
Represents an immutable uploaded file and its parsing output.
- id
- pay_run_id
- source_type (REGISTER | BANK | GL | STATUTORY)
- version (int, increments per source_type within pay run)
- storage_uri
- file_hash (sha256)
- filename
- mime_type
- size_bytes
- uploaded_by_user_id
- uploaded_at
- parse_status (PENDING | PARSED | FAILED)
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
- category
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
- storage_uri_bundle (optional)
- locked_at (optional)
- locked_by (optional)
- metadata JSON (template versions, check bundle version, import hashes)

### AuditEvent
See audit log doc.

## Acceptance criteria
- All entities include firm_id or are reachable from firm-scoped parent.
- Pay run revisions are immutable snapshots (new revision instead of mutation after lock).
- Imports are immutable; “replace” creates a new Import version.
