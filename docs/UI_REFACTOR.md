# UI refactor implementation evidence

The photo delivery descriptions below record the policy during these milestones. On 2026-10-11 the
owner approved token-bearing gallery URLs; the current policy is documented in [Security](SECURITY.md).

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

## PR-04: Item cards and visible-group actions

Cards show independent room/box tags, a needs-review dot, moving decision/progress and 4:3 private thumbnails. Grouping removes redundant tags; selection checkboxes appear on hover/focus or while selecting, with a visible selected ring. The grid uses 180px minimum columns and 14px gaps, and wraps long names. Table Room and Box columns remain separate.

Group Select all adds only that visible group to selection. Eligible unpacked groups can pack into an active box or create an acknowledged box first; duplicate labels require confirmation. Packing uses the existing partial revision-checked transactions, reports every item and retains failures in selection. Results remain visible even when successful items leave the filtered group. Created boxes are retained on a later packing failure. Box groups can open their Box filter.

The three new focused Chromium workflows passed after first demonstrating the absent card tags: visible-only packing, a two-tab revision conflict with separate outcomes, and new-box acknowledgment/duplicate warnings. Synthetic screenshots and layout assertions cover 1280, 1024 and 851px widths.

`mise exec -- npm run check` passed: lint, types, 160 unit tests, 101 rules tests, 28 SDK integration tests, all 32 Chromium workflows and build. The build retains the existing backup-chunk warning. PR-03 merged at `eaace49a78af36b9245f8e84200c177d81890203`; its [production workflow](https://github.com/Haugenau20/my-things/actions/runs/38088813940) had passed Verify and was deploying when this entry was written.

PR-03 subsequently completed both Verify and Deploy production successfully in that workflow, deploying commit `eaace49a78af36b9245f8e84200c177d81890203`. PR-04 passed GitHub verification and merged at `2d5958b1da435bbc421fe51e7034251db34e98d7` under the owner’s standing authorization.

## PR-05: Contextual selection and bulk actions

The bulk bar appears only during selection or an active save. It provides the existing review, room, pack/unpack, decision, progress, category and confirmed Trash commands; Trash selection provides Restore. Command inputs and warnings appear in a popover. Results show acknowledged per-item outcomes in an expandable list; failures stay selected and all-success results remain as a dismissible status after selection clears.

Escape clears selection; Shift-click adds or removes a range in displayed order without losing other selections. A measured bar height reserves space below the grid, including when wrapped or showing results. New unit coverage verifies forward/reverse ranges and stale anchors. Focused Chromium coverage verifies contextual visibility, keyboard/range selection, Select all/Clear, last-row clearance, room changes, confirmed Trash/Restore and the existing two-tab conflict and moving-outcome workflows.

`mise exec -- npm run check` passed: lint, types, 163 unit tests, 101 rules tests, 28 SDK tests, all 35 Chromium workflows and build, including category and pack/unpack controls. Synthetic screenshots were visually inspected. The existing backup-chunk warning remains. PR-04 deployed commit `2d5958b1da435bbc421fe51e7034251db34e98d7` with both Verify and Deploy production successful in [workflow 38089346677](https://github.com/Haugenau20/my-things/actions/runs/38089346677).

## PR-06: Inspector and retained full item view

Desktop opens a 380px inspector beside the mounted filtered grid, with the inspected card ringed. Header buttons and J/K/arrows navigate the filtered list while ignoring editable controls; closing retains scroll/filter/group context. The complete item view remains available, and widths ≤850px open it directly. Cover photos retain authenticated blob retrieval; photo-free items retain acknowledged attachment/recovery controls.

Room, Box, Decision, Progress and Review save through existing partial revision-checked operations. Saving is visible, success follows acknowledgment, and failures revert quick controls while preserving unsaved detail fields. Conflict reload exposes the latest revision for an explicit Load latest action. Moving reset/completion and Trash confirmations remain inline. Details collapse in the inspector and retain explicit Save details and money validation. Full-view controls share the same confirmation logic.

Four focused inspector workflows passed after first proving the missing panel: filtered keyboard/button navigation, save-on-change and disposal confirmation/cancel, two-tab conflict rollback with retained details, and phone full-view context. Another 23 focused browser regressions passed for capture/private photos, interrupted recovery, facets, groups and bulk edits. Synthetic screenshots were inspected; the panel scrolls independently and keeps its header reachable.

`mise exec -- npm run check` passed: lint, types, 163 unit tests, 101 rules tests, 28 SDK tests, all 39 Chromium workflows and build. Inspector width checks passed at 1280, 1024 and 851px. The backup-chunk warning and actual-device/cloud acceptance gates remain. PR-05 deployed commit `a13e441ff2338618e9530b90ef549e8008e00c02`, with Verify and Deploy production successful in [workflow 38089984139](https://github.com/Haugenau20/my-things/actions/runs/38089984139).

PR-06 subsequently completed Verify and Deploy production successfully, deploying commit `f44b6c1b975bb1e24811b234ed6826e7abed34ce` in [workflow 38090761792](https://github.com/Haugenau20/my-things/actions/runs/38090761792).

## PR-07: Retained desktop capture panel

Add/N opens the shared sand-colored 380px panel beside the filtered grid. The selected active Room facet is the default, otherwise the last session room remains; room creation sits in Change room. Closing preserves name, optional details, selected source files and locked retry identity. Two slots provide temporary previews and drag-and-drop, while native camera/library controls and the two-photo limit remain. Enter saves; Cmd/Ctrl+Enter explicitly marks reviewed. Acknowledged saves clear/refocus the name and appear in a five-item thumbnail history that opens the inspector.

Creation now accepts the existing quantity/value/serial/notes/category fields under the same runtime and rules limits as metadata edits. Retry identity compares those fields, preventing a changed payload from reusing a stable attempt. New records remain unpacked/undecided/not_started, and owner-only rules, active-room transaction pairing and upload/recovery safeguards remain. No stored schema/archive change or additional wipe.

The complete local `mise exec -- npm run check` passed: lint, types, 170 unit tests, 112 rules tests, 29 SDK tests, all 42 Chromium workflows and build. New tests first demonstrated missing details, rejected owner creation, missing panel and metadata-blind retries; the implementation resolves those failures. Capture/attachment/upload/discard recovery and synthetic backup/restore regressions passed. Width checks cover 1280, 1024 and 851px, with a visually inspected synthetic screenshot. The final sticky-room placement is also checked in a focused browser rerun before publication. Real device/cloud acceptance and the existing backup-chunk warning remain.

GitHub verification caught a post-save focus timing race after the initial local pass. Focus now runs in a React effect after the acknowledged form becomes enabled, instead of relying on an animation frame. The complete local check was repeated and passed all 170 unit, 112 rules, 29 SDK and 42 browser tests plus lint/types/build before updating the PR.

## PR-08: Phone browse and bottom navigation

At ≤850px the sidebar yields to Things/Review/More tabs. More reaches overview, rooms/boxes, Trash, backup/settings and sign-out. Floating Add sits above the tabs. Room/Box and secondary picker sheets share desktop cross-counts; horizontal active chips can be cleared. A flat two-column grid uses square private thumbnails and contextual room/box tags. Full item view retains browse context; desktop grouping/table choices remain available when widening the screen. Measured bulk padding and safe-area offsets keep the final card and controls clear of the tabs. The viewport opts into safe-area coverage, with explicit top/side/bottom padding.

Three new phone workflows first demonstrated absent tabs, then passed navigation/sign-out, sheet cross-counts, retained full-view context, two columns, square cards, 44px targets and bulk clearance. Another 19 capture/editor/inspector regressions passed. Synthetic screenshots were visually inspected. The complete local check passed lint/types, 170 unit, 112 rules, 29 SDK, all 45 Chromium workflows and build. Final viewport/safe-area padding was checked with a focused phone rerun and build. Actual iPhone Safari/Home Screen and keyboard behavior remain manual gates; Chromium widths 320/390/850px do not prove them. The backup-chunk warning remains.

PR-07 deployed commit `11607b539a1ada5b247a52b04f3774f950fbeae3` with successful Verify and Deploy production in [workflow 38092322839](https://github.com/Haugenau20/my-things/actions/runs/38092322839). PR-08 deployed commit `d104c642eeeb3a17681d9ef5047c2a41d751f1a3` with both jobs successful in [workflow 38092789709](https://github.com/Haugenau20/my-things/actions/runs/38092789709).

## PR-09: Native phone capture loop

The phone now uses native camera/library selection, a focused name step, optional second photo and acknowledged saved toast before returning to shoot. Room is retained per trusted owner/device; unavailable storage is reported. Phone saves always enter review. A three-entry memory queue runs one capture at a time, pauses on failure, retains source files and stable IDs, and blocks backup until settled. Preparation failures can be edited; attempted writes require retry or explicit discard, with partial cleanup retry preserved. Five-second Undo uses revision-checked Trash. Closing retains progress and the next draft; sign-out disposes queued sources and suppresses late success while server drafts stay recoverable.

The complete local `mise exec -- npm run check` passed lint/types, 176 unit tests, 112 rules tests, 29 SDK tests, all 53 Chromium workflows and build. Six queue unit cases and eight phone workflows cover sequential acknowledgment, no early success, stable retries, full-queue backpressure, retained preparation failure, partial-discard retry, concurrent Undo, sign-out and private two-photo retrieval. An Undo conflict initially showed stale details on Open; refreshing the acknowledged index resolves that regression. Synthetic shoot/name/saved screenshots were inspected at phone widths; real iPhone camera/HEIC/keyboard/Home Screen and isolated cloud recovery remain manual gates. The existing backup-chunk warning remains.

PR-09 passed GitHub Verify in [workflow 38093733698](https://github.com/Haugenau20/my-things/actions/runs/38093733698) and merged under standing owner authorization at `a24d29ba15fadd86ad82371ccf25314a7ae63624`. Its [production workflow 38094016505](https://github.com/Haugenau20/my-things/actions/runs/38094016505) was still verifying when this entry was written; merge alone is not deployment evidence.

## PR-10: Where everything is

The final overview uses the shared Things filter for each active/referenced archived Room × Not packed/active Box/Gone cell. No room appears only when referenced by a ready nontrashed item. Totals include Gone; room-only links preserve the owned Things default, stated beside the matrix. Cell links set both facets, and row/column links set one. Sequenced requests reset search, secondary filters, grouping and selection even when the same cell is selected repeatedly. The matrix scrolls inside its bordered card with sticky Room; phone presents the same counts in a room list. Legacy documentation now describes independent tags instead of removed original/current-location concepts.

The complete local `mise exec -- npm run check` passed lint/types, 179 unit tests, 112 rules tests, 29 SDK tests, all 56 Chromium workflows and build. The new browser test first demonstrated the absent matrix, then passed cell and single-facet navigation, repeat resets, cleared selection, Gone/archived/No room parity, many-box scrolling and phone widths. Three unit cases cover shared-filter parity, totals and draft/Trash/archive exclusions. Synthetic desktop and phone screenshots were inspected. Actual iPhone camera/HEIC/keyboard/Home Screen and isolated real-cloud backup/restore remain manual gates, and the existing backup-chunk warning remains. No additional wipe or schema change.
