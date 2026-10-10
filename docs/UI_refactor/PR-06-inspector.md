# PR-06: Inspector panel

Screen **B**.

## Goal
Edit a thing without leaving the grid. This replaces the full-page detail view as the default (the full view stays available).

## Scope
- Right panel 380px, bg `#fffefa`, `border-left:1px solid #deded2`, padding `22px 24px`. **× collapses** it, and the grid expands. The open/closed state persists.
- Header: `‹ {i} of {n} ›` (moves through the *filtered* list; keyboard `J`/`K` or arrow keys) · **Open full view** (the existing `ItemEditor` page, for photos, notes and serial) · ×.
- Photo (cover detail, 4:3, radius 8). If there's no photo: the existing `PhotoAttachment` inline.
- Title: Georgia 28px. Sub-line: review state · quantity · value.
- **Room** row: room tag + "Change" (popover select). **Box** row: box tag or "Not packed" + "Pack" / "Unpack" / "Change".
- **Decision**: a pill group (Undecided, Store, Take, Sell, Give away); active = `#365a3d` fill. **Progress**: a 3-segment control; with Undecided, only Not started is enabled (existing rule).
- **Review**: "Mark reviewed" / "Needs review" + "Next needing review" (existing `next` logic).
- **▸ Details** collapsible: quantity, value + currency, serial, category, notes (existing fields and validation, with an explicit **Save details** button).
- Footer: **Move to trash** (`#9d322d` text button, confirmed) · a status line.
- Saving: the Room, Box, Decision, Progress and Review controls save on change. Each shows "Saving…" and then "Saved", and reverts with an error message if the save fails. Confirmations (decision reset, completing sell/give away) appear inline in the panel before saving. The revision conflict banner ("changed elsewhere · Load latest") stays.

## Acceptance criteria
- Every edit the old detail page could make is possible from the inspector or the full view.
- No optimistic "Saved" before server acknowledgement.
- The selected card is ringed. Closing the panel restores the grid width and keeps the scroll position.
- The panel is not shown ≤850px (the phone opens the full view instead).
