# Roadmap — Tally (Solo Founder Execution Plan)

## Guiding principles
- Ship a **file-first** MVP that closes payroll with proof.
- Build a **clean core**: versioned imports, explainable checks, immutable packs.
- Add automation via **file ingestion** (SharePoint/Drive/email) before complex payroll APIs.

## Milestones
- **M0**: Repo + infrastructure baseline
- **M1**: Core domain model + UI shell
- **M2**: File ingestion + mapping templates
- **M3**: Reconciliation + exceptions
- **M4**: Approvals + pack generation + locking
- **M5**: Search, audit hardening, and pilot readiness

---

## Sprint plan (2-week sprints)

### Sprint 0 — Foundations (week 1)
**Outcome:** productive dev loop with guardrails.
- Choose stack, set up monorepo structure
- CI: lint, typecheck, tests
- DB migrations
- Basic auth + org model scaffold
- Object storage integration (dev)

**Exit criteria:** you can create a firm + user + run the app end-to-end locally.

### Sprint 1 — Workspace + RBAC + Audit skeleton
**Epics:** E1, E2
- Firm/workspace creation
- Invites + roles (Admin/Preparer/Reviewer)
- Audit log skeleton and UI view

**Exit criteria:** role permissions enforced; audit events visible.

### Sprint 2 — Clients + Pay Runs + State Machine
**Epics:** E3, E4
- Client CRUD, client settings
- Pay run creation, uniqueness + revision model
- State transitions + guardrails

**Exit criteria:** pay run lifecycle works with correct permission checks.

### Sprint 3 — File ingestion (uploads) + Import versioning
**Epics:** E5
- Upload for each source type
- Import metadata, hashing, replace-as-new-version
- Basic import list UI + delete/void import

**Exit criteria:** all 4 source types can be uploaded and versioned.

### Sprint 4 — Mapping templates + Normalization pipeline
**Epics:** E6
- Mapping wizard + preview
- Save templates (client or firm scoped)
- Normalized tables + validation errors

**Exit criteria:** uploads produce normalized records or explicit errors.

### Sprint 5 — Reconciliation checks (totals-first) + Exceptions model
**Epics:** E7, E8
- Implement check framework + default UK/IE bundles
- Generate structured exceptions w/ evidence pointers
- Exceptions list + detail UI

**Exit criteria:** reconciliation produces understandable results on sample datasets.

### Sprint 6 — Exception workflow + Review/Approval
**Epics:** E9
- Resolve/dismiss with reasons
- Assignment + comments
- Submit for review, approve/reject

**Exit criteria:** reviewer gate works; audit records approvals.

### Sprint 7 — Pack generation + Locking
**Epics:** E10
- Pack template v1 (PDF)
- Pack metadata + download
- Lock pay run / lock pack; enforce revision requirement

**Exit criteria:** you can export a locked reconciliation pack with correct sign-offs.

### Sprint 8 — Search + Retrieval + Hardening
**Epics:** E11, E12
- Search by client/period
- Pack retrieval view
- Redaction settings, logging hygiene
- Observability + performance pass

**Exit criteria:** pilot-ready MVP.

### Sprint 9 — Dashboard + Templates Library
**Epics:** E13, E14
- Dashboard operational overview (counts, alerts, next steps)
- Templates library list + detail/history views
- Template status management (draft/active/deprecated)

**Exit criteria:** dashboard supports daily workflow and template management is discoverable outside the mapping wizard.

---

## Epics (mapped to doc specs)
- **E1** Workspace & orgs → `docs/01_roles_permissions.md`
- **E2** Audit logging → `docs/12_audit_log.md`
- **E3** Clients → `docs/02_data_model.md`
- **E4** Pay runs & state machine → `docs/03_pay_run_state_machine.md`
- **E5** File ingestion → `docs/04_file_ingestion.md`
- **E6** Mapping & normalization → `docs/05_mapping_templates.md`
- **E7** Reconciliation checks → `docs/06_reconciliation_checks.md`
- **E8** Matching strategies → `docs/09_matching_strategies.md`
- **E9** Exceptions workflow → `docs/10_exception_workflow.md`
- **E10** Pack generation & locking → `docs/11_pack_generation_and_locking.md`
- **E11** Search & retrieval → `docs/13_search_and_retrieval.md`
- **E12** Security/NFRs → `docs/14_security_privacy_redaction.md`, `docs/18_nfrs_observability.md`
- **E13** Dashboard overview → `docs/22_dashboard.md`
- **E14** Templates library → `docs/23_templates_library.md`

## Post-MVP (Phase 2)
- Automated ingestion via SharePoint/OneDrive/Google Drive/email → `docs/15_ingestion_automation.md`
- Accounting APIs (Xero/QBO) → `docs/16_integrations_future.md`
- Portfolio analytics & variance intelligence
