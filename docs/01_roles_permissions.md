# Roles & Permissions (RBAC)

## Purpose
Define minimum roles, permissions, and enforcement points.

## Roles (MVP)
1. **Firm Admin**
   - Manages workspace settings, billing (later), users, roles, branding.
2. **Preparer**
   - Creates and works pay runs, uploads files, resolves exceptions, submits for review.
3. **Reviewer**
   - Reviews pay runs, approves/rejects, locks packs.

## Optional roles (Phase 2)
- **Client Approver (external)**: view pack + sign-off.
- **Auditor**: view-only access to locked packs and audit log.

## Permissions matrix (MVP)
| Action | Admin | Preparer | Reviewer |
|---|---:|---:|---:|
| Create/edit firm settings | ✅ | ❌ | ❌ |
| Invite users / change roles | ✅ | ❌ | ❌ |
| Create/edit clients | ✅ | ✅ | ✅ |
| Create pay runs | ✅ | ✅ | ✅ |
| Upload/import files | ✅ | ✅ | ✅ |
| Create/edit mapping templates | ✅ | ✅ | ✅ |
| Run reconciliation | ✅ | ✅ | ✅ |
| Resolve exceptions | ✅ | ✅ | ✅ |
| Submit for review | ✅ | ✅ | ✅ |
| Approve/reject | ✅ | ❌ | ✅ |
| Generate pack | ✅ | ✅ | ✅ |
| Lock pack | ✅ | ❌ | ✅ |
| View audit log | ✅ | ✅ | ✅ |

## Enforcement points
- All resource access is scoped by `firm_id`.
- Pay run state transitions must enforce role restrictions:
  - Only Reviewer/Admin can approve/reject.
  - Only Reviewer/Admin can lock packs.

## Audit requirements
The following actions must emit audit events:
- User invite, role change, user removal
- Client created/updated/deleted
- Pay run created, state transitions
- File imports created/deleted (note: deleting should be “tombstone” not hard delete)
- Mapping template created/updated/published
- Reconciliation executed (with check bundle version)
- Exception resolved/dismissed/overridden
- Approval/rejection
- Pack generation and lock

## Acceptance criteria
- Attempt to access another firm’s client/pay run/pack returns 404/denied.
- Attempt for Preparer to approve or lock pack is denied.
- UI hides actions user lacks permission for.
