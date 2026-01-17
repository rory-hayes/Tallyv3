# Templates Library

## Purpose
Make mapping templates discoverable and manageable outside the mapping wizard, with firm/client scope visibility and version history.

## MVP requirements
- Templates list view with filters:
  - Client scope (client-specific or firm-wide)
  - Source type
  - Status (DRAFT | ACTIVE | DEPRECATED)
- Show latest version per (client, source type, name) with:
  - Version number
  - Status
  - Updated/created timestamp
  - Drift flag (if known)
  - Last-used timestamp (if available)
- Template detail view:
  - Mapping summary + required field coverage
  - Source columns list
  - Version history with created-by and status
- Actions:
  - Set version ACTIVE (deprecates prior active for same client/name/source).
  - Set version DEPRECATED.

## Data + queries (MVP)
- Latest templates per grouping (clientId, sourceType, name).
- Version history from MappingTemplate rows.
- Usage derived from imports referencing a template version.

## RBAC
- Admin/Preparer can manage templates.
- Reviewer can view templates, but cannot publish/deprecate.

## UI
- Library list with filters and search by template name.
- Detail page with tabs: Summary, Versions, Usage.

## Acceptance criteria
- Firm scoping enforced on all template operations.
- Versioning is immutable; status changes do not modify historical versions.
- Drift detection shown when a template is applied to mismatched columns.
