# Optional photos and camera control

The owner explicitly changed the photo requirement: a name is sufficient to create a saved item, and
photos can be attached later from the phone. Replace native visible file controls with keyboard-accessible
Take photo / Choose photos buttons; retain hidden native inputs and the device-dependent capture hint.

Use the existing schema-1 fields. A photo-free saved item has `recordState: ready`, `photos: []`, and
`coverPhotoId: null`. Existing photo-bearing records need no rewrite. A ready item has a ready cover
exactly when at least one photo is ready. Update the product/data/export contracts together; no live
record migration or new credential/service is needed.

For this capture follow-up, allow attaching one or two photos to a photo-free, ready, nontrashed item.
Prepare stable IDs/derivative metadata, transactionally register pending photos with a revision check,
then upload and verify both variants before finalizing only photo fields. Preserve name, location,
review/workflow, timestamps, and identity; do not recreate the item or demote it to a capture draft.
General replacement/removal of ready photos remains later work.

Keep interrupted attachments visible in recovery and keep the original item in the gallery. Retry
existing exact paths/hashes or reselect originals. Explicit cancellation first marks photos deleting,
deletes only their exact object paths, then removes photo metadata; the original item remains saved.
Failed cleanup retains the marker. Storage uses the same root + item lookup budget and accepts matching
pending photos only. Firestore rules allow these narrow photo transitions without opening general edits.

Verify zero-photo defaults/cover invariants, old-record compatibility, server acknowledgement and stable
retry identity, revision conflicts, recovery/cancellation, and positive/negative rules. Browser tests cover
visible button labels, desktop name-only capture, reload, later attachment, and interrupted attachment
without losing the item. All automated suites remain on demo-inventory. Actual native phone camera and
cloud photo privacy remain manual checks. Deployment authorization persists from the owner.
