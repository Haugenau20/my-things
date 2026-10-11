# Current operations and acceptance

Reviewed 2026-10-11. Start here for current operating instructions and acceptance status.
Milestone documents preserve the behavior, policies and checks at the time they were written;
their historical deployment commands and pending statements are not current instructions.

## Current contracts

- Schema and backup format are **v2 only**. V1 records/archives are rejected. Room tags and box
  packing are independent; see [data model](DATA_MODEL.md) and [export contract](EXPORT_FORMAT.md).
- Only the administratively bound owner may access records or issue photo URLs. The owner approved
  token-bearing gallery URLs on 2026-10-11: copied links remain readable after sign-out until token
  revocation or object deletion. URLs stay in session memory, never records or backups. Upload
  recovery and backups still verify authenticated bytes and checksums. Clearing app URL references
  on sign-out does not revoke copied links. See [security](SECURITY.md).
- Local development and automated tests use synthetic `demo-inventory` Auth, Firestore and Storage
  emulators. Missing emulator configuration fails closed. See [local setup](SETUP.md#4-local-windows-toolchain).
- Production releases use the reviewed GitHub pipeline after an owner-authorized merge to `main`.
  Provisioning, real-data recovery and destructive maintenance require separate authorization.
  This guide neither grants that authorization nor calls for repeating completed setup.

## Evidence and remaining acceptance

| Check                                   | Current evidence                                                                                                                                                                                                                                       | Remaining boundary                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Latest verified release                 | PR #25 merged as `c6bcc093ce99726540b769340e6ede128ea76b18`; [workflow 38128423827](https://github.com/Haugenau20/my-things/actions/runs/38128423827) completed Verify and Deploy production successfully                                              | A release does not prove device or recovery acceptance                                                                            |
| Photo upload and deletion               | Owner confirmed both work in production after PR #25 on 2026-10-11; recorded in [backlog](../TODO.md) and [upload investigation](PHOTO_UPLOAD_FIX.md#2026-10-11-owner-confirmed-nullable-metadata-repair)                                              | Does not establish HEIC/camera/backgrounding, a full token audit or backup recovery                                               |
| Owner authentication                    | Owner reauthentication and another account's rejection are recorded in [decision log](DECISIONS.md#2026-10-10--owner-only-sign-in)                                                                                                                     | Broader device/session acceptance remains separate                                                                                |
| Schema-v2 cutover                       | Scoped test-data reset and preservation of the trusted root are recorded in [setup evidence](SETUP.md#executed-production-maintenance-evidence); the v2 release is recorded in [UI evidence](UI_REFACTOR.md#pr-02-workspace-shell-and-dedicated-views) | Historical completed maintenance, not a repeatable routine step                                                                   |
| Automated application/recovery coverage | Latest PR #25 local record: 180 unit, 117 rules, 30 SDK and 58 Chromium tests, plus lint/typecheck/build; [evidence](PHOTO_UPLOAD_FIX.md)                                                                                                              | Synthetic emulator results do not prove actual cloud backup/restore or device behavior                                            |
| Actual iPhone compatibility             | Pending: [TODO-009](../TODO.md#todo-009--complete-actual-iphone-compatibility-acceptance)                                                                                                                                                              | Camera/library, HEIC/JPEG/PNG, rotation, keyboard, backgrounding, interruption and Home Screen checks need actual device evidence |
| Real-cloud backup recovery              | Pending: [TODO-001](../TODO.md#todo-001--prove-real-cloud-backup-recovery)                                                                                                                                                                             | Requires separate authorization, an empty trusted-owner verification destination and saved-archive round-trip evidence            |
| First complete acceptance scenario      | Pending: [test plan](TEST_PLAN.md#7-first-real-acceptance-scenario)                                                                                                                                                                                    | Twenty real items in two rooms, iPhone-to-Windows organization and isolated cloud restore                                         |

The implemented M0–M3 application is deployed. The complete usable-V1 acceptance gate remains open.
No claim of a full production security audit or real backup/recovery proof follows from these results.

## Export and verification restore

1. Refresh all open app tabs. Finish or explicitly resolve unfinished captures, photo operations,
   deletions and restores. Avoid edits in other tabs/devices while exporting.
2. In **Backup & settings**, start a full export. Save and acknowledge every numbered photo ZIP and
   the final metadata/manifest ZIP. Keep all original filenames together, outside Firebase and this
   repository. Archives are unencrypted personal data; a browser acknowledgment cannot prove the
   files were persisted. A partial set is not a complete backup.
3. Before a real-cloud recovery exercise, obtain separate owner authorization for provisioning and
   operations on real data. A trusted administrator must provision a **separate, empty** destination
   in the existing project, retaining the existing verified owner identity. Do not use or clear the
   main inventory. Do not create another cloud project.
4. The destination root `/inventories/{verificationId}` must have exactly the current root fields:
   integer `schemaVersion: 2`, the independently verified `ownerUid`, `displayName`, explicit
   `defaultCurrency: null` or a supported selected currency, and Firestore `createdAt`/`updatedAt`
   timestamps. Use a valid, distinct inventory ID. The [data model](DATA_MODEL.md#1-paths-and-ownership)
   and [owner bootstrap contract](SECURITY.md#2-authentication-and-owner-bootstrap) are authoritative.
   Neither the browser, an archive nor a local environment variable may establish ownership.
5. Reopen the saved ZIPs in Restore backup. Set **Destination inventory ID** to the separately provisioned
   verification ID from steps 3–4; the initial value is the workspace inventory, normally `main`.
   Choose **Validate backup and destination**, inspect all parts and the dry-run summary, and confirm
   the environment and verification ID before choosing **Restore validated backup**. A nonempty
   destination or unexpected objects block a new restore; never wipe data to bypass that protection.
   Restore never imports owner authority. Restoring inventory name/default currency is optional;
   destination owner, root schema and root creation metadata remain intact.
6. After interruption, reconnect, refresh and reselect the same archive and destination. Validate,
   then choose **Resume restore**. The exact manifest/export identity and claims must match. Changed
   records, missing parts or checksum conflicts require investigation; keep the destination and
   original archive intact. Only an interrupted report with zero claims offers **Release unused
   import lock**. A completed report can be verified again with the same archive.
7. Confirm record counts, room/box relationships, grouped values, completed/trashed entries, photo
   counts and exact derivative hashes. Use **Check restored photos** to inspect representative images
   and label close-ups. Record actual browser/device versions and results without committing records,
   photos, archives, owner identifiers or token URLs. Preserve the main inventory.

See [export/restore contract](EXPORT_FORMAT.md#5-restore-behavior) for validation, resumability and
limits, and [M3 restore evidence](M3_RESTORE.md) for historical automated results. A completed report
cannot be reused for a different archive; that needs another separately authorized empty destination.

## Release, retry and rollback

Run `mise exec -- npm run check`, review the PR and obtain merge authorization. After merge, the
[GitHub pipeline](GITHUB_ACTIONS.md) reruns verification, builds production, validates the destination,
evaluates synthetic cloud policy requests and deploys Hosting, Firestore rules/indexes and Storage rules.
Record the actual deployed commit and workflow result. A PR check, build or merge alone is insufficient.

Retry through GitHub Actions on `main`; fix failures in a PR. Roll back with a reviewed revert PR
through the same pipeline. Never deploy from a local CLI, console or agent session. Reverting application
code does not restore deleted data or undo a schema change. Retain v2 support and restore-aware clients.
Use the [test plan](TEST_PLAN.md) for separately required cloud/device gates.
