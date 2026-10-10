# M3 second slice — Full photo export

Implemented under the owner's instruction to continue while away. This supplies the export half of the
version-1 backup contract. Import/restore and its real recovery gate remain outstanding.

## Behavior and limits

**Backup export → Start full export** reads all current server metadata and includes ready owned,
completed, and trash items, every room/box, display settings, guarded readable CSV, and actual detail
and thumbnail bytes. Photo-free entries are valid. Unfinished captures/attachments/deletions, missing
relationships, missing bytes, or bad hashes block completeness. JSON preserves seconds/nanoseconds,
nulls, grouped quantities, historical fields, and exact value semantics. Photo paths become fixed
relative paths. Authorization, project/bucket configuration, credentials, and tokens are omitted.

Wait for current saves to finish; mutation controls pause during export. Avoid edits in other tabs or
devices. IDs/revisions for all three record collections and root settings are rechecked before the
final manifest. This is a validated copy, not an atomic cross-service snapshot. An edit after the last
check remains possible. No export is automatically started and export makes no cloud writes.

Small exports produce one ordinary ZIP. Larger ones produce numbered photo ZIPs followed by the final
metadata/manifest ZIP. Save each part and explicitly acknowledge it before continuing. At most 100 MiB
uncompressed payload is accumulated per part, with a 16 MiB ZIP-overhead cap, 64 MiB metadata-payload cap,
and 5,000 records per collection. A source photo is at most the existing 8 MiB; downloads are sequential.
ZIP assembly and Blob construction can temporarily retain additional copies. These bounds are not an
exact browser process-memory guarantee. Native filesystem streaming is not implemented.

Progress and cancellation are visible. Saved photo parts are incomplete without the final main ZIP
and every archive listed in its manifest. A success message reports the owner's save acknowledgments;
the app cannot prove files were persisted. Export URLs are released between parts, on cancellation,
and on sign-out. Keep the unencrypted ZIPs together outside Firebase and the source repository.

## Verification

`mise exec -- npm run check` passed on 2026-10-10: ESLint/Prettier, strict TypeScript, 125 unit tests,
95 authorization tests, 19 SDK emulator integration tests, 25 Chromium browser tests, and the local build
(264 tests total). Export tests initially failed on the absent module. Type/lint/format findings were
corrected before the full checklist reran green. SDK/browser checks cover authenticated bytes, archive/
trash history, photo-free records, missing-file and foreign-access rejection, mutation waiting,
cancellation, sign-out, and downloaded ZIP payload hashes verified independently with Node crypto.

Unit coverage validates and serializes 5,000 synthetic metadata records. A separate test processed
2 GiB plus 1 KiB of synthetic photo payload through ZIP generation, yielding 22 bounded photo ZIPs and
the final metadata ZIP. Every part stayed below 100 MiB payload; the final manifest listed all 23
archives and 518 payload files. Instrumented retained payload stayed within the part cap. This proves
validated splitting; it does not measure exact browser/native Blob memory or demonstrate cloud restore.
Tiny multipart fixtures open every ZIP and verify all manifest paths, sizes, hashes, and membership.
Bad bytes, failed downloads, cancellation, and changed settings never yield a completed main manifest.

`mise exec -- npm audit --omit=dev` reports zero production dependency findings after the documented
Node gRPC override. The full audit still reports 11 development dependency findings; no audit-clean
claim is made for tooling. The existing Firebase chunk size warning remains 591.77 kB (176.82 kB gzip).
Synthetic fixtures/downloads remain ignored. No real personal backup or restore was attempted.

## Production release

Source `996ea2d` passed production build, explicit destination preflight, and ignored release preparation.
Hosting deployed successfully on 2026-10-10 under standing owner authorization. An isolated signed-out
Chromium session showed the Google button and started the redirect without console/page errors; anonymous
root, item collection, and Storage listing requests returned 403. No production inventory data/photos
were read or exported. Rules, IAM, CORS, Auth, and infrastructure were unchanged. This live-shell check
does not replace an authenticated personal export or restore test.

## Remaining gates

Strict archive validation and restore into an empty already-authorized destination remain unimplemented.
The actual iPhone/Windows acceptance scenario, large desktop-browser downloads, filesystem persistence,
and a real isolated cloud restore with matching relationships/hashes remain manual gates. The inventory
must not be described as fully dependable V1 until those recovery checks pass.
