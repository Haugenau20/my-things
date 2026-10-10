# UI refactor implementation evidence

The owner approved the ten-stage [handoff](UI_refactor/README.md), the inclusion of referenced archived rooms in filters/counts, continuous stacked PRs, and the scoped production wipe. Stacked PRs do not imply merge authorization.

## PR-01: Independent Room and Box, schema v2

Items retain a nullable room tag independently of their nullable packing box. Completing sell/give-away clears the box and preserves the room. Reopening starts unpacked. Room archiving retains existing tags; box archiving is blocked by owned contents or pending capture. Assignment transactions pair location revisions with item writes, and Trash restore preserves archived room tags while requiring a retained box to be active.

All inventory, item, location, restore and backup schemas use v2; v1 inputs are rejected. ZIP round trips retain exact photo checksums. Normal demo seeding supplies three rooms (one referenced archived room), two boxes and eight synthetic photo-free items. Browser tests seed only their owner policy and identities.

Verification actually run: `npm run lint`, `npm run typecheck`, `npm test` (155 tests), `npm run test:rules` (101), `npm run test:integration` (28), `npm run test:e2e` (26 Chromium workflows), `npm run build`, and `npm run test:rules:cloud -- --project my-things-c7305` (nine synthetic requests). The first combined check exposed a seed module-resolution error; it was corrected and the browser suite rerun successfully. The local build reports the existing large backup chunk warning.

Production maintenance deleted one verified item and one room, preserved the trusted owner root/settings, and changed only its schemaVersion to 2. Auth was untouched; the other scoped collections and photo prefix were empty. [Exact evidence](SETUP.md#executed-production-maintenance-evidence). No release occurred. The v1 app remains unavailable until the reviewed pipeline releases v2 following an owner-authorized merge.

Actual iPhone camera behavior, cloud Google sign-in/upload, and isolated real-cloud backup recovery remain manual gates from TEST_PLAN. Emulator and synthetic policy results do not establish those outcomes.
