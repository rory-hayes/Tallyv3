# Decision Log

Use this file to record decisions that change scope, architecture, or product behavior.

## Template
- **Date:** YYYY-MM-DD
- **Decision:**
- **Context:**
- **Alternatives considered:**
- **Consequences / follow-ups:**

---

## Decisions

- **Date:** 2026-01-16
  **Decision:** Add Sprint 9 for dashboard operational overview and templates library management.
  **Context:** The dashboard is currently sparse and templates are only accessible from the mapping wizard; stakeholders requested a dedicated dashboard and library surface.
  **Alternatives considered:** Defer both to post-MVP Phase 2.
  **Consequences / follow-ups:** Implement E13/E14 per new docs and backlog stories.

- **Date:** 2026-01-16
  **Decision:** Implement structured JSON logging + retry helper now; defer external error tracking (Sentry) until DSN/provider is available.
  **Context:** Sprint 8 requires observability and job retries; we can add safe, structured logs and retries without external dependencies, but Sentry configuration is not yet available.
  **Alternatives considered:** Add Sentry dependency immediately; skip observability work entirely.
  **Consequences / follow-ups:** Add Sentry (or equivalent) integration once credentials and vendor choice are confirmed.

- **Date:** 2026-01-13
  **Decision:** Seeded `PayrollSystem` enum with `BRIGHTPAY`, `STAFFOLOGY`, and `OTHER`.
  **Context:** Sprint 2 requires an enum-backed payroll system with an OTHER free-text field, but the canonical list is still an open question.
  **Alternatives considered:** Use only `OTHER`; defer enum entirely.
  **Consequences / follow-ups:** Revisit enum values once product confirms target payroll systems.

- **Date:** 2026-01-14
  **Decision:** Allow RECONCILED → RECONCILING transitions to support re-running reconciliation.
  **Context:** Sprint 5 requires re-runs to supersede previous reconciliation runs and exceptions.
  **Alternatives considered:** Force a state reset to IMPORTED/MAPPED or require a new pay run revision.
  **Consequences / follow-ups:** Reconciliation can be re-run on the same revision; prior runs are superseded.
