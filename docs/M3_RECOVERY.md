# M3 first slice — Permanent deletion and inspection

Implemented under the owner's instruction to continue while away, including the next phase. This is
the cleanup/recovery slice of M3. Full export/restore and its release gate are not complete.

## Behavior

Trash details offer **Delete permanently** with a modal confirmation naming the item and explaining
irreversibility and cloud retention. A revision-checked transaction writes the existing deletion marker
without losing photo metadata. Authenticated paginated listing removes recognized files under that exact
item prefix with concurrency two, checks the prefix is empty, and deletes the final document last.
Missing objects/documents are retry states. A pending photo operation, stale initial revision, failed
cleanup, cancellation, or unexpected path never becomes a successful permanent deletion.

Unfinished permanent deletions appear in their own recovery panel after reload and need a confirmed
retry. They cannot be restored or edited while cleanup is underway. Photo-free trash follows the same
protocol. Stopping a request cannot retract writes already submitted. Cloud Storage's previously reviewed
seven-day soft-delete policy may retain billed copies; deleting live files is not immediate physical
erasure. No production inventory maintenance is performed by this implementation work.

**Photo maintenance → Inspect stored photos** is an explicit read-only preview. All item states count as
references. Unreferenced recognized JPEG objects younger than 24 hours are skipped; older objects become
preview findings. Unknown paths or invalid metadata are flagged for administrative review. Items are
read from all server pages before and after the scan; changed IDs/revisions invalidate the result.
Traversal is bounded to 50,000 folder/file entries and supports progress/cancellation. There is no orphan
deletion action. The preview is neither an atomic snapshot nor a photo-integrity backup check.

## Integrity and recovery boundaries

No schema fields, versions, cloud services, dependencies, or owner authority change. Existing capture
discard uses the same prefix cleaner. Rules permit the narrow owner-only deletion marker and final
delete; cross-service cleanup ordering remains an application invariant. Unknown objects block cleanup
until separately authorized administrative review. All automated fixtures use demo-inventory emulators.

## Verification

`mise exec -- npm run check` passed on 2026-10-10: ESLint/Prettier, strict TypeScript, 117 unit tests,
95 Firestore/Storage authorization tests, 18 SDK emulator integration tests, 22 Chromium browser tests,
and the local build (252 tests total). The rules reject unrelated marker/final deletes and pending-photo
markers. SDK checks cover photo-free deletion, revision conflicts, cancellation, unexpected objects,
105 photo folders across listing pages, preservation of another item, and changing metadata during
inspection. Chromium injects denied Storage deletes, reloads the retained marker, and finishes retry;
inspection has no deletion action. Traversal tests reject repeated tokens, foreign paths, and limit
overflow. All records/files/screenshots are synthetic emulator fixtures.

The initial marker authorization and absent browser controls failed before implementation. A final
formatting check found one browser file; formatting was corrected and the full checklist reran green.
The existing shared Firebase chunk is still 591.77 kB (176.82 kB gzip), with Vite's size warning.

## Production release

Source commit `b176412` passed production build, explicit production destination preflight, and ignored
release preparation. Firebase CLI deployed Firestore rules and Hosting successfully on 2026-10-10 under
the owner's standing deployment authorization. An isolated signed-out Chromium session showed the Google
button and started the Google redirect without console/page errors. Anonymous requests for the root,
item collection, and Storage item-prefix listing all returned 403. No production inventory records or
photos were read, written, or deleted. Storage rules, IAM, CORS, Auth, billing, and infrastructure remain
unchanged. These checks do not establish authenticated cloud deletion or actual-device success.

## Outstanding M3 work

Full export with actual verified photo bytes, strict import validation, restore to an empty authorized
destination, interrupted-import handling, a synthetic round trip, bounded large-backup proof, and the
real acceptance scenario remain required. Actual iPhone camera/HEIC/readability and the real Windows
workflow are still manual gates. This slice does not establish that the application is ready to be the
main inventory record.
