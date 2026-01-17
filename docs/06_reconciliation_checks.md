# Reconciliation Checks (Controls Framework)

## Purpose
Define the checks Tally runs to reconcile sources and generate exceptions.

## Design stance
- Do **not** build a general-purpose rules engine in MVP.
- Implement a **typed check framework** where each check is:
  - deterministic
  - explainable (math + evidence pointers)
  - configurable via thresholds/toggles
  - versioned

## CheckResult contract
Every check produces a `CheckResult`:
- check_id (string)
- check_version (string)
- scope (firm_id, client_id, pay_run_id)
- status: PASS | WARN | FAIL
- severity: INFO | LOW | MEDIUM | HIGH | CRITICAL
- summary (one sentence)
- details:
  - left_label, right_label
  - left_value, right_value
  - delta_value, delta_pct (if applicable)
  - formula (string)
  - tolerance_applied (object)
- evidence_pointers: list of { import_id, row_numbers[], note }
- remediation_hint (string)

Checks must be pure functions of:
- normalized records
- config (thresholds, toggles)
- expected variances (see doc 08)

## Configuration model
Config is hierarchical:
- Firm defaults
- Client overrides
- Pay-run overrides (rare; require reviewer sign-off)

Config includes:
- enabled_checks (set)
- tolerances (by check_id)
- rounding rules (currency, decimal places)
- required_sources for review gating

## MVP check catalog (UK/IE)

### A. Import sanity checks
1. **CHK_IMPORT_ROWCOUNT_NONZERO**
   - FAIL if any required import has 0 parsed rows.
2. **CHK_IMPORT_DUPLICATE_ROWS**
   - WARN if suspected duplicates (same employee_id + amount) exceed threshold.

### B. Totals reconciliation (core)
These are MVP-critical.

3. **CHK_REGISTER_NET_TO_BANK_TOTAL**
   - Compare: sum(register.net_pay) vs sum(bank.amount)
   - Tolerance: absolute (currency) + percent band
   - Evidence:
     - register: top contributing rows
     - bank: top contributing rows

4. **CHK_REGISTER_GROSS_TO_JOURNAL_TOTAL**
   - Compare: sum(register.gross_pay) vs derived journal payroll cost total
   - Implementation note: journal extraction is vendor-specific; MVP supports:
     - total debits in payroll expense accounts (configurable account prefixes)
     - OR compare to overall journal net movement if only one journal exists
   - Status defaults to WARN until account mapping is configured.

5. **CHK_JOURNAL_DEBITS_EQUAL_CREDITS**
   - FAIL if sum(positive amounts) + sum(negative amounts) != 0 within tolerance.

6. **CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS**
   - Compare: register totals by category (tax/NI/pension etc.) vs statutory categories.
   - MVP: treat statutory file as free-form category amounts; mapping template maps categories.
   - Default to WARN if statutory file missing.

### C. Line-level matching (Phase 1.5 / optional in MVP)
Ship only if it is robust for early adopters.

7. **CHK_EMPLOYEE_NET_TO_BANK_LINES**
   - Attempt to match each employee net_pay to one bank line:
     - primary key: employee_id → payee reference mapping
     - fallback: amount match within tolerance and reference contains surname/ID
   - Output: unmatched employees, unmatched bank lines.
   - Default severity: MEDIUM (not CRITICAL) unless client requires it.

### D. Reasonableness checks (WARN-only)
These help reviewers, but should not block close.

8. **CHK_PERIOD_TOTAL_VARIANCE**
   - Compare net/gross totals vs last N pay runs; warn if variance exceeds band.
9. **CHK_NEW_PAY_ELEMENT_DETECTED**
   - Warn if new deduction/category appears.

## Check bundle versions
Define region bundles (see doc 07). Each bundle is versioned:
- BUNDLE_UK_V1
- BUNDLE_IE_V1

ReconciliationRun stores:
- bundle_id
- bundle_version
- list of check_id + check_version executed

## Expected variances interaction
Before emitting FAIL, checks must consult `ExpectedVariance` records:
- If variance is expected and within declared bounds, downgrade FAIL→PASS/WARN and annotate.

## Exception creation rules
- A check with status FAIL creates one or more Exceptions.
- Exceptions must be:
  - deduplicated (same root cause should not create 10 items)
  - grouped by category

Exception must include:
- exception_category (BANK_MISMATCH, JOURNAL_MISMATCH, STATUTORY_MISMATCH, SANITY)
- severity
- affected_totals
- evidence pointers

## Acceptance criteria
- Running reconciliation twice with the same inputs produces identical results.
- Every FAIL includes a numeric delta and evidence pointers.
- Bundle and check versions are persisted in pack metadata.
