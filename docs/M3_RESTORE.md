# M3 archive validation and restore

> Historical evidence: behavior, authorization and pending checks below describe their recorded
> milestone. For current schema, photo policy, release procedure and acceptance status, start with
> [current operations](OPERATIONS.md). Earlier permissions do not authorize new maintenance or merges.

Implemented under the owner's instruction to continue unblocked work while away, with standing release
authorization. All data exercises use synthetic `demo-inventory` Auth/Firestore/Storage emulators.
No production inventory was read, exported, imported, migrated, deleted or cleared for this slice.

## Behavior and acceptance

Restore backup validates every selected ZIP part without writes, shows counts/history and an explicit
environment/destination, and requires confirmation before restore. The destination root must already
authorize the signed-in owner. Existing records or orphan files block a new import. Source ownership
policy cannot grant access. Name/currency restoration is optional; destination owner/root creation time
remain intact.

ZIP32 directory/local headers, ranges, CRC-32, membership, versions/counts, strict schemas, unique
IDs/paths, references, sizes and SHA-256 are checked before writes. Stored and DEFLATE payloads are
supported within bounded limits. Unsupported encryption/ZIP64/types/extras/comments, traversal,
symlinks, excessive expansion and future schemas are refused. Photo hashes/JPEG header dimensions are
validated separately; this does not certify every JPEG codec behavior.

Rooms/boxes retain IDs and archive/creation history. Items retain IDs, quantities, null/zero total values,
currencies, original rooms/locations, plain Unicode/multiline text, leading-zero serials, workflow
completion, trash history and cover choices. Photo IDs/bytes are preserved under derived destination
paths. Revisions restart at one then advance during photo/finalization writes; update times record the
import. Historical timestamps remain exact at Firestore-supported microsecond precision; finer precision
is rejected instead of silently truncated. Source server-read exports already satisfy this requirement.

A persistent owner-only report and claims track the same manifest/export/counts. Transactions create
only absent records and paired claims. Ordinary changes and full export pause until completion.
Interruption retains records/files and requires the same archive to resume. Recovery compares every
claimed record/photo, refusing unrelated or changed data. No automatic wiping/cleanup occurs. Only a
report with zero claims can be explicitly released. Final inspection checks all counts, references and
private file hashes before success. Completed reports remain; a different archive needs another empty
authorized destination.

After completion, a read-only item selector opens the restored destination's photos with authenticated
blob retrieval, allowing legibility checks without changing the main workspace's configured inventory.
It shares the workspace's bounded private-photo session; URLs disappear when views close or sign-out
ends the session. Archived/trashed items remain available in this verification selector.

## Verification

Archive-reader tests first failed on the absent module; positive restore rules failed against the
previous policy before implementation. Focused archive validation and 100 rules checks passed. SDK
multipart round-trip/recovery checks passed before subsequent failure tests were added. Early browser
runs stopped on collapsed-panel and overlapping-status assertions; those were corrected.
`mise exec -- npm run check` passed twice on 2026-10-10; the final run includes the destination photo
preview. It passed ESLint/Prettier, strict TypeScript, 137 unit tests, 100 authorization tests, 27 SDK
emulator integration tests, 26 Chromium browser tests and the local build (290 tests total).
Final preview session integration also passed `mise exec -- npm run lint` and `mise exec -- npm run typecheck`.
`mise exec -- npm audit --omit=dev` reports zero production dependency vulnerabilities.

Coverage includes multipart source-to-separate-destination restore, exact supported timestamps, archived
locations, zero/grouped values, disposal/trash history, second-photo cover preservation, remapped private
file bytes, unchanged root owner/creation time, optional settings, idempotent completed verification,
interrupted upload/reload/resume, a raced capture before locking, explicit zero-claim unlock, cancellation,
unconfirmed recovery writes, changed imported records, orphan files and unsigned/foreign denial.
Chromium downloaded a real photo export, refused a nonempty destination, retained a denied upload,
resumed from the same files after reload, and decoded private restored preview/gallery JPEGs.
The synthetic 5,000-record serialization and actual 2 GiB export splitting tests reran in the unit suite.
The existing Firebase chunk warning remains 591.77 kB (176.82 kB gzip); the local app chunk is 445.82 kB.

No actual iPhone/Windows scenario, personal cloud export/restore, production photo ACL/token audit,
large browser-memory measurement or Home Screen check was performed. Existing 2 GiB synthetic export
splitting evidence remains valid; it does not prove a 2 GiB cloud restore. SDK fixtures use a synthetic
JPEG header for byte/metadata tests; Chromium uses a canvas-generated real image. No emulator result
is a real backup/recovery proof. Tooling audit findings remain documented in [M3 export](M3_EXPORT.md).

## Production release

Source `d51ba78` passed `mise exec -- npm run build:prod`, explicit production destination preflight and
`mise exec -- npm run release:prepare`. Firebase CLI deployed Firestore rules and Hosting successfully
on 2026-10-10 under standing owner authorization. An isolated signed-out Chromium session displayed the
Google button and reached `accounts.google.com` without console/page errors. Anonymous root, item-list,
restore-report and Storage-prefix requests all returned 403. No production records/photos were read,
exported, imported, migrated, deleted or cleared. No verification root was seeded. Storage rules, Auth,
IAM, CORS, billing and infrastructure were unchanged. These checks do not prove authenticated cloud
restore, actual-device behavior or a personal backup.

## Operating steps and remaining gates

Updated 2026-10-11: follow the consolidated [current operations guide](OPERATIONS.md) for the
current schema-v2 restore procedure, token URL policy and acceptance status. The preceding sections
are historical evidence; the present gallery/restore preview uses owner-authorized token URLs, not
authenticated blob delivery. The owner confirmed upload/delete after PR #25; real-cloud restore
and actual iPhone acceptance remain pending.

Use [Export and verification restore](OPERATIONS.md#export-and-verification-restore) for the complete
procedure. The separate verification root requires `schemaVersion: 2` and the existing trusted owner
binding, as specified in [Data model](DATA_MODEL.md#1-paths-and-ownership). Provisioning and real-data
operations require explicit owner authorization. No production verification root was created for this
milestone. Preserve the main inventory; never wipe a destination to make restore pass.
