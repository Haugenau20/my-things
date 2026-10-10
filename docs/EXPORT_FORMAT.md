# Portable export and restore contract

Format: `home-inventory-export` | Format version: 1 | Status: proposed implementation contract

## 1. Scope

A complete export includes all ready item records, including completed sales/donations and trash, all room
and box records needed to preserve labels, inventory display settings, and both JPEG derivatives of every
retained ready photo. Keep original room references and grouped quantities. It is not an export of account
authorization, Google/Firebase tokens, or cloud infrastructure.

Preflight must find and resolve drafts, pending photo additions/deletions, and item deletion operations.
Offer retry or explicit discard, not silent exclusion. A complete export is blocked while those operations
are unresolved or any referenced file is missing. A future salvage export may relax this, but it must be
separately labeled incomplete and is not a V1 substitute for a verified backup.

Pause mutations in the exporting tab and ask the owner not to edit elsewhere. Read current server metadata,
not only a possibly stale UI cache. Verify referenced file checksums. Recheck record IDs/revisions/settings
before finalizing and fail/retry if a change is detected. Do not claim an atomic cross-service snapshot;
this is a validated copy taken while the owner avoids edits.

## 2. Logical file layout

All paths use forward slashes and are relative to the export. No names/serial numbers appear in photo paths.

```text
manifest.json
inventory.json
rooms.json
boxes.json
items.json
items.csv
EXPORT_README.txt
photos/{itemId}/{photoId}/detail.jpg
photos/{itemId}/{photoId}/thumb.jpg
```

Optional later: `index.html` with an escaped, self-contained offline photo gallery. Do not make restore
depend on it. JSON is the authoritative machine-readable representation; CSV is for inspection.

`inventory.json` contains schemaVersion, sourceInventoryId (provenance only), displayName, and defaultCurrency.
Omit owner UID, project/bucket IDs, credentials, provider configuration, and security policy. The source
inventory ID never authorizes a destination write.

`items.json`, `rooms.json`, and `boxes.json` are UTF-8 arrays. Each record contains its stable `id` plus the
schema fields. Convert Firestore timestamps to `{ "seconds": integer, "nanoseconds": integer }` so the
original precision is not silently lost; preserve nulls. Use UTC ISO 8601 for human-facing CSV timestamps
and manifest export time. On photo derivatives, replace `storagePath` with the relative `filePath`; keep
size, dimensions, content type, and SHA-256. Restore derives new destination storage paths.

## 3. Manifest and packaging

`manifest.json` must contain these fields:

| Field | Meaning |
| --- | --- |
| `format` | Literal `home-inventory-export` |
| `formatVersion` | Integer 1 |
| `dataSchemaVersion` | Integer 1 |
| `exportId` | Unique opaque ID for this export |
| `createdAt` | UTC ISO 8601 export timestamp |
| `complete` | True only after all preflight, file, and count checks pass |
| `counts` | Items, rooms, boxes, logical photos, and photo files; include retained archive/trash |
| `archives` | Ordered array of expected ZIP filenames |
| `files` | Array of `{ archive, path, byteSize, sha256 }` for every payload file |

The manifest itself is excluded from its file checksum list. Each other payload appears exactly once.
A checksum verifies copy integrity, not authenticity or encryption. Paths in photo metadata refer to
logical payload paths; `files` resolves each path to its containing archive.

For small inventories, deliver one ZIP with the entire layout. For a large collection, do not build a
multi-gigabyte Blob in memory. Prefer streaming to a user-selected desktop file when the tested browser
supports it. A bounded-memory fallback may split the export into a main metadata ZIP plus numbered photo
ZIPs; each ZIP contains ordinary logical paths, not an opaque proprietary split-file format. List every
part in the main manifest and require all parts during restore. Finalize the main manifest last.

Suggested filenames: `inventory-{exportId}.zip` and, when needed,
`inventory-{exportId}-photos-001.zip`, `...-002.zip`. Choose a tested part/memory limit during M3; start
with at most 100 MiB uncompressed payload per fallback part. Show progress, cancellation, and which parts
were saved. Do not imply that saving only the metadata ZIP is a complete backup.

## 4. CSV for ordinary inspection

Include one row per item with stable IDs, name, quantity, total estimated value and currency, serial
number, notes/category, original-room ID/name, current-location kind/ID/label, review/decision/progress,
creation/completion/deletion times, cover photo relative path, and photo count. Keep leading-zero serials
as text where possible and document spreadsheet-import behavior.

Escape quotes/newlines and neutralize user-entered cells that could be interpreted as spreadsheet
formulas. Preserve exact source values in JSON so CSV presentation safeguards do not lose data.

## 5. Restore behavior

V1 restore targets an empty, already authorized inventory in the selected environment. The destination
root already exists and retains its own owner binding. Do not accept arbitrary project/bucket paths from
an archive and do not import authorization policy. Refuse a nonempty destination rather than merge or
wipe it. Importing an archive is an explicit operation, never a side effect of opening a file.

1. Validate manifest version, archive membership, all JSON schemas, unique IDs, location references, photo
   references, allowed paths/content types, counts, uncompressed sizes, and every payload checksum.
2. Show a dry-run summary and explicit destination/environment. No cloud writes before validation and
   confirmation. Reject unsupported future versions; never guess and drop fields.
3. Recreate rooms/boxes and prepare item drafts. Upload exact exported bytes under destination paths,
   then finalize items after verification. Preserve stable record/photo IDs and historical timestamps;
   reset destination revisions and update times as described in [Data model](DATA_MODEL.md).
4. Restore display name/default currency only with confirmation. Do not overwrite the root owner, root
   schema policy, or root creation metadata.
5. Verify counts, references, and checksums, then report success. Reopen the gallery and spot-check images.

V1 may require cleaning an interrupted import and restarting, rather than implementing resumable merge.
Mark/report imported objects and IDs in an operation report. Before cleanup, verify that the destination
contains only that interrupted import; never treat an arbitrary nonempty inventory as disposable. Do not
report the partial result as a complete restore. A more advanced resumable importer is optional.

## 6. Import/export safety

Reject path traversal, absolute paths, repeated logical paths, unexpected archive parts, symlinks,
unsupported encodings/types, and decompression sizes above configured limits. Process photo payloads in
a bounded stream/chunk workflow rather than decompressing the entire collection into browser memory.
Do not execute scripts or fetch arbitrary URLs found in an archive. Any generated HTML must escape text.

Exports are unencrypted personal data by default. Show that clearly and keep copies in a location the
owner controls, separate from the Firebase project. Do not commit them to GitHub. A ZIP with a checksum
is not an encrypted or independently authenticated backup.

Release gate: a synthetic round trip plus the 20-item real-device sample must reproduce room/box
relationships, grouped values, completed/trash records, photo counts, and exact derivative hashes in an
empty development inventory. A 2 GiB synthetic photo export test must demonstrate bounded memory or
validated splitting before claiming support for a collection of that size.
