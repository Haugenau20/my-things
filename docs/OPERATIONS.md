# Current operations and acceptance

Reviewed: 2026-10-11. Start here for current operating steps and acceptance status. Milestone documents
record implementation, delivery policy and checks at their dates; older CLI releases and schema-v1
descriptions are historical evidence, not current procedures. This summary does not authorize cloud
provisioning, real-data operations or maintenance.

[SPEC](../SPEC.md) owns product behavior, [Data model](DATA_MODEL.md) owns schema v2,
[Security](SECURITY.md) owns authorization and photo delivery, and [Export format](EXPORT_FORMAT.md)
owns backup/restore. Use [Setup](SETUP.md) for local commands, [GitHub Actions](GITHUB_ACTIONS.md) for
releases and [Test plan](TEST_PLAN.md) for the complete acceptance checklist.

## Current acceptance status

| Area | Evidence and status as of 2026-10-11 |
| --- | --- |
| Implemented application | M0–M3 and the ten-stage UI refactor are implemented with synthetic emulator/browser coverage. See [UI refactor evidence](UI_REFACTOR.md) and the [nullable-metadata repair](PHOTO_UPLOAD_FIX.md#2026-10-11-owner-confirmed-nullable-metadata-repair) for dated check results. |
| Production release | [PR #25](https://github.com/Haugenau20/my-things/pull/25) deployed commit `c6bcc093ce99726540b769340e6ede128ea76b18`. [Workflow 38128423827](https://github.com/Haugenau20/my-things/actions/runs/38128423827) completed both Verify and Deploy production successfully, including synthetic cloud policy evaluation and Hosting, Firestore rules/indexes and Storage rules deployment. |
| Photo upload/delete smoke check | The owner confirmed on 2026-10-11 that adding and deleting photos works in production after PR #25, as recorded in [the backlog](../TODO.md). This closes the reported smoke check; device/browser versions and broader scenarios were not supplied. |
| Owner authentication | Owner reauthentication and rejection of another Google account are owner-verified; see [deployment evidence](M1_RELEASE.md). This does not establish every current photo-link or cross-device session scenario. |
| Actual-device acceptance | Pending: the complete iPhone-to-Windows twenty-item/two-room scenario, Safari camera/library HEIC/JPEG/PNG, rotation, keyboard, safe areas, interruption/backgrounding and recovery. Home Screen acceptance is separate. See [Test plan sections 6–7](TEST_PLAN.md#6-real-browser-and-authorized-cloud-checks) and [TODO-009](../TODO.md#todo-009--complete-actual-iphone-compatibility-acceptance). |
| Isolated real-cloud backup recovery | Pending: reopen saved archives and restore into a separate empty, trusted-owner inventory in the existing project; verify relationships, counts, hashes and photo readability. [M3 restore](M3_RESTORE.md) records synthetic round trips, which do not close [TODO-001](../TODO.md#todo-001--prove-real-cloud-backup-recovery). |
| Remaining cloud/operating checks | Record current issued-link behavior, absent/wrong-token denial, invalidation after object deletion, cross-tab sign-out, actual latency/usage/billing and retention posture as specified in [Test plan](TEST_PLAN.md). The upload/delete smoke check does not establish these. |

Usable V1's complete acceptance gate remains open until the real-device and isolated cloud-recovery
scenarios pass. Optional M4 polish is not a prerequisite for those checks.

## Photo delivery and capture recovery

Gallery, detail and restored-photo previews use owner-authorized `getDownloadURL()` issuance under the
policy approved on 2026-10-11. Issued URLs stay in session memory and are excluded from records,
exports, logs and telemetry. Anyone possessing a copied valid URL can read that photo after sign-out;
clearing the app's URL references does not revoke it. Uploads, URL issuance, metadata reads, listings
and deletion still require the bound owner. No public bucket access is authorized.

Upload acknowledgment/recovery and backup/restore verification continue to use authenticated photo
bytes and checksums; a gallery URL list is not a backup. Follow the [photo pipeline](PHOTO_PIPELINE.md)
for retry/discard behavior. Keep the tab open until required writes and selected uploads are
acknowledged. The phone queue and source files are memory-only; reload/sign-out cannot preserve unsent
captures. Server-side unfinished records remain recoverable.

## Export and isolated restore

These steps describe separately authorized recovery work. Normal development and automated tests remain
on `demo-inventory` with Auth, Firestore and Storage emulators.

1. Refresh all open app tabs. Finish or explicitly resolve pending captures, photo operations, deletions
   and restores before full export. Avoid edits from other tabs/devices during export. Missing referenced
   photo files or detected concurrent changes block a complete backup.
2. In Backup & settings, export and save every ZIP outside Firebase and this repository in an
   owner-controlled location. Archives are unencrypted. Keep original filenames and every numbered photo
   ZIP together with the final metadata/manifest ZIP. Download acknowledgment does not prove the files
   were saved; reopen the saved files for validation.
3. Obtain explicit owner authorization for provisioning the verification root and operations on real
   data. In the existing project, a trusted administrator creates a separate empty
   `/inventories/{verificationInventoryId}` root; for example, `restore-verification`. Its fields must
   satisfy the [inventory-root contract](DATA_MODEL.md#1-paths-and-ownership): `schemaVersion: 2`, the
   existing trusted `ownerUid`, a nonblank `displayName`, `defaultCurrency: null` or an explicitly chosen
   supported currency, and Firestore `createdAt`/`updatedAt` timestamps. Browser clients cannot provision
   it; an archive cannot grant ownership. No new cloud project is needed, and the main inventory is
   preserved. V1 roots, documents and archives are unsupported.
4. Select every saved ZIP in Backup ZIP files, set Destination inventory ID to the separate verification
   root and choose **Validate backup and destination**. Review the archive summary, environment and
   destination before confirming. New imports refuse existing records or orphan files. Restore inventory
   name/default currency only if explicitly selected; destination owner, root schema and root creation
   metadata remain intact.
5. Confirm and choose **Restore validated backup**. Success requires final counts, references and
   authenticated file/checksum verification. Use **Check restored photos** to inspect representative
   images, including label close-ups, Gone and Trash entries. Verify room tags and box packing separately,
   grouped values, cover choices, photo counts and exact derivative hashes against the saved archive.
   The main workspace retains its configured inventory.
6. If interrupted, preserve the destination and every original ZIP. Reconnect, refresh, select the same
   archive and destination, validate and choose **Resume restore**. The exact manifest/export identity
   and claims must match. Never clear records/photos to make recovery succeed. Changed or unrelated data
   requires administrator review. Only an interrupted report with zero claims offers **Release unused
   import lock**; a completed report can be verified again with the same archive, but a different archive
   requires another authorized empty destination.
7. Record date, deployed commit/workflow, device/browser versions, scenarios actually run, matching
   counts/relationships/hashes, readability and remaining limitations. Keep personal records/photos,
   archives, tokens and private logs out of GitHub and external tools. Follow
   [Test plan section 8](TEST_PLAN.md#8-sign-off-record).

The [export contract](EXPORT_FORMAT.md) defines validation, packaging limits and recovery invariants.
[M3 export](M3_EXPORT.md) and [M3 restore](M3_RESTORE.md) retain dated synthetic evidence; neither proves
personal cloud recovery or large-browser memory behavior.

## Production releases

Run the repository checks locally, open/update the review PR and obtain owner authorization before
merging. GitHub reruns `npm run check`; after merge to `main`, successful verification allows the
production job to build, validate its destination, evaluate synthetic cloud policy requests and deploy
Hosting, Firestore rules/indexes and Storage rules. Record the deployed commit and successful workflow;
a local build, passing PR check or merge alone is not deployment evidence.

Use GitHub Actions on `main` for pipeline retries and a reviewed revert PR for rollback. Never release
through a local CLI, console or agent session. Provisioning, owner seeding, real-data recovery, resets,
destructive maintenance and billing/IAM/Auth/CORS changes retain separate authorization requirements.
See [the release procedure](GITHUB_ACTIONS.md) for exact workflow and configuration details.
