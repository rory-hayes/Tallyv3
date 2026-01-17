# Matching Strategies

## Purpose
Define how Tally matches items across sources, and what is in scope for MVP.

## MVP stance
- Totals reconciliation is MVP-critical.
- Line-level matching is optional and must not create noisy false positives.

## Matching types
### 1) Totals matching (MVP)
- Compare aggregated sums by category.
- Must be stable regardless of row ordering.
- Must support tolerances and rounding.

### 2) Grouped totals (MVP+)
Match totals by group key, if available:
- cost_centre / department
- pay group
- payroll category (e.g., pension)

### 3) Line-level matching (Phase 1.5)
Primary use: employee net pay ↔ bank line item.

#### Keys and heuristics
- Primary key: employee_id mapped to bank payee/reference
- Fallback: amount match within tolerance + string similarity on name/reference

#### Output
- Unmatched employees
- Unmatched bank lines
- One-to-many cases (splits) must be handled carefully: default to WARN and require user review.

## Tolerances
Define per check:
- absolute tolerance (e.g., £1.00)
- percent tolerance (e.g., 0.05%)
- rounding: currency decimals (2)

## Determinism requirements
- If multiple candidate matches exist, algorithm must pick deterministically (stable sort rules) and include explanation.

## Acceptance criteria
- Totals matching always works with only required fields.
- Line-level matching can be disabled per client.
- Matching produces evidence pointers for each linked item.
