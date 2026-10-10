# Photo processing, storage, and recovery

Goal: recognizable browsing photos, readable label close-ups, low storage use, and no false saved states.
These are initial implementation defaults; validate them on the owner's devices before large-scale use.

## 1. Capture and transformation

Start with a standard camera/file picker, not a custom camera interface. Offer camera capture and existing
photo selection. The HTML `capture` attribute is a device-dependent hint, not a guarantee that every
browser presents the same interface. [References S16](REFERENCES.md#s16).

Process one source image at a time. Decode, normalize orientation, resize, and encode fresh JPEG derivatives:

| Output | Initial target | Hard uploaded size limit |
| --- | --- | --- |
| Detail | Longest edge at most 2,000 px; never upscale; starting quality about 0.85 | 8 MiB |
| Thumbnail | Longest edge at most 400 px; preserve whole image; crop only visually in gallery | 512 KiB |

Starting input guardrails: at most 40 MiB and 50 megapixels per source; at most 2 photo entries per item.
These numbers are editable guardrails, not performance promises. Catch decode/allocation failures and
give a smaller-file/retry path. Release decoded buffers between images instead of holding multiple large
canvases at once. Bound upload concurrency to two files initially. D10 was reduced from ten entries
after complete embedded-metadata validation exceeded the Firestore rules expression budget in M1.

Do not copy EXIF, location, or camera metadata into derivatives. Verify this with a metadata-containing
fixture. Do not simply rename HEIC to JPEG. Test actual camera capture, existing HEIC, JPEG, PNG,
orientation, and small labels from iPhone to Windows. A failed HEIC decode must preserve the user's file
and explain supported conversion/reselection; it must not create an apparently completed item. Select
any conversion dependency only after the real-device spike establishes the need.

The original upload is not retained in cloud storage by default after the derivative policy passes
manual quality checks. Never delete or alter the owner's source file/photo-library entry. Tell the owner
that optimized inventory photos are not a full-resolution photographic backup. Do not silently discard
readability to meet an average storage-size target.

Compute SHA-256, byte size, dimensions, and path for each generated derivative. Paths follow the data
model. UUID-like photo IDs change when pixels are replaced. Retries for the same prepared bytes reuse the
same IDs; do not overwrite a ready photo in place with a different image.

## 2. New-item save lifecycle

1. Validate name/details. If no photos were selected, create a ready item with an empty photo list and
   null cover, await server acknowledgment, and finish. Otherwise prepare derivatives with stable IDs.
2. Write an item with `recordState: draft`, pending photo metadata, and a null cover. Await acknowledgment.
3. Upload the derivatives at their planned paths with image/jpeg and private cache metadata. Show progress.
4. Mark each photo ready only after both files are confirmed. When all selected photos are ready, set the
   cover and mark the item ready in a revision-checked Firestore update.
5. Only then show **Saved** and advance to the next item. Release temporary blobs and previews.

Use the SDK's resumable-upload/progress/error mechanisms where suitable; these do not promise continued
execution after closing the app. [References S13](REFERENCES.md#s13).

If the user explicitly removes a failed optional photo from an attempt, clear its live objects before
finishing the changed attempt. Never silently drop selected photos and call the original request saved.

## 3. Failure and retry behavior

| Interruption | Expected behavior |
| --- | --- |
| Decode/resize fails | Keep selection and explain failure; do not save a new capture; preserve an existing saved item |
| Draft write fails | No upload unless draft existence is verified; retry with same attempt ID |
| One derivative upload fails | Keep draft/pending photo; retry missing or unverified file |
| Upload finishes but final record write fails | Verify expected objects; retry metadata finalization |
| Browser closes or source blobs are lost | Show incomplete attempt next visit; do not promise automatic restart |
| Write result is unknown | Re-read by stable ID before creating another item; show checking/pending state |
| Auth expires or access is denied | Stop; reauthenticate/diagnose; do not make objects public |

Reconcile using exact expected paths and hashes. During reload recovery, download/check existing bytes
when needed rather than trust that an object name alone means it is the correct file. A new selection
with different bytes receives a new photo ID; explicitly discard the old pending photo. Retrying a
partially successful write must not duplicate an item or append the same photo twice.

Transient loss of network is still possible without an offline requirement. A timeout does not prove a
queued write was canceled; recheck before retry. Unfinished operations are visible in an authenticated
recovery panel. There is no persistent local offline photo queue in V1.

## 4. Existing items and deletion

Adding a photo to a ready item records a pending entry while existing ready photos remain visible. Finish
only when both variants and metadata are acknowledged. Change cover only to a ready photo.

Photo-free ready items can receive their first photos from detail without becoming capture drafts.
Register pending metadata through a revision-checked partial patch; keep the saved item visible.
Retry verifies matching IDs/paths/hashes. Explicit attachment cancellation marks its photos deleting,
deletes only their exact file paths, and clears metadata last without deleting the saved item.

To remove a photo, change cover if needed (null when no ready photo remains), mark that photo deleting,
delete both objects, then remove its metadata. Keep the deleting entry when cleanup fails so retry paths
are not lost. At the photo-count limit, finish cleanup before accepting more entries.

Permanent item deletion starts from trash and sets `recordState: deleting`. Delete all live objects under
that exact item's prefix, including unfinished/unused variants, using paginated authenticated listing.
Treat an already missing object as success. Delete the item document last. A separate deletion-operation
document is not required; the existing item is the recovery marker until cleanup finishes.

The M3 recovery slice implements this for ready trash with completed photos. Listing pages contain at
most 100 entries, deletion uses concurrency two, and a second listing verifies no live objects remain.
Only recognized `detail.jpg`/`thumb.jpg` paths are removed; unexpected objects block final deletion for
administrative review. The separate recovery panel offers a confirmed retry after reload. Cancellation
stops subsequent work but cannot retract already submitted writes. There is no bulk permanent-delete
operation or automatic cleanup.

Cloud Storage soft-delete/retention policies may retain billed copies after live deletion. Inspect the
bucket policy and document it; application deletion is not a promise of immediate physical erasure.
[References S18](REFERENCES.md#s18).

## 5. Orphans, downloads, and browser memory

Drafts and deleting markers should account for routine failures. Also provide an owner-only maintenance
check for objects not referenced by any current item/photo. Make it explicit, preview-only first, and
skip active attempts or recent objects. Initial safety age: 24 hours; do not schedule automatic deletion.
Never apply a bucket-wide age-based lifecycle rule to all inventory photos.

The implemented preview walks at most 50,000 folder/file entries, rejects repeated pagination tokens,
counts all draft/trash/deleting references, and rechecks server item IDs/revisions after listing.
Unexpected objects and invalid creation/type/size metadata require administrative review. The preview
does not delete files or check referenced photo bytes; it must not be mistaken for a backup integrity
check. See [M3 recovery evidence](M3_RECOVERY.md).

Download thumbnails lazily through authenticated SDK access. Use a bounded in-memory blob cache; revoke
object URLs on eviction/sign-out. Load full detail photos only when opened. Never precache the full
inventory through a service worker. Share the same authenticated download helper with export, but give
exports separate bounded concurrency and progress/cancel handling.

Desktop capture occupies the shared right panel and retains the name, optional details and selected source files when closed. Two drag-and-drop slots preview at most two local files using temporary object URLs, revoked on replacement/unmount. Camera/library selection still uses native file inputs; the existing two-photo limit, derivative preparation, locked retry identity and explicit unfinished-attempt recovery apply. Recent saves use authenticated thumbnail retrieval and appear only after record/photo acknowledgment.
