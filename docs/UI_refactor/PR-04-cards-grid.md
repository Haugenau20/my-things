# PR-04: Item cards and grouped grid

Screen **A** (grid), screen **B** (selected card).

## Card (`.item-card` replacement)
- Container: `#fffefa`, `1px solid #deded2`, radius 10, overflow hidden.
- Photo 4:3 (the existing `PrivatePhoto` thumbnail) or the "No photo yet" placeholder (`#e8e8df`).
- Body padding `9px 11px 11px`:
  - Name (600, 13–14px) with an 8px `#84502e` dot on the right if it needs review (and an aria-label "Needs review").
  - Tag row: **room tag** (11px, bg `#e8eee4`, text `#365a3d`, radius 4) + **box tag** (monospace 11px, kraft style) or the muted text "not packed" / "gone".
  - Meta: `{decision} · {progress}` in 12px `#626b60`.
  - When grouped by Room, hide the room tag; when grouped by Box, hide the box tag (it's redundant).
- Clicking the card opens the inspector (PR-06). The checkbox appears on hover/focus at the top-left (22px, radius 5) and stays visible when any selection exists. Selected = a 2px `#263c32` ring.
- Keep the accessible names "Open {name}" and "Select {name}".

## Grouped grid
- `grid-template-columns: repeat(auto-fill, minmax(180px,1fr))`, gap 14. That gives 5 columns at full width and 3 with the panel open.
- Group header row: `border-top:1px solid #deded2; padding-top:12px`. It holds the group tag (room tag or box tag, slightly larger), the count, and right-aligned group actions:
  - Every group: **Select all** (text button).
  - Room groups inside Box = Not packed, or Not-packed groups: **Pack into box…** (primary small) → a popover listing the boxes plus "New box". It applies the existing bulk pack to that group, with per-item results.
  - Box groups: **Open box** (sets the Box filter).
- Empty state: the existing `.empty-gallery`, with copy that fits the filter.
- Table view: add Room and Box columns (replacing Location) and keep everything else.

## Acceptance criteria
- Cards never show "current room" or "original room" wording.
- A group's Pack action packs only that group's visible items and reports failures per item.
- The grid reflows from 1280 down to 850 with no overflow, and long names wrap (`overflow-wrap:anywhere`).
