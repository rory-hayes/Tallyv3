# Pack Template Outline (MVP)

## Sections
1) Cover
- Firm branding
- Client name
- Period
- Prepared by / reviewed by
- Generated timestamp
- Pack version

2) Inputs
- For each source import included:
  - source type
  - original filename
  - upload timestamp
  - file hash
  - template version used

3) Reconciliation summary
- Table of checks executed:
  - check_id
  - status
  - left/right values
  - delta
  - tolerance

4) Exceptions
- Group by category
- For each exception:
  - summary
  - severity
  - status/outcome (resolved/dismissed/overridden)
  - notes
  - evidence pointers (import + row numbers)

5) Sign-off
- Preparer submission timestamp
- Reviewer approval timestamp (or rejection)
- Overrides acknowledgment statement if any

6) Audit metadata
- bundle_id + bundle_version
- check versions
- effective tolerances
- expected variances applied
