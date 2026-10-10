# PR-03: Room × Box chip filters, search, group-by

Screen **A**.

## Goal
Room and Box are both top-level, equal-weight filters that are always visible, take one click, and combine.

## Scope (replaces the `browse-filters` fieldset in `InventoryBrowser.tsx`)
- **Search** input, full width, height 44, placeholder "Search name, serial, notes or category". Shortcut `/` focuses it. The metadata-ready gating stays.
- To the right of search: compact popover chips **Decision ▾ · Progress ▾ · Review ▾**, plus **Missing photos** inside a "More ▾" popover. An active secondary filter shows its value and a ×.
- **Facet block** (bg `#f2f0e8`, radius 10, padding `14px 16px`, a 2-column grid `52px | 1fr`):
  - Row label `ROOM` (10px, 650, letter-spacing 1.4px, `#365a3d`). Chips: `All`, each active room, and `No room` if any exist. Pill radius 16. Active = `#263c32` fill with `#faf8f3` text. Inactive = `#fffefa` with a `#b7b8a8` border. Each chip shows its count at 60% opacity.
  - Row label `BOX` (`#84613f`). Chips in monospace with radius 6 (box-label look): `All`, `Not packed`, each active box, `Gone`. Active = `#84613f` fill with white text. Inactive = `#f7f0df` with a `#c6a77c` border.
  - Chips are `flex:none; white-space:nowrap` and wrap to the next line as needed.
  - Single-select per row. Room ∩ Box combine. **Each row's counts are computed with the other row's selection applied** (cross-filtered), so a box chip with 0 for the selected room shows greyed out.
- **Heading row**: Georgia 34px title describing the selection ("Not packed", "Bedroom", "Bedroom in B003", "All things"), a count line ("98 things in 5 rooms"), and on the right **Group by [Room | Box | None]**. Default grouping: Room when Box is selected, Box when Room is selected, None when both or neither are selected. Remember the user's last explicit choice.
- **Grid | Table** toggle stays (it can sit next to Group by).
- Persist filters, group-by and scroll position in session state. Returning from the inspector or full view restores them (SPEC usability requirement).
- The Review inbox nav item = Review: Needs review. Trash nav = trash scope (the facet block is hidden, or shows Room only).

## Acceptance criteria
- Selecting Bedroom + Not packed shows exactly the unpacked bedroom things, and the counts in both rows update.
- Clear (×) on any chip, and "Clear all", restore the defaults (Room All, Box All = still owned).
- Changing a filter clears the selection (existing behaviour).
- Search across the whole inventory is disabled with a clear message while metadata is loading.
