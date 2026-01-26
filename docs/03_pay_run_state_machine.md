# Pay Run State Machine

## States
- **DRAFT**: created, no imports required
- **IMPORTED**: at least one import exists
- **MAPPED**: required imports have mapping templates applied (or mapping not required)
- **RECONCILING**: background job running
- **RECONCILED**: reconciliation_run exists
- **EXCEPTIONS_OPEN**: unresolved exceptions exist (computed)
- **READY_FOR_REVIEW**: preparer submits; gating checks passed or overridden
- **APPROVED**: reviewer approval recorded
- **PACKED**: pack generated
- **LOCKED**: pack locked (immutable)
- **ARCHIVED**: read-only, retention-managed

## Allowed transitions (MVP)
| From | To | Who | Conditions |
|---|---|---|---|
| DRAFT | IMPORTED | Preparer/Admin | first import created |
| IMPORTED | MAPPED | Preparer/Admin | mapping completed for required sources |
| MAPPED/IMPORTED | RECONCILING | Preparer/Admin | user triggers reconcile |
| RECONCILED | RECONCILING | Preparer/Admin | re-run reconciliation |
| RECONCILING | RECONCILED | Worker | job completes |
| RECONCILED | READY_FOR_REVIEW | Preparer/Admin | gating checks |
| READY_FOR_REVIEW | APPROVED | Reviewer/Admin | approve |
| READY_FOR_REVIEW | RECONCILED | Reviewer/Admin | reject with comment |
| APPROVED | PACKED | Preparer/Reviewer/Admin | pack generation completes |
| PACKED | LOCKED | Reviewer/Admin | lock action |
| LOCKED | ARCHIVED | Admin | retention / manual archive |

## Gating checks for READY_FOR_REVIEW
Firm/client config determines required sources. Default:
- Register is required.
- At least one of (Bank/Payments OR Payment Summary) required.
- GL Journal required.
- Statutory Totals optional in v1 (configurable).

Additional gates:
- No unresolved **CRITICAL** exceptions unless preparer adds override note.
- Mapping templates valid for each included import.
- Reviewer cannot approve their own submission unless firm settings allow self-approval.

## Revision policy (important)
- If a pay run is **LOCKED**, any change requires creating a **new revision**.
- Revisions copy client/period metadata but create a new pay_run_id and revision_number+1.
- Historical revisions remain accessible and immutable.

## Acceptance criteria
- Illegal transitions are rejected (server-side).
- State changes emit audit events.
- UI reflects state clearly and prevents editing after LOCKED.
