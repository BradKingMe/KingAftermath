# Snapshot formats 1 and 2

```json
{
  "format": "kingaftermath.snapshot",
  "version": 1,
  "collector": "windows-0.1.0",
  "id": "unique-capture-uuid",
  "label": "Before install",
  "capturedAt": "2026-10-23T14:00:00Z",
  "machine": {
    "id": "sha256-of-machine-guid",
    "userId": "sha256-of-user-sid",
    "name": "WORKSTATION",
    "os": "Windows version string",
    "scope": "windows64-current-user-and-machine-v1-standard"
  },
  "sections": {
    "apps": { "status": "complete", "warnings": [], "items": [] },
    "startup": { "status": "complete", "warnings": [], "items": [] },
    "services": { "status": "complete", "warnings": [], "items": [] },
    "tasks": { "status": "complete", "warnings": [], "items": [] }
  }
}
```

Each item is `{ "id": "stable-source-specific-id", "name": "Display name", "source": "Evidence location", "fields": { "FieldName": "String value" } }`.

The original four sections are required. Format 2 adds `tracking` (up to ten folder strings) and optional `files` evidence. Files may be `not-collected`; older snapshots normalize to that state. Failed/uncollected sections cannot contain items. Complete means declared collector scope, not all Windows configuration.

Optional record `targets` contains up to 50 `{ input, path, status, reason }` observations. Status is exists, missing, unresolved or inaccessible. Limits are 32,768 characters for input, 4,096 for path and 2,000 for reason. Targets are retained in evidence but excluded from configuration diffs. Collector scope binds privilege level, target-check preference and a hash of normalized tracked roots; comparisons also check the root arrays directly.

The parser creates a normalized object and drops unrecognized metadata. IDs become lowercase. Duplicate IDs within a source are rejected. Field dictionaries have null prototypes; field values are strings and are escaped in HTML. Unknown fields can be retained, so the collector version and scope must match across captures.

Limits: 25 MB UTF-8 input; 20,000 items per source; 100 warnings of 2,000 characters per source; 30 fields per record; 32,768 characters per field value; 4,096 per ID/source; 2,000 per item name; 200 per capture ID/label; 500 per machine field. Timestamp must parse and include a timezone. All captures must have unique IDs, strictly increasing timestamps and matching machine/user/scope/collector strings.

Timestamps identify capture start, not an atomic acquisition. Capture identities and machine hashes are unsigned assertions. File size checks and structural validation are resource bounds, not provenance verification.

See the three [example files](../examples/) for populated evidence.

## Investigation package format 1

`format: kingaftermath.investigation`, `version: 1`, export timestamp, exactly three nullable snapshot slots and `review`. Review contains title (200 characters), notes (20,000), up to three capture contexts (5,000 each) and up to 10,000 decisions. Decision keys are `capture-id|category:stable-record-id`; values contain status (unreviewed, keep, investigate, unrelated) and reason (5,000). References must point to included evidence. Packages are capped at 3 × 25 MiB + 2,000,000 bytes. Validation does not establish provenance or signatures.
