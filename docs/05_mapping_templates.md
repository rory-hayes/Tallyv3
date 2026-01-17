# Mapping Templates & Normalization

## Purpose
Exports are inconsistent. Mapping templates normalize them into a stable internal schema for checks.

## Concepts
- **Template**: a mapping from input columns to internal fields for a specific source type.
- **Scope**: templates may be **client-scoped** (default) and optionally promoted to **firm-scoped**.
- **Versioned**: template changes create a new version; existing runs keep their template versions.

## Mapping wizard (MVP)
### Flow
1. User uploads file
2. System attempts to auto-match via known templates
3. If not matched, prompt user with mapping UI
4. User maps required fields and optional fields
5. Validate, preview normalized data
6. Save template (client-scoped)

### Required fields per source type (MVP)
**Payroll Register**
- Employee identifier (id OR name)
- Net pay amount
- Gross pay amount (optional for v1 if unavailable, but recommended)
- Tax amount (region-specific)
- Employer contributions (optional)

**Bank/Payments**
- Payee identifier or name
- Amount
- Payment reference (optional but helpful)

**GL Journal**
- Account code/name
- Amount
- Debit/Credit indicator OR signed amount
- Cost centre/department (optional)

**Statutory Totals**
- Category
- Amount

## Normalized schemas (MVP)
Use these canonical tables/records.

### NormalizedRegisterRow
- import_id
- row_number
- employee_key (string)
- gross (decimal, nullable)
- net (decimal)
- tax1 (decimal, nullable)  # UK: PAYE; IE: PAYE
- tax2 (decimal, nullable)  # UK: NI; IE: USC
- tax3 (decimal, nullable)  # UK: other; IE: PRSI
- pension_employee (decimal, nullable)
- pension_employer (decimal, nullable)
- other_deductions (decimal, nullable)

### NormalizedPaymentRow
- import_id
- row_number
- payee_key (string)
- amount (decimal)
- reference (string, nullable)

### NormalizedJournalRow
- import_id
- row_number
- account (string)
- cost_centre (string, nullable)
- amount (decimal)  # signed: debit positive, credit negative

### NormalizedStatutoryRow
- import_id
- row_number
- category (string)
- amount (decimal)

## Template drift detection (v1+)
When a new file is uploaded:
- If column set differs from template’s expected columns, flag as drift.
- Offer “Update template” with diff view.

## Acceptance criteria
- Template versions are immutable snapshots.
- Reconciliation stores the template version IDs used.
- Validation blocks saving templates missing required fields.
- Preview shows at least first N normalized rows and summary totals.
