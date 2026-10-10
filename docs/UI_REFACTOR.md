# UI refactor implementation evidence

The owner approved the ten-stage [handoff](UI_refactor/README.md), the inclusion of referenced archived rooms in filters/counts, continuous stacked PRs, and the scoped production wipe. The owner subsequently explicitly authorized merging each verified PR as work proceeds. Releases still require the reviewed pipeline and successful checks.

## PR-01: Independent Room and Box, schema v2

Items retain a nullable room tag independently of their nullable packing box. Completing sell/give-away clears the box and preserves the room. Reopening starts unpacked. Room archiving retains existing tags; box archiving is blocked by owned contents or pending capture. Assignment transactions pair location revisions with item writes, and Trash restore preserves archived room tags while requiring a retained box to be active.

All inventory, item, location, restore and backup schemas use v2; v1 inputs are rejected. ZIP round trips retain exact photo checksums. Normal demo seeding supplies three rooms (one referenced archived room), two boxes and eight synthetic photo-free items. Browser tests seed only their owner policy and identities.

Verification actually run: `npm run lint`, `npm run typecheck`, `npm test` (155 tests), `npm run test:rules` (101), `npm run test:integration` (28), `npm run test:e2e` (26 Chromium workflows), `npm run build`, and `npm run test:rules:cloud -- --project my-things-c7305` (nine synthetic requests). The first combined check exposed a seed module-resolution error; it was corrected and the browser suite rerun successfully. The local build reports the existing large backup chunk warning.

Production maintenance deleted one verified item and one room, preserved the trusted owner root/settings, and changed only its schemaVersion to 2. Auth was untouched; the other scoped collections and photo prefix were empty. [Exact evidence](SETUP.md#executed-production-maintenance-evidence). No release occurred. The v1 app remains unavailable until the reviewed pipeline releases v2 following an owner-authorized merge.

Actual iPhone camera behavior, cloud Google sign-in/upload, and isolated real-cloud backup recovery remain manual gates from TEST_PLAN. Emulator and synthetic policy results do not establish those outcomes.

## PR-02: Workspace shell and dedicated views

A 200px sidebar provides Things, Review inbox, overview, rooms/boxes, Trash and Backup & settings. Browser history follows hash navigation. Admin tools are reachable from settings; the unfinished-import banner remains global. Recovery stays above Things. Capture opens with Add/N, keeps its draft while closed or navigating, and starts hidden so the inventory is first. Owner verification and sign-out moved to the sidebar footer; the narrow interim layout uses a wrapping top menu until PR-08. Export/restore retain mutation barriers and sign-out stays available.

`mise exec -- npm run check` passed: lint, types, 155 unit tests, 101 rules tests, 28 SDK tests, 27 Chromium workflows and local build. New shell coverage verifies navigation, browser Back, retained drafts and keyboard focus; existing export/restore, partial-failure and private-photo checks passed after adapting navigation.

PR-01 was merged under explicit owner authorization at commit `8f58f8892075eb9dd40d9e7730814f5e1f3185af`; [production workflow](https://github.com/Haugenau20/my-things/actions/runs/38086950305) was still running when this entry was written. Merge alone is not deployment evidence.

Both PR-01 and PR-02 subsequently completed their Verify and Deploy production jobs successfully. PR-01 deployed commit `8f58f8892075eb9dd40d9e7730814f5e1f3185af` in the workflow above. PR-02 deployed commit `e04f6217cf856ce113959904572d71151a976952` in [workflow 38087463625](https://github.com/Haugenau20/my-things/actions/runs/38087463625). The schema-v2 release followed the approved wipe and restored the application’s v2 access path. Actual owner/device checks remain separate.

## PR-03: Room × Box facets and remembered grouping

Equal Room and Box chip rows combine their filters, with counts applying the other facet and search/secondary filters. Search has the `/` focus shortcut; Decision, Progress, Review and missing-photo controls use compact popovers. Referenced archived rooms remain labeled and findable. Box All includes owned items, with Gone separately selectable. Clear controls reset their scope, selection clears when filters change, and detail navigation retains filters and explicit grouping choices. Selection headings and Room/Box/None groups use shared domain helpers.

New coverage verifies cross-counts, archived room visibility, default grouping, visible-only groups, secondary filters, Gone, keyboard focus, selection clearing and retained detail context. The initial regression run caught a missing explicit accessible name on secondary selects; it was corrected and both focused facet browser workflows passed before the final complete verification.

Verification actually run: lint, typecheck, 160 unit tests, 101 rules tests, 28 SDK integration tests and all 29 Chromium workflows passed. The combined check stopped after 21 browser passes on a Chromium `ERR_NO_BUFFER_SPACE` loopback-resource error; the complete browser suite passed on a fresh emulator/browser run with console-error assertions unchanged. The local build passed with the existing backup-chunk size warning. Real iPhone and isolated cloud recovery acceptance remain pending.
