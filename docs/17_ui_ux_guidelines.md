# UI/UX Guidelines (Tailwind + Catalyst)

## Goals
- Fast, clear workflows for high-volume bureau operations.
- Data-dense views without overwhelming users.
- Every failure should show “what, why, and what to do next”.

## Design system
- Use Tailwind CSS.
- Use Tailwind **Catalyst** UI kit for app shell, forms, modals, navigation.
- For data tables, use a robust table foundation (e.g., TanStack Table) and standardize patterns.

## Core navigation
- Dashboard
- Clients
- Pay Runs
- Exceptions
- Packs
- Templates
- Settings

## Screen patterns
### 1) Pay Run Workspace (primary screen)
Layout:
- Header: client name, period, state badge, actions
- Source tiles: Register / Bank / Journal / Statutory (each with status)
- Reconciliation summary cards (pass/warn/fail)
- Exceptions table with filters
- Right panel: exception detail + evidence rows

### 2) Exception detail
- One sentence summary
- Show formula + numbers
- Show evidence pointers as a small table with row numbers and key fields
- Primary actions: Resolve, Dismiss, Override (if reviewer)

### 3) Mapping wizard
- Step 1: select header row / sheet
- Step 2: map columns to required fields
- Step 3: preview normalized rows + totals
- Step 4: save template (client-scoped)

## UX rules
- Never block with an error without offering next steps.
- Warn vs fail: reasonableness checks should not block close.
- Always show import/version used for current results.
- Locked state must be visually obvious and enforce read-only UI.

## Accessibility
- Keyboard navigation for tables and modals
- Color is not the only indicator (use icons/text)

## Acceptance criteria
- Happy path to generate a pack in <10 clicks after imports are available.
- Every FAIL has a clear remediation hint.
- No severe layout issues on common laptop resolutions.
