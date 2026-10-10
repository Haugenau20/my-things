# Verification and release gates

Status: M0 automated tests are implemented; evidence and remaining release gates are recorded in
[M0 foundation](M0_FOUNDATION.md). The product, recovery, real-device, cloud, and backup scenarios below
remain later-milestone release checks. Record evidence without private data or credentials.

## 1. Automated test layers

Use unit tests for domain transitions/validation, component tests for interaction states, Firebase
emulator tests for SDK/rules integration, and browser tests for end-to-end workflows. The Firebase rules
test tooling supports synthetic authenticated and unauthenticated contexts; see
[References S14](REFERENCES.md#s14). Select and pin runners during M0.

Every test setup must assert the demo project ID and emulator connections. CI must not require production
credentials. Use synthetic names, notes, serials, and generated image fixtures.

## 2. Authorization matrix - release blocking

| Attempt | Unauthenticated | Unrelated signed-in UID | Inventory owner |
| --- | --- | --- | --- |
| Read inventory settings | Deny | Deny | Allow |
| Enumerate root inventories | Deny | Deny | Deny in V1 |
| Read/list inventory items, rooms, boxes | Deny | Deny | Allow |
| Create/update permitted records | Deny | Deny | Allow valid operations only |
| Create/delete an inventory root | Deny | Deny | Deny from client |
| Modify root owner/schema fields | Deny | Deny | Deny from client |
| Download photo or inspect metadata | Deny | Deny | Allow valid owned path |
| List own inventory photo namespace | Deny | Deny | Allow only scoped listing |
| Upload/delete a photo | Deny | Deny | Allow valid path/type/size/action only |
| Read another inventory's data/photos | Deny | Deny | Deny unless separately its owner |

Also test missing roots, manipulated inventory IDs, malicious owner-field updates, nested-path bypasses,
unexpected fields, unsupported schema versions, invalid revisions, wrong file extensions/content types,
oversized uploads, metadata-only changes, and storage deletion with no incoming resource.

Run direct SDK/HTTP requests, not only UI navigation tests. A route guard passing says nothing about data
protection. Verify that deleting/renaming a frontend route does not affect backend authorization.

## 3. Product and domain behavior

| ID | Test |
| --- | --- |
| T-CAP-01 | Name required; intentional photo-free saves are acknowledged; selected uploads must finish before capture succeeds |
| T-CAP-04 | Saved photo-free item survives reload, receives photos later under the same ID, and survives attachment cancellation |
| T-CAP-02 | Save & next retains capture room, resets per-item data, and defaults to needs-review |
| T-CAP-03 | Optional details can remain blank; save-as-reviewed is explicit |
| T-LOC-01 | First room fills original room; moving and packing preserve it |
| T-LOC-02 | Current room filter differs from original room filter; box grid shows actual contents |
| T-LOC-03 | Renaming a location preserves links; archived labels remain readable |
| T-MOV-01 | Each decision/progress transition obeys the schema and completion timestamps |
| T-MOV-02 | Store/take completion remains owned; sell/give-away completion archives and clears location |
| T-MOV-03 | Reopening/decision changes do not invent a location or silently retain invalid progress |
| T-VAL-01 | Group value is a total; null differs from zero; currency defaults do not convert old amounts |
| T-VAL-02 | Currency parsing handles supported fractional digits; mixed-currency totals are not combined |
| T-EDIT-01 | Bulk updates only selected fields and report individual conflicts/failures |
| T-EDIT-02 | Two-tab revision conflict is surfaced instead of overwriting a newer edit |
| T-BRW-01 | Search includes metadata beyond the currently displayed page; indexing progress is honest |
| T-DEL-01 | Trash/restore preserve data; restoring a sold item does not silently make it owned |
| T-DEL-02 | Cover points to a ready photo when one exists; otherwise it is null |

## 4. Failure injection - release blocking

Interrupt before draft creation, during each derivative upload, between file completion and metadata
finalization, and during permanent deletion. Verify stable IDs, no duplicate records/photos, no false
saved/deleted states, and a visible recovery path after reload. Include an unknown write outcome and a
source blob that is no longer available. Test expired/denied authentication and canceled file selection.

For existing items, a failed new photo must not hide previously ready photos. Photo removal must preserve
enough metadata to retry failed deletion. Export must reject unresolved or missing-photo states rather
than produce a misleading complete backup.

Turn off each emulator separately and misconfigure an environment value; the application must fail rather
than contact a live endpoint. Test a production build with a development project ID and ensure deployment
preflight rejects it. Confirm retries are bounded and user-cancelable.

## 5. Export/import - release blocking

Round-trip data with multiple rooms, mixed-room boxes, grouped quantities, all moving decisions, a null
value, a zero value, supported currencies, multiline notes, Unicode text, leading-zero serials, archived
locations, completed sales/donations, and trash. Verify IDs/relationships, counts, metadata, cover choices,
and exact hashes of every photo derivative. No original project/bucket path or owner UID may grant access
to the destination.

Reject missing ZIP parts, wrong hashes, duplicate IDs/paths, invalid references, oversized/decompression-
bomb inputs, traversal paths, unsupported future schemas, malicious HTML, and spreadsheet-formula cells.
Reject a nonempty destination; an interrupted import must not authorize wiping unrelated records.

Run an export with another tab editing and verify that detectable revisions invalidate it. Test canceled
exports/imports and cleanup/retry. Exercise a synthetic 2 GiB photo collection before claiming support at
that size; prove bounded memory or the multipart fallback. A small fixture alone is not evidence of
large-backup feasibility.

## 6. Real browser and authorized cloud checks

These checks are manual in addition to emulators:

- On the actual iPhone, capture photos, choose existing HEIC/JPEG/PNG images, rotate the phone, background
  the browser, retry after network interruption, and confirm small model/serial labels stay legible.
- On Windows Edge or Chrome, browse the same images, bulk-edit, navigate back without losing context,
  and complete export/restore. Test keyboard focus and basic narrow/wide layouts.
- Verify real Google sign-in/redirect behavior, owner bootstrap, deployed Firestore and Storage rules,
  CORS, Storage-to-Firestore IAM integration, security headers, and denial with another account.
- Sign out and confirm private UI/blob caches disappear; revisit deep links and browser history. Test
  other open app tabs. Record the limits of clearing previously downloaded data.

Before advertising Home Screen support, repeat sign-in, capture, browsing, and session tests in that mode.
Automation using a WebKit engine is useful but does not replace this real-device check.

## 7. First real acceptance scenario

Capture 20 real items in two rooms using the iPhone. Include a grouped entry, a label close-up, multiple
photos, and an item left unassigned. Review on Windows, pack selected items into a numbered box, rename a
room, complete one sale and one donation, and trash/restore another item. Verify the default inventory,
archive, original-room search, box contents, and value semantics. Export and restore into an empty,
isolated, administrator-authorized cloud verification inventory; check all relationships and photo
hashes. Never overwrite the main inventory. Keep this test data private. Normal automated tests remain
synthetic emulator-only checks, not evidence of cloud backup/recovery.

## 8. Sign-off record

Current M1 local command results, covered capture/security/failure scenarios, and remaining cloud/device
gates are recorded in [M1 capture evidence](M1_CAPTURE.md). Chromium at phone width is not an actual
iPhone test. M2 organization evidence is recorded in [M2 organization](M2_ORGANIZE.md); its synthetic
workflow does not replace the real twenty-item test. M3 backup/cleanup and cloud restore remain future work.

For each release, record commit ID, environments, device/browser versions, automated commands/results,
manual scenarios run, export/restore outcome, known limitations, and who approved deployment. Separate
passed, failed, and not-tested results. M0/M1 prototypes are not a production-ready inventory merely
because a happy-path screenshot looks correct.
