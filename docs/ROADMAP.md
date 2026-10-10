# Implementation roadmap

Work in small, verifiable slices. Production releases now run only through the GitHub pipeline after
merge to `main` and successful emulator verification; see [pipeline policy](GITHUB_ACTIONS.md).
No time estimates are implied. All milestones
were initially **not implemented**. M0 is now implemented locally; see [M0 evidence](M0_FOUNDATION.md).
M1 capture is deployed; its actual-device gate remains pending. M2 organization is verified and deployed
under the owner's explicit instruction to proceed while away; see [M2 evidence](M2_ORGANIZE.md).
M3 implements permanent-deletion recovery, read-only orphan inspection, full photo export, strict archive
validation and resumable restore. Actual-device and isolated cloud recovery gates remain pending.
Its complete gate establishes usable V1; M4 is optional convenience work after observed real use.
See [M3 restore evidence](M3_RESTORE.md), [M3 export evidence](M3_EXPORT.md), [M3 recovery evidence](M3_RECOVERY.md), [M1 evidence](M1_CAPTURE.md) and
[deployment evidence](M1_RELEASE.md).

## M0 - Safe foundation

Read the documents, scaffold React/TypeScript/Vite without overwriting them, pin the toolchain, implement
the command contract, and add strict configuration validation. Start all emulators under `demo-inventory`.
Create deterministic synthetic-owner fixtures, an authenticated shell, owner-policy rules, and negative
Firestore/Storage access tests. Commit rules/index/configuration files, not personal data.

**Gate:** Lint/typecheck/build and initial rules tests pass locally. Missing emulator configuration fails
closed. An unrelated account cannot claim an inventory. No cloud access or deployment is needed to finish
the local foundation. Report any unimplemented manual cloud setup explicitly.

## M1 - Prove phone capture end to end

Implement Google sign-in in the owner's single production cloud project and release through the
pipeline. Trusted administrative bootstrap remains separately authorized. Normal development and all
automated feature tests remain on `demo-inventory` emulators.
Build name + optional-photo capture, later attachment to photo-free items, sticky capture room,
derivative generation, stable IDs, acknowledged saves,
and a minimal private gallery/detail view. Test real iPhone input and Windows output. Implement recovery
for interrupted new captures from the start, not after production use.

**Gate:** Several real-device test items survive reload, both photo variants are privately accessible,
label text is readable, failure does not look like success, and the actual OAuth/CORS/rules setup works.
Record whether HEIC conversion needs a client dependency and whether image limits need adjustment.

## M2 - Organize and pack

Implement the review inbox, optional fields/value handling, rooms, boxes, gallery/table, complete metadata
search, filters, bulk actions, independent room-tag/box semantics, moving decisions/progress, and completed archive.
Add revision conflicts and clear per-item bulk results. Keep categories simple and notes plain text.

**Gate:** The two-room/20-item workflow can be completed except the backup step. Domain tests cover the
state transitions and scope filters. Box contents and still-owned inventory remain accurate after sales.

## M3 - Dependable personal use

Complete trash/permanent-deletion recovery, owner-only orphan inspection, full export/restore, import
validation, and bounded-memory backup handling. Run the security/failure/device tests, synthetic scale
tests, and the complete real acceptance scenario. Use the existing owner-selected production project;
an empty, isolated, administrator-authorized verification inventory is required for real restore proof.
Review actual usage/billing and document production operating steps.

**Gate:** Export restores to an empty authorized verification inventory with matching photo hashes and relationships;
unauthorized data/photo access is denied; interrupted operations recover; production configuration is
reviewed. This is the earliest milestone for relying on the application as the main inventory record.

## M4 - Optional polish after real use

Add Home Screen manifest/icons, additional keyboard shortcuts, saved filters, an offline HTML export
viewer, or QR box labels when actual use justifies them. Home Screen presentation does not imply offline
data access. QR codes must open authenticated pages, not contain photo tokens or private item lists.

**Gate:** Each addition solves an observed problem and does not weaken authorization, introduce accidental
private-data caching, or create an unnecessary paid dependency.

## Deferred until explicitly reconsidered

Native iOS app; sharing/invitations; IAP; YubiKey/WebAuthn; offline synchronization; AI/OCR; marketplace
integrations; buyer/pickup management; arbitrary custom fields; shelves/storage-unit hierarchy; automated
paid backups; scheduled cleanup services; alternative photo providers. Do not prebuild infrastructure for
these merely because they may be possible later.

## Completion discipline

At each milestone, provide a small reviewable commit/diff, update implementation status in the README,
record checks actually run, and leave the next milestone as future work. Do not update documentation to
say a requirement is met until the relevant implementation and evidence exist.
