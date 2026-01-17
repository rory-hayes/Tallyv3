# Ingestion Automation (Phase 2)

## Goal
Deliver “automation on day 1” for bureaus without requiring deep payroll vendor APIs.

## Principles
- Automate how exports arrive in Tally.
- Keep the underlying reconciliation logic file-first.

## Options (implement in this order)

### 1) Watched Folder: OneDrive/SharePoint (Microsoft 365)
- Connect a folder per client or per firm.
- When a new file appears, ingest it into the correct client/pay run based on:
  - folder structure
  - file naming conventions (configurable)
  - in-file heuristics (employer name)

Implementation notes:
- Use Microsoft Graph to access OneDrive/SharePoint files.
- Use change notifications (webhooks) to detect new/updated items.

### 2) Watched Folder: Google Drive
- Same approach using Drive push notifications.

### 3) Email ingestion
- Provide a unique inbound email address per firm/client.
- Parse attachments and route based on filename rules and period.
- Provide an “ingestion inbox” UI for unmatched files.

## Routing rules
Routing config must be structured (not code):
- regex patterns on filename
- required keywords
- source type assignment
- period detection rules

## Safety / security
- Virus scanning for inbound attachments
- Signed URLs and least privilege for connector tokens
- Connector events must be auditable

## Acceptance criteria
- Automated ingestion creates Import records identical to manual upload.
- Misrouted files are recoverable without data loss.
- Users can pause/disconnect connectors.
