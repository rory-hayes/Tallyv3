# Region Bundles (UK vs Ireland)

## Purpose
Provide sensible defaults for checks, tolerances, and statutory categories by region.

## Bundle definition
A bundle is a versioned set of:
- enabled_checks
- default tolerances
- default required sources
- default statutory category expectations

Bundles are templates. Firms can override them without changing the stored bundle version used for a specific reconciliation run.

## UK bundle (BUNDLE_UK_V1)
### Enabled checks (default)
- CHK_IMPORT_ROWCOUNT_NONZERO
- CHK_REGISTER_NET_TO_BANK_TOTAL
- CHK_JOURNAL_DEBITS_EQUAL_CREDITS
- CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE (WARN until configured)
- CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE (WARN until configured)
- CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY (WARN until configured)
- CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY (WARN until configured)
- CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY (WARN until configured)
- CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE (WARN if schedule missing)
- CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS (WARN if statutory missing)
- CHK_BANK_DUPLICATE_PAYMENTS
- CHK_BANK_NEGATIVE_PAYMENTS
- CHK_BANK_PAYMENT_COUNT_MISMATCH
- CHK_PERIOD_TOTAL_VARIANCE (WARN)

### Default tolerances
- Register vs Bank net total: max(£1.00, 0.05%)
- Journal debit/credit balance: max(£0.50, 0.01%)
- Variance warning: 15% or firm-configured

### Required sources for review gating (default)
- Register: required
- Bank/Payments: required (or a declared substitute payment summary)
- GL Journal: required
- Statutory totals: optional in v1

### Statutory category suggestions (mapping)
UK payroll exports commonly include categories like:
- PAYE income tax
- National Insurance (employee/employer)
- Student loan / postgrad loan
- Pension contributions (employee/employer)

Tally treats these as labels and does not compute statutory obligations.

## Ireland bundle (BUNDLE_IE_V1)
### Enabled checks (default)
Same structure as UK bundle.

### Default tolerances
- Register vs Bank net total: max(€1.00, 0.05%)
- Journal balance: max(€0.50, 0.01%)

### Statutory category suggestions
Ireland payroll exports commonly include categories like:
- PAYE
- USC
- PRSI
- Pension

## Acceptance criteria
- Every firm has a region and is assigned a bundle by default.
- Bundles are versioned and stored in reconciliation metadata.
- Firms can override defaults, but reconciliation stores effective config separately from bundle version.
