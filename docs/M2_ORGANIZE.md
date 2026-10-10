# M2 — Organization evidence

Status: locally verified. M2 proceeds under the owner's explicit instruction to
continue while away. The outstanding M1 actual-device gate remains open.

## Behavior

- Review inbox, explicit review actions and next-item navigation; details do not change review status.
- Quantity, total estimated value/currency, serial numbers, category, and plain-text notes.
- Exact decimal parsing and a pinned currency precision table; unknown differs from zero. Defaults are
  future-entry suggestions, never conversions of existing amounts. No mixed-currency total is shown.
- Grid/table with shared selection, complete metadata search, current/original-location filters,
  decision/progress/review filters, owned/archive/trash scopes, and missing-photo filtering.
- Stable-ID rooms and boxes: create, rename, sort, notes, archive/reactivate, contents navigation, and
  duplicate-label warnings. Capture selects an existing active room when its name matches.
- First-room preservation, packing, separate original-room correction, and explicit outcome transitions.
  Completing sales/donations clears current location; reopening does not invent a location.
- Partial-field, revision-checked item and location edits. Bulk metadata writes are serial to avoid
  shared-destination contention; each result remains visible and failures remain selected.
- Reversible trash/restore preserves photos and workflow. Restore into an archived physical location
  requires explicit location reactivation first, keeping item fields intact. Permanent deletion is M3.

## Integrity boundaries

No schema fields or versions change; no production records are migrated. Capture/move/owned-restore
transactions touch the destination's existing revision, and rules enforce that paired write. Archive
inspection reads the location before checking all server item pages, then compares that revision in a
transaction. A concurrent incoming assignment invalidates the inspection. Pending captures also block
archive. Rules cannot prove collection-wide emptiness; an owner manually bypassing the application can
still archive an occupied location. Ownership and field/transition constraints remain enforced.

Search is enabled after every metadata page loads successfully; failures leave an explicit incomplete
index state. This is a refreshed in-memory index, not an atomic cross-tab snapshot. A concurrent change
may appear at the next refresh. Revision checks protect subsequent edits. Synthetic 5,000-record domain
filter coverage does not establish photo-heavy browser performance at that scale.

Metadata rules validate scalar types, currencies, immutable fields, destination references, workflow and
timestamp transitions. Unchanged photo metadata stays immutable; existing full photo validation remains
on photo operations. No public URLs, new infrastructure, Analytics, or App Check dependency is added.

The currency table is pinned from Node 24.21's Intl/ICU data rather than depending on each browser's
current table. See [ECMA-402 currency digits](https://tc39.es/ecma402/#sec-currencydigits) and
[Unicode currency data](https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml).
Changing supported precision later requires an explicit data-semantics review; it must not reinterpret
existing minor-unit values.

## Verification record

`mise exec -- npm run check` passed on 2026-10-10: ESLint/Prettier, strict TypeScript, 112 unit tests,
91 Firestore/Storage authorization tests, 15 real-SDK emulator integration tests, 20 Chromium browser
tests, and the local build (238 tests total). The SDK scenarios include twenty items in two rooms,
packing/disposal/trash/restore, an archive/capture race, and loading 260 additional items across actual
250-document pages. Browser coverage includes shared grid/table selection, serial zeroes, zero value,
searching notes, original-room preservation after packing/rename, occupied-location archive rejection,
two-tab mixed bulk outcomes, and phone-width currency/default edits. New organization browser tests
also assert no console errors or uncaught page errors.

The shared Firebase chunk remains 591.77 kB (176.82 kB gzip), producing Vite's existing size warning.
No dependency or toolchain changes were needed. Synthetic screenshots remain ignored.

Initial domain tests failed because the new module was absent. Positive
metadata/box rules and the twenty-item SDK scenario failed against the previous write policy. The
archive/restore regression then reproduced restoring into an archived room. A direct move without a
destination revision initially succeeded, then was denied by the paired-write policy. Browser scenarios
initially failed on absent controls; subsequent selector/key issues were corrected during verification.

## Manual gates and future work

Actual iPhone camera/HEIC/readability and Windows cross-device capture remain pending. The real twenty-item
acceptance scenario is not replaced by emulator fixtures. Full export/restore, interrupted permanent
deletion, orphan maintenance, a real cloud restore destination, and large photo-backup proof belong to M3.
Home Screen mode remains unadvertised. No complete backup or production security-audit claim is made.
