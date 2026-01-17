# Integrations (Future)

## Goals
- Reduce manual export steps for bureaus.
- Improve trust by reconciling against “posted” journals or payment confirmations.

## Priority order
1) File ingestion automation (SharePoint/Drive/email)
2) Accounting APIs (Xero, QuickBooks Online)
3) Payroll APIs (only where public/partner access is reliable)
4) Statutory APIs (only if necessary; high compliance cost)

## Accounting integrations (recommended first)
### Xero
- Pull journal entries (posted) and compare to payroll journal export.
- Optionally attach pack as an artifact to the journal/posting.
- Consider OAuth2, per-firm connection.

### QuickBooks Online
- Similar to Xero: pull journal entries and compare, attach pack.

## Payroll integrations (selective)
- Staffology Payroll is API-first; consider integration for pulling pay-run register and payment files.
- BrightPay has an API but may require partner access; treat as a roadmap item, not a dependency.

## Statutory integrations (defer)
- UK HMRC RTI and Ireland Revenue PAYE Modernisation have integration paths but add complexity.
- Prefer ingesting statutory totals exports and submission receipt summaries.

## Acceptance criteria for any integration
- Optional: product functions without it.
- Connector failures are visible and recoverable.
- Tokens stored securely.
- All connector actions audited.
