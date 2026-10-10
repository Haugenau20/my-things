# PR-07: Desktop capture panel

Screen **C**.

## Goal
Adding on desktop is secondary but should be quick: the same right panel, in capture mode.

## Scope
- "+ Add a thing" (or `N`) opens the panel in capture mode. If the inspector is open, it switches mode.
- Panel bg `#eeeade`, padding `28px 26px`. Eyebrow "One thing at a time", h2 "Add a thing" (Georgia 28).
- **Sticky room bar**: `#fffefa` card, "Capturing in **Bedroom**" + Change. It defaults to the Room filter currently selected, otherwise the last used room.
- Item name input (autofocused). Two photo slots (slot 1 = cover; slot 2 dashed "Add photo · Drop, choose or take"); drag-and-drop onto the slots is supported.
- ▸ Details (collapsed; optional fields as today).
- **Save & next ↵** (primary) + **Save as reviewed** (secondary). `Enter` = save & next, `Cmd/Ctrl+Enter` = save as reviewed.
- Status: "✓ Saved {name}. Ready for the next thing." (server-acknowledged only).
- "Just added · {room}": the last 3–5 saves this session with thumbnails, each clickable to open it in the inspector.
- Keep the whole `CaptureForm` attempt/retry/locked logic, error copy and photo limits unchanged. Move room creation into the room "Change" popover ("+ New room").

## Acceptance criteria
- After saving, the name field is cleared and focused, the room stays, and the new card appears in the grid.
- An interrupted capture shows "Retry this capture" exactly as today.
- Closing the panel mid-entry keeps the typed name and selected files until the page reloads.
