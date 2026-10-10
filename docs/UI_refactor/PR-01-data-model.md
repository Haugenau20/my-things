# PR-01: Room tag + Box state data model (clean schema, database wipe allowed)

## Goal
Replace "current location (room | box | unassigned) + original room" with two independent facets:
- `roomId: string | null`: where the thing belongs (a permanent tag).
- `boxId: string | null`: where it is packed. `null` = not packed.
- **Gone** is derived: `isDisposed(item)` (sell/give_away + completed). A gone item has `boxId = null` and keeps `roomId`.

## Owner decision: no migration
The app is brand new and the database holds a single test item. **Wipe the inventory data and redesign the schema cleanly.** Do not write migration code, and do not keep backward compatibility for legacy fields or old export archives. Bump `schemaVersion` to 2 everywhere (items, export manifest) and reject v1 documents/archives with a clear error.

Keep: the owner/inventory authorization documents and the bootstrap (don't lock the owner out). Wipe items, rooms, boxes, restore reports and the item photo objects in Storage. Document the exact wipe steps (emulator + production) in `docs/SETUP.md`, and require explicit owner confirmation before running against production.

## Scope
- `src/domain/item.ts`: item schema v2 with `roomId`, `boxId`. Remove `currentLocation` and `originalRoomId` entirely.
- `src/domain/organize.ts`:
  - Commands: `setRoom(roomId|null)`, `pack(boxId|null)` (null = unpack). Remove `move` and `original`.
  - Completing sell/give_away sets `boxId = null` (→ Gone) and **keeps `roomId`**. Reopening → Not packed. `pack` on a gone item is rejected ("Reopen first").
  - `filterItems` filters: `search`, `room` (id | 'none' | ''), `box` (id | 'unpacked' | 'gone' | ''), `decision`, `progress`, `reviewStatus`, `missingPhotos`, `trash: boolean`. Box `''` = still owned (excludes Gone).
  - Helper `boxState(item): 'unpacked' | 'gone' | { boxId }`, used by the UI and the overview.
- Capture (`capture-repository`, `media/capture.ts`): a new item gets `roomId` from the capture room and `boxId: null`.
- Room/box archiving: archiving a box requires that it holds no owned items (existing rule). Archiving a room is allowed while things are tagged with it; the tag stays readable as "{name} (archived)" and the room disappears from the capture pickers.
- Firestore rules + rules tests for schema v2. Indexes as needed for the new filters (`firestore.indexes.json`).
- Backup/export/restore: v2 format only. Update `docs/EXPORT_FORMAT.md`.
- Docs: rewrite SPEC LOC-01, DATA_MODEL location semantics and TEST_PLAN. Add to DECISIONS.md: "Room is a permanent tag; Box is the packing state; room-move history is intentionally not kept; v1 data was wiped (2026-10)".
- Update `scripts/seed.ts` with v2 synthetic data (≥2 rooms, ≥2 boxes, some gone, some photo-free) so every screen has data locally.

## Acceptance criteria
- Packing, unpacking and re-boxing never change `roomId`.
- Completing sell/give_away → Gone with the room preserved. Reopening → Not packed.
- An item can't be both packed and gone.
- An export → restore round trip of v2 data passes, with photo checksums.
- Rules: another account still cannot read or write anything, and v1-shaped writes are rejected.
- The seeded local inventory renders in every new screen.
