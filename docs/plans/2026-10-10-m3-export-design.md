# M3 export slice design

Implement the documented version-1 export format as a separately reviewable slice after recovery.
Keep restore and cloud round-trip proof explicitly outstanding. No cloud writes or schema changes.

Read all server items/rooms/boxes/settings, validate every record and cross-record reference, and block
all draft/deleting/pending states. Include ready owned/archive/trash items and every room/box, exact
Timestamp seconds/nanoseconds, grouped quantities, null/zero values, and historical fields. Strip owner,
project/bucket/API configuration and replace Storage paths with fixed relative photo paths. Generate
CSV with quoted cells, formula-neutralized user text and exact JSON as authority.

Pause the exporting tab's mutation controls, retain sign-out/cancel, and instruct the owner not to edit
other tabs/devices. Hash every payload, download photos through the existing authenticated verification
helper sequentially, then reload IDs/revisions/settings and reject detected changes before finalizing.
This is a validated copy, not an atomic snapshot. Never silently omit an unresolved/missing file.

Use fflate 0.8.3 (MIT, pinned; official release/docs reviewed) for standard ZIP streaming with stored
entries; JPEGs do not benefit from more compression. Keep each fallback part at or below 100 MiB of
uncompressed payload; cap metadata serialization to 64 MiB and at most 5,000 items. Use a single ZIP for
small exports. For larger exports yield numbered photo parts one at a time and finalize the main metadata
ZIP/manifest last. Show explicit saved-part confirmation and cancellation; completed means all parts
were generated and the owner acknowledged saving them, not filesystem proof. Clear/revoke each previous
Blob URL before continuing. Do not accumulate the entire backup in memory or precache images. When the
browser supports a tested user-selected-directory workflow, write each part directly with backpressure;
otherwise explicit one-part downloads remain the bounded fallback. Do not claim untested browser APIs.

Validate output by independently opening ZIPs and manifest counts/hashes; test schema/privacy, CSV
formulas/Unicode, unresolved operations, missing/wrong bytes, concurrent edits, cancellation and a
synthetic 2 GiB multipart exercise with instrumented bounded retained payload. Existing security negative
tests continue to cover records/bytes; no authorization rule expansion is needed for export.
