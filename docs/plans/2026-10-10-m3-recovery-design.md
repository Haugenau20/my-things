# M3 first slice — Cleanup and inspection

Continue under the owner's instruction to implement while away. Keep this slice separately reviewable
from M2. Use the existing schema-1 item as the deletion marker; no collection/schema migration is needed.

Permanent deletion requires a ready trashed item, completed photo operations, and a displayed revision
check. Mark it deleting, retain all file metadata, walk its exact Storage prefix with paginated listing,
delete only recognized photo paths with concurrency two, verify that no objects remain, and delete the
document last. Unexpected objects, denied cleanup, cancellation, or unknown writes leave a retry marker.
Already missing objects/documents are successful retry states. A marker cannot be restored/edited during
cleanup. Cover metadata may be retained until the final document deletion. No automatic cleanup runs.

Offer permanent deletion only in trash with an explicit irreversible confirmation and a retention note.
Keep unfinished permanent deletions in their own recovery panel; never confuse them with capture drafts.
Reuse a small dedicated prefix-cleanup module for existing draft discard and permanent deletion.

Add owner-only orphan inspection as a read-only preview. Include pending/deleting/trash photo references,
skip referenced and younger-than-24-hour objects, flag unexpected paths/metadata, and recheck item IDs and
revisions before reporting a completed scan. Bound traversal and progress/cancellation. No orphan delete
button or production maintenance is part of this slice; deleting real orphan bytes requires a reviewed
preview and an explicit owner maintenance request.

Tests cover owner/foreign marker/delete authorization, stale revisions, false success prevention, denied
Storage deletion followed by reload/retry, photo-free deletion, unrelated item preservation, unexpected
objects, pagination, and orphan age/reference logic. Keep all fixtures on demo-inventory emulators.
Export/restore and large-backup proof remain subsequent M3 work; this slice is not a completed M3 gate.
