# Pack Generation & Locking

## Purpose
The reconciliation pack is the core proof-of-work artifact. It must be exportable, consistent, and immutable after lock.

## Pack contents (MVP)
1. Cover page
   - Client name
   - Pay period
   - Preparer + Reviewer names
   - Timestamps (prepared, approved, generated, locked)
   - Pack version
2. Inputs summary
   - List of imports included (file name, upload time, hash, template version)
3. Reconciliation summary
   - Key totals comparisons with PASS/WARN/FAIL and deltas
4. Exceptions section
   - Table of all exceptions with status and notes
   - Detailed pages per CRITICAL/HIGH exception including evidence pointers
5. Audit metadata appendix
   - Check bundle ID/version, check versions
   - Template versions
   - Effective config summary (tolerances, enabled checks)

## Output formats
- PDF (required)
- Evidence bundle ZIP (optional v1)

## Generation process
- Pack is generated from a specific `reconciliation_run_id`.
- Pack generation is a background job.
- Pack stores metadata needed to reproduce the pack contents later.

## Locking
- Only Reviewer/Admin can lock.
- Lock sets `locked_at`, `locked_by`.
- After lock:
  - No imports can be added/removed
  - No templates can be applied
  - No exceptions can be modified
  - No re-run reconciliation
  - Only retrieval/sharing allowed

## Revisions
- If any change is required after lock, create a new pay run revision.
- Packs remain available for older revisions.

## Redaction
- Pack must respect firm redaction settings (see security doc).

## Acceptance criteria
- Locked pack is immutable (server enforcement).
- Pack always includes file hashes and template/check versions.
- Pack generation is deterministic for a given reconciliation run.
