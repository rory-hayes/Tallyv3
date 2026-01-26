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

4. **CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE**
   - Compare: sum(register.gross_pay) vs classified journal expense total.
   - Status defaults to WARN until account classification is configured.

5. **CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE**
   - Compare: employer costs (NI/PRSI + employer pension if mapped) vs journal employer costs.
   - Status defaults to WARN until account classification is configured.

6. **CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY**
   - Compare: sum(register.net_pay) vs journal net wages payable accounts.

7. **CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY**
   - Compare: sum(register.tax*) vs journal tax + NI/PRSI liability accounts.

8. **CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY**
   - Compare: sum(register.pension_employee + pension_employer) vs journal pension liabilities.

9. **CHK_JOURNAL_DEBITS_EQUAL_CREDITS**
   - FAIL if sum(positive amounts) + sum(negative amounts) != 0 within tolerance.

10. **CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS**
   - Compare: register totals by category (tax/NI/pension etc.) vs statutory categories.
   - MVP: treat statutory file as free-form category amounts; mapping template maps categories.
   - Default to WARN if statutory file missing.

11. **CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE**
   - Compare: register pension totals vs pension schedule totals.
   - Default to WARN if pension schedule is missing.

### C. Bank data quality checks (sanity)
12. **CHK_BANK_DUPLICATE_PAYMENTS**
   - Detect duplicate payments (payee + amount + reference) beyond threshold.
13. **CHK_BANK_NEGATIVE_PAYMENTS**
   - FAIL if any zero or negative payment exists.
14. **CHK_BANK_PAYMENT_COUNT_MISMATCH**
   - WARN if bank payment count differs from register count beyond tolerance.

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
