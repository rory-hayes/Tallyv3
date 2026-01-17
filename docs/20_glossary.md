# Glossary

- **Firm**: The payroll bureau/accounting firm using Tally.
- **Client**: An end-customer of the firm (employer entity).
- **Pay Run**: A payroll period instance for a client (e.g., Jan 2026 monthly). Can have revisions.
- **Import**: An uploaded source file (register, bank/payments, journal, statutory). Immutable and versioned.
- **Mapping Template**: A versioned mapping from input columns to normalized fields.
- **Normalization**: Conversion of parsed input into internal schemas (normalized rows).
- **Reconciliation Run**: The execution instance of checks for a pay run, with stored results and versions.
- **Check**: A deterministic validation comparing sources (totals, sanity, reasonableness).
- **Exception**: A user-actionable item produced by failed checks.
- **Pack**: The PDF reconciliation artifact with evidence metadata and sign-offs.
- **Lock**: A state that makes a pack/pay run immutable. Changes require a new revision.
