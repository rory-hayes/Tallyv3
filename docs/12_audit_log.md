# Audit Log

## Purpose
Provide an immutable event trail for all security-sensitive and compliance-relevant actions.

## Event model
Fields:
- id
- firm_id
- actor_user_id (nullable for system events)
- action (string enum)
- entity_type (CLIENT | PAY_RUN | IMPORT | TEMPLATE | EXCEPTION | PACK | USER | FIRM)
- entity_id
- timestamp
- metadata JSON (non-PII, redact where needed)
- ip/user_agent (optional; store carefully)

## Required events (MVP)
### Auth & users
- USER_INVITED
- USER_ROLE_CHANGED
- USER_DISABLED

### Clients & pay runs
- CLIENT_CREATED
- CLIENT_UPDATED
- PAY_RUN_CREATED
- PAY_RUN_STATE_CHANGED
- PAY_RUN_REVISION_CREATED

### Imports
- IMPORT_UPLOADED
- IMPORT_REPLACED
- IMPORT_DELETED (tombstone)

### Templates
- TEMPLATE_CREATED
- TEMPLATE_VERSION_CREATED
- TEMPLATE_PUBLISHED
- TEMPLATE_DEPRECATED

### Reconciliation
- RECONCILIATION_STARTED
- RECONCILIATION_COMPLETED

### Exceptions
- EXCEPTION_CREATED (system)
- EXCEPTION_ASSIGNED
- EXCEPTION_RESOLVED
- EXCEPTION_DISMISSED
- EXCEPTION_OVERRIDDEN

### Approvals
- PAY_RUN_SUBMITTED_FOR_REVIEW
- PAY_RUN_APPROVED
- PAY_RUN_REJECTED

### Packs
- PACK_GENERATED
- PACK_LOCKED

## UI requirements
- Pay run timeline view shows major events.
- Admin can export audit log (CSV) filtered by client/date.

## Data retention
- Default retention: align with firm policy (e.g., 7 years). Provide configurable retention later.

## Acceptance criteria
- Every required event is emitted.
- Events cannot be edited or deleted by users.
- Metadata contains no PII unless explicitly allowed and redacted.
