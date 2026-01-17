# Security, Privacy, and Redaction

## Security baseline (MVP)
- Tenant isolation by firm_id on every query
- RBAC enforced server-side
- Encrypt data at rest (DB + object storage) via cloud provider features
- Encrypt in transit (TLS)
- File access via signed URLs with short expiry
- No PII in logs
- Audit log for sensitive actions

## PII handling
Payroll exports may contain names, NI numbers, bank details, addresses.
MVP posture:
- Store originals in secure object storage
- Store normalized extracts with only required fields by default
- Allow optional persistence of “original values” for evidence; if stored, ensure encryption and row-level access constraints

## Redaction settings
Firm-level settings that impact pack generation and UI display:
- Mask employee names (e.g., J*** S***)
- Mask bank account details (show last 4 digits)
- Mask NI numbers (show last 2 characters)

Default: do not mask in internal UI; allow masking in pack output. Provide firm control.

## Access controls
- Preparer can see client data they are assigned to (optional; if not implementing assignment, firm-wide access is ok but must be explicit)
- Reviewer can see all
- Admin can see all

## Data retention
- Allow firm-configurable retention for imports and packs (Phase 1.5)
- MVP: keep data indefinitely but include delete capability for testing environments

## Compliance notes
This is not legal advice.
- Ensure GDPR fundamentals: data minimization, purpose limitation, access control, deletion workflows.

## Acceptance criteria
- Signed URL cannot access another firm’s file.
- Pack redaction matches firm settings.
- No PII appears in application logs or error reports.
