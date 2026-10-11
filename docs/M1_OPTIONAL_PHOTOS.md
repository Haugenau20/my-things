# Optional-photo capture follow-up

> Historical evidence: behavior, authorization and pending checks below describe their recorded
> milestone. For current schema, photo policy, release procedure and acceptance status, start with
> [current operations](OPERATIONS.md). Earlier permissions do not authorize new maintenance or merges.

Date: 2026-10-10. Owner-requested change after merged PR #3: replace native "Choose File" controls with
visible Take photo / Choose photos buttons, permit desktop name-only entries, and attach first photos
later to those same saved items. The follow-up frontend and matching rules are deployed under
the owner's standing deployment authorization. [Design](plans/2026-10-10-optional-photos-design.md).

## Behavior and compatibility

- A nonblank name can be saved with no photos. The acknowledged item is ready with an empty photo list,
  null cover, and a No photo yet placeholder. Needs-review/reviewed and sticky-room behavior are preserved.
- Open the photo-free item's detail on the phone to take/select one or two photos and choose Save photos.
  The same item ID, details, review/workflow, location, and creation timestamp are preserved. General
  ready-photo replacement/removal remains future work.
- Revision-checked partial patches register pending metadata, then finalize photos/cover only after both
  variants are uploaded and verified. Unknown outcomes retry stable IDs; conflicting attachments fail.
- The original item remains saved during interrupted attachments. Recovery verifies existing bytes or
  requests the originals. Explicit cancellation marks photos deleting, deletes only exact derivative
  paths, and clears metadata last. Failed cleanup remains retryable and never deletes the saved item.
- Camera/library buttons open native hidden file inputs and remain keyboard-accessible. Sequential
  camera selections append. The capture hint can open a camera on supported phones; desktop browsers
  may open a file chooser. The app does not control native picker wording or guarantee a desktop camera.
- Invalid/oversized/unsupported selected photos are not silently converted into a photo-free success.
  Excess selections must be corrected or explicitly cleared before saving.

No stored fields, schema/export versions, dependencies, or infrastructure were added. Existing
photo-bearing schema-1 records remain valid and need no rewrite. The relaxation permits new empty
photo lists and the already-documented pending/deleting photo states on ready items. No existing live
record was migrated or seeded; no production photos or export were read into this repository. Future
M3 exports must include photo-free records with zero files; unresolved attachments still block a full
backup. This implementation does not claim export/restore functionality or proof.

## Checks actually run

| Command/check | Result |
| --- | --- |
| Domain baseline: focused item unit tests | Two new cases failed against the prior photo-required/cover validation, then passed |
| Rules baseline | Four new capture/attachment cases failed against the prior closed rules, then passed |
| SDK baseline | Three cases failed because attachment operations were absent, then passed after implementation |
| Browser baselines | Missing visible camera button failed; after button implementation, name-only save failed; both passed after implementation |
| `mise exec -- npm run check` | Passed: ESLint/Prettier, strict TypeScript, 92 unit, 68 rules, 12 SDK integration, 16 browser tests, local build |
| `git diff --check` | Passed |
| `mise exec -- npm run lint` after documentation updates | Passed |
| `mise exec -- npm run build:prod` | Passed; existing Firebase chunk warning remains |
| `mise exec -- npm run deploy:check -- production PROJECT_ID main` and `release:prepare` | Passed; ignored production configuration generated |
| Pinned Firebase CLI `deploy --only firestore:rules,storage,hosting --project PROJECT_ID --config .firebase/production.firebase.json --non-interactive` | Exit 0; both rules compiled and released; Hosting released |
| Live signed-out browser inspection | Sign-in button visible; Google redirect reached account page; no observed console/page errors |
| Live page/bundle check | HTTP 200; optional-photo copy and new camera/library/attachment labels present |
| Anonymous live Firestore root/item-list and Storage prefix-list probes | HTTP 403 for all three |

All automated backend workflows use `demo-inventory` and the Auth/Firestore/Storage emulators. Tests
cover negative authorization, malformed/extra/changed photo fields, stale revisions, two-photo rules
and UI completion, preservation of existing metadata, stable retry identity, interrupted recovery,
failed-cleanup retry, private blob-photo rendering, sign-out, and unsupported/excess selections.
Synthetic narrow-screen screenshot visually inspected: distinct labeled photo buttons and optional-photo
copy render correctly. Existing Firebase bundle chunk remains 591.77 kB minified / 176.82 kB gzip;
Vite's >500 kB warning remains. No actual-phone performance claim is made.

## Manual gate

Create several disposable name-only entries on Windows, then open them on the actual iPhone and use
Take photo to attach images. Reload on both devices, verify readable labels and both derivatives,
interrupt an attachment, and verify recovery/cancellation preserves the item. Confirm actual camera,
HEIC, OAuth/CORS, authenticated photo privacy/token behavior, and provider resumable-session races.
These live-device checks remain pending; M1's gate and M3's primary-use/backup gate remain open.
