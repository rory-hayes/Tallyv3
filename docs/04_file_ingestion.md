# File Ingestion (MVP)

## Scope
MVP supports manual file uploads for four source types:
- Payroll Register
- Bank/Payments (BACS/SEPA file OR payment summary export)
- GL Journal
- Statutory Totals

No external APIs required in MVP.

## Supported formats
- CSV
- XLSX
- (Optional) PDF only as an attachment/evidence (not parsed in MVP)

## Import immutability
Each upload creates an **Import** record with:
- import_id
- pay_run_id
- source_type
- version (int; increments per source_type within pay_run)
- file_hash (SHA-256)
- storage_uri
- uploaded_by
- uploaded_at

**Replace file** creates a new version. No mutation of existing imports.

## Upload flow
1) UI requests signed upload URL (or posts to server)
2) Browser uploads to object storage
3) Client calls finalize endpoint with metadata
4) Worker parses file asynchronously
5) Parser output stored as NormalizedRecord sets (see mapping doc)

## Parsing requirements
- Detect delimiter for CSV (comma/semicolon/tab)
- Normalize encoding to UTF-8
- Handle headers: trim whitespace, case-insensitive matching
- Strip currency symbols for numeric fields where applicable
- Support negative amounts (journal credits)
- Track row numbers for evidence pointers

## Sad paths (must be handled)
- Wrong file type → reject with helpful message
- Password-protected XLSX → reject and suggest export to CSV
- Corrupt file → reject and allow re-upload
- Very large file → process async and show progress
- Missing required columns → surface in mapping wizard

## Evidence pointers
All normalized rows must retain:
- import_id
- original_row_number
- original_values (optionally stored in compressed form)

So exceptions can cite exact source row(s).

## Acceptance criteria
- Uploading the same file twice is idempotent (detect via hash) unless explicitly forced.
- Replace creates new import version and invalidates prior reconciliation run.
- No file contents are written to logs.
