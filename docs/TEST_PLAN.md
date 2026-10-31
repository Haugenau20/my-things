# Verification and release gates

Status: M0–M3 and the approved UI refactor are implemented with automated coverage. The
[current operations guide](OPERATIONS.md) consolidates dated release/owner evidence and outstanding
actual-device and real-cloud recovery gates. Use the scenarios below as the release checklist; record
what was actually run without private data or credentials.

## 1. Automated test layers

Use unit tests for domain transitions/validation, component tests for interaction states, Firebase
emulator tests for SDK/rules integration, and browser tests for end-to-end workflows. The Firebase rules
test tooling supports synthetic authenticated and unauthenticated contexts; see
[References S14](REFERENCES.md#s14). Runners and commands are pinned in the repository.

Every automated feature test setup must assert the demo project ID and emulator connections. Every
new or changed feature needs relevant coverage before merge, including failure/recovery and positive/
negative authorization where applicable. The CI `Verify` job must not receive production credentials.
Use synthetic names, notes, serials, and generated image fixtures. A separately authenticated deploy
job evaluates synthetic cloud policy requests without reading/writing inventory data.

Production releases run only through [GitHub Actions](GITHUB_ACTIONS.md) after merge to `main` and a
successful complete `npm run check`. Never bypass failed checks with a local CLI or console release.
Retry the workflow after a fix; roll back with a reviewed revert PR. Emulator verification does not
replace the device/cloud acceptance scenarios below.

Custom-domain preparation must accept `things.muninn.quest` and the configured project's Firebase
Hosting name while rejecting unreviewed/lookalike names and mismatched production targets. Test
configuration fingerprints and generated exact-origin CORS with synthetic values. Check the public
shell's `noindex` marker against demo emulators. Before activation, separately verify DNS/HTTPS,
Google redirect sign-in, unrelated-account rejection, authenticated photo upload/recovery/export and
the unaffected `muninn.quest` website. Record the deployed commit/workflow and actual-device results;
see [custom-domain gates](plans/2026-10-11-custom-domain-design.md).

## 2. Authorization matrix - release blocking

| Attempt | Unauthenticated | Unrelated signed-in UID | Inventory owner |
| --- | --- | --- | --- |
| Read inventory settings | Deny | Deny | Allow |
| Enumerate root inventories | Deny | Deny | Deny in V1 |
| Read/list inventory items, rooms, boxes | Deny | Deny | Allow |
| Create/update permitted records | Deny | Deny | Allow valid operations only |
| Create/delete an inventory root | Deny | Deny | Deny from client |
| Modify root owner/schema fields | Deny | Deny | Deny from client |
| SDK download, URL issuance or metadata inspection | Deny | Deny | Allow valid owned path |
| Read photo using a previously issued valid bearer URL | Allow that photo | Allow that photo | Allow that photo |
| List own inventory photo namespace | Deny | Deny | Allow only scoped listing |
| Upload/delete a photo | Deny | Deny | Allow valid path/type/size/action only |
| Read another inventory's data/photos | Deny | Deny | Deny unless separately its owner |

Also test missing roots, manipulated inventory IDs, malicious owner-field updates, nested-path bypasses,
unexpected fields, unsupported schema versions, invalid revisions, wrong file extensions/content types,
oversized uploads, metadata-only changes, and storage deletion with no incoming resource.

For Storage releases, separately run the explicit synthetic cloud Rules API check documented in
[Setup](SETUP.md) and [photo upload investigation](PHOTO_UPLOAD_FIX.md). It covers absent and explicitly
null custom-metadata maps, plus the approved single UUID-token field. The SDK/emulator's empty-map
normalization does not exercise the cloud's null-map case. Reject malformed/multiple/non-string tokens,
extra custom fields, foreign/anonymous uploads and
replacement. The emulator removes token metadata from the rules resource; synthetic cloud evaluation
must cover that validation. Neither establishes the real upload outcome: the owner/device retry remains
required. Verify issued-link downloads without authentication, refusal of absent/wrong tokens, and
invalidation after object deletion. Null metadata must not bypass owner binding, exact registered bytes,
JPEG content type or replacement denial. Missing policy documents/owner/schema fields must still deny
SDK downloads, URL issuance, metadata inspection, listing, uploads and deletion after lookup simplification.
Sign-out clears app images/URL leases but does not revoke copied links.

Run direct SDK/HTTP requests, not only UI navigation tests. A route guard passing says nothing about data
protection. Verify that deleting/renaming a frontend route does not affect backend authorization.

## 3. Product and domain behavior

| ID | Test |
| --- | --- |
| T-CAP-01 | Name required; intentional photo-free saves are acknowledged; selected uploads must finish before capture succeeds |
| T-CAP-04 | Saved photo-free item survives reload, receives photos later under the same ID, and survives attachment cancellation |
| T-CAP-02 | Save & next retains capture room, resets per-item data, and defaults to needs-review |
| T-CAP-03 | Optional details can remain blank; save-as-reviewed is explicit |
| T-LOC-01 | Capture sets a nullable room tag; packing/repacking/unpacking preserves it |
| T-LOC-02 | Room and Box facets combine independently; archived referenced rooms remain findable and counted |
| T-LOC-03 | Renaming a location preserves links; archived labels remain readable |
| T-MOV-01 | Each decision/progress transition obeys the schema and completion timestamps |
| T-MOV-02 | Store/take completion remains owned; sell/give-away completion enters Gone, clears box, and preserves room |
| T-MOV-03 | Reopening/decision changes do not invent a location or silently retain invalid progress |
| T-VAL-01 | Group value is a total; null differs from zero; currency defaults do not convert old amounts |
| T-VAL-02 | Currency parsing handles supported fractional digits; mixed-currency totals are not combined |
| T-EDIT-01 | Bulk updates only selected fields and report individual conflicts/failures |
| T-EDIT-02 | Two-tab revision conflict is surfaced instead of overwriting a newer edit |
| T-BRW-01 | Search includes metadata beyond the currently displayed page; indexing progress is honest |
| T-BRW-02 | Decision/progress/review edits, explicit refresh and conflict recovery retain unchanged gallery/inspector images without new Storage URL or media requests; photo retry and sign-out still work |
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
- Sign out and confirm inventory UI and issued URL references disappear; revisit deep links and browser history. Test
  other open app tabs. Record the limits of clearing previously downloaded data.

Before advertising Home Screen support, repeat sign-in, capture, browsing, and session tests in that mode.
Automation using a WebKit engine is useful but does not replace this real-device check.

## 7. First real acceptance scenario

Capture 20 real items in two rooms using the iPhone. Include a grouped entry, a label close-up, multiple
photos, and an item left unassigned. Review on Windows, pack selected items into a numbered box, rename a
room, complete one sale and one donation, and trash/restore another item. Verify the default inventory,
Gone, room-tag search, box contents, and value semantics. Export and restore into an empty,
isolated, administrator-authorized cloud verification inventory; check all relationships and photo
hashes. Never overwrite the main inventory. Keep this test data private. Normal automated tests remain
synthetic emulator-only checks, not evidence of cloud backup/recovery.

## 8. Sign-off record

Current M1 local command results, covered capture/security/failure scenarios, and remaining cloud/device
gates are recorded in [M1 capture evidence](M1_CAPTURE.md). Chromium at phone width is not an actual
iPhone test. M2 organization evidence is recorded in [M2 organization](M2_ORGANIZE.md); its synthetic
workflow does not replace the real twenty-item test. M3 permanent-deletion and inspection evidence is
recorded in [M3 recovery](M3_RECOVERY.md). Export evidence and bounded splitting are recorded in
[M3 export](M3_EXPORT.md) and [M3 restore](M3_RESTORE.md). Synthetic restore tests cover multipart history,
interrupted uploads/reload/resume, collision refusal, changed imported records, root authority retention
and actual Chromium JPEG reopening. Device acceptance and isolated cloud recovery proof remain pending.

For each release, record commit ID, environments, device/browser versions, automated commands/results,
manual scenarios run, export/restore outcome, known limitations, reviewed merge and deployment workflow
URL/result. Separate
passed, failed, and not-tested results. M0/M1 prototypes are not a production-ready inventory merely
because a happy-path screenshot looks correct.

## 9. Approved schema-v2 UI refactor

Follow the ten handoff stages in [UI refactor](UI_refactor/README.md). Reject v1 records and archives clearly. Cover room assignment and packing separately, Gone retaining its room tag, room archiving with referenced items, box occupancy and assignment/archive races, Trash restore with archived room tags, and exact v2 export/restore photo checksums. Validate synthetic seed data against domain schemas. Production wipe authorization was granted on 2026-10-10; actual execution and root-authority retention must be recorded separately.

Workspace coverage includes dedicated navigation/admin views, unfinished-restore barriers, retained capture drafts, Room × Box cross-counts with secondary filters, referenced archived room visibility, grouping defaults and retained explicit choices, selection clearing on filter changes, and `/` search focus. All automated browser fixtures are synthetic and use only the complete demo emulator stack. Release evidence and remaining device/cloud gates are recorded in [UI refactor evidence](UI_REFACTOR.md).

Cards/group tests verify independent tags and redundant-tag hiding, visible-group selection and packing, per-item revision conflicts with failures retained, acknowledged new-box creation with duplicate-label confirmation, Open box navigation, and no horizontal overflow at desktop breakpoint widths.

Contextual selection tests cover forward/reverse Shift ranges, stale anchors, Escape and Clear, hidden bulk controls with no selection, Select all filtered, acknowledged results and expandable per-item conflicts, room/category/packing commands, moving warnings, Trash/Restore, and clearance for the last card row below the floating bar.

Inspector tests cover the mounted filtered grid, selected-card ring, filtered previous/next and keyboard navigation, retained full view, phone fallback, save-on-change acknowledgment and rollback, confirmed/canceled disposal, retained unsaved details on conflict and explicit Load latest. Retained full-view regressions continue exercising private photos, attachment recovery and money validation.

PR-07: verify desktop Add/N switches the shared panel, current-room defaults, close/reopen retained name/files, drag-and-drop previews, optional metadata, Enter and Ctrl/Cmd+Enter, acknowledged recent-item navigation and cleared-name focus. Rule/SDK cases must accept valid optional fields for the owner, deny foreign/unauthenticated and invalid fields, and reject a changed metadata payload under the same capture ID. Existing upload/attachment/discard failure tests must continue passing. Real camera/HEIC device checks remain separate.

PR-08: check phone Things/Review/More navigation, every administrative view and sign-out; Room/Box sheets must preserve cross-counts and archived labels. Confirm filtered full-view Back retains context, two square columns at 320/390/850px, horizontal chips without page overflow, 44px targets, floating Add above tabs, and bulk/last-row clearance. iPhone Safari/Home Screen safe-area and keyboard behavior remain manual acceptance checks.

PR-09: verify shoot/name/acknowledged-saved loop, No photo, second photo, sticky room after reload, absence of Details/reviewed shortcut, pending queue progress and capacity, retained original IDs/sources on failure, sequential uploads, no early toast, backup/restore barriers, preparation correction, partial-discard retry, Undo revision conflict and sign-out/late-callback suppression. Only acknowledged records/photos may be counted saved. Device tests must exercise ten items in one room, native camera and existing HEIC/JPEG/PNG, keyboard Return/save placement, Safari/Home Screen safe areas and room preference when localStorage is unavailable. The memory queue is not an offline or reload-surviving capture guarantee.

PR-10: assert every matrix cell equals the shared Things filter, including Gone, No room and referenced archived rooms; exclude Trash/drafts and unreferenced archived locations. Browser cases verify cell, row and column links, repeated identical navigation after changing search/grouping, cleared selection, many-box scrolling with sticky Room, phone room lists and no page overflow at 320/390/850px.
